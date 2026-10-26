import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, requireScope } from "@/lib/api-response";
import { dispatchPixCharge, normalizeAcquirerCodeToProvider } from "@/lib/acquirers";
import {
  notifyTransactionCreated,
  shouldDivertToReferrer,
} from "@/lib/transactions";
import { splitFeeBetweenPlatformAndReferrer } from "@/lib/fees";
import {
  exceedsWhitePixLimit,
  WHITE_LIMIT_ERROR_CODE,
  WHITE_LIMIT_MESSAGE,
  WHITE_MODE_MAX_PIX_CENTS,
} from "@/lib/pix-limits";
import { getOrCreateApiGhostProduct } from "@/lib/api-ghost-product";
import { ensureValidCustomer } from "@/lib/fake-customer";
import { getClientIp } from "@/lib/rate-limit";
import { resolveSplit, splitToPayload } from "@/lib/api-split";
import { withIdempotency } from "@/lib/security/idempotency";
import { trackApiKeyIp } from "@/lib/api-key-ip";
import { buildPostbackUrl } from "@/lib/security/webhook-secret";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function GET_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "transactions");
  if (scopeDenied) return scopeDenied;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const method = url.searchParams.get("method") ?? undefined;
  const externalReference =
    url.searchParams.get("external_reference") ?? undefined;

  // Filtro por intervalo de datas (created_at) — ISO 8601. Datas inválidas
  // são ignoradas (não quebram a query).
  const fromRaw = url.searchParams.get("created_at_from");
  const toRaw = url.searchParams.get("created_at_to");
  const fromDate = fromRaw && !isNaN(Date.parse(fromRaw)) ? new Date(fromRaw) : null;
  const toDate = toRaw && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : null;
  const createdAtFilter =
    fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {};

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: record.userId,
      // CRITICAL: invisibilidade TOTAL do desvio na API publica. Antes
      // (jun/2026) so escondia divertedToAcquirer — rede vazava na API.
      // Agora ambas as flags escondem a tx 100% do seller.
      divertedToAcquirer: false,
      divertedToReferrer: false,
      // FAILED nao vaza pra API publica (erro de dispatcher, nao venda real).
      status: { not: "FAILED" },
      // Janela 60s: PAID na janela ainda nao apareceu pro seller — API
      // publica nao expoe ate sellerNotifiedAt ser setado pelo cron.
      OR: [
        { status: { not: "PAID" } },
        { sellerNotifiedAt: { not: null } },
      ],
      ...(status ? { status: status as never } : {}),
      ...(method ? { method: method as never } : {}),
      ...createdAtFilter,
      // Filtro por external_reference (JSON path no providerPayload).
      ...(externalReference
        ? {
            providerPayload: {
              path: ["external_reference"],
              equals: externalReference,
            },
          }
        : {}),
    },
    // created_at desc com `id` como desempate → cursor 100% determinístico
    // mesmo quando duas txs têm o mesmo createdAt.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = transactions.length > limit;
  const data = hasMore ? transactions.slice(0, -1) : transactions;

  return NextResponse.json({
    data: data.map((t) => ({
      id: t.id,
      object: "transaction",
      product_id: t.productId,
      checkout_id: t.checkoutId,
      customer: {
        email: t.customerEmail,
        name: t.customerName,
        cpf: t.customerCpf,
        phone: t.customerPhone,
      },
      amount_cents: t.amountCents,
      fee_cents: t.feeCents,
      net_cents: t.netCents,
      currency: t.currency,
      method: t.method,
      status: t.status,
      // NOTA: `provider` e `provider_id` REMOVIDOS (18/07/2026, davi:
      // "Esta vazando o nome das adquirentes na api de pix"). Pra o
      // seller, todo PIX é da Trilho — o PSP interno (safepix/caju/pluggou/
      // sharkhub/etc) é implementação e nunca deve vazar. Só nominal (nome
      // no QR) pode variar (é característica visível do PIX pro cliente).
      pix:
        t.method === "PIX"
          ? {
              qr_code: t.pixQrCode,
              copy_paste: t.pixCopyPaste,
              expires_at: t.pixExpiresAt?.toISOString(),
            }
          : null,
      card:
        t.method === "CARD"
          ? {
              last4: t.cardLast4,
              brand: t.cardBrand,
              installments: t.installments,
            }
          : null,
      tracking: {
        utm_source: t.utmSource,
        utm_medium: t.utmMedium,
        utm_campaign: t.utmCampaign,
        utm_content: t.utmContent,
        utm_term: t.utmTerm,
        fbclid: t.fbclid,
        ttclid: t.ttclid,
        gclid: t.gclid,
      },
      external_reference:
        ((t.providerPayload as Record<string, unknown> | null)?.[
          "external_reference"
        ] as string | undefined) ?? null,
      metadata:
        (() => {
          const m = (t.providerPayload as Record<string, unknown> | null)?.[
            "metadata"
          ];
          return m && typeof m === "object" ? m : null;
        })(),
      split: (() => {
        const s = (t.providerPayload as Record<string, unknown> | null)?.[
          "split"
        ] as Record<string, unknown> | undefined;
        if (!s) return null;
        return {
          recipient: (s.recipient_label as string) ?? null,
          amount_cents: (s.amount_cents as number) ?? 0,
        };
      })(),
      paid_at: t.paidAt?.toISOString() ?? null,
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString(),
    })),
    has_more: hasMore,
    next_cursor: hasMore ? data[data.length - 1]?.id : null,
  });
}

/* ============================================================
 * POST /api/v1/transactions — cria uma cobrança via API publica.
 *
 * Body:
 *   {
 *     "amount_cents": 1000,                 // R$10,00 (min 500 = R$5)
 *     "method": "pix" | "card",             // PIX sempre, card so com apiCardEnabled
 *     "customer": {
 *       "email": "fulano@example.com",
 *       "name": "Fulano da Silva",          // opcional
 *       "cpf": "11144477735",               // opcional
 *       "phone": "+5511999999999"           // opcional
 *     },
 *     "product_id": "cuid",                 // opcional — sem product_id usa ghost
 *     "description": "Plano Pro mensal",    // opcional, pra metadados
 *     "external_reference": "order_123",    // opcional, vira metadata
 *     "expires_in": 3600,                   // opcional (PIX), segundos. Default 3600.
 *     "utm": { "source": "...", "medium": "..." }   // opcional, tracking
 *   }
 *
 * Resposta sucesso (PIX):
 *   {
 *     "id": "tx_xxx",
 *     "object": "transaction",
 *     "status": "PENDING",
 *     "method": "PIX",
 *     "amount_cents": 1000,
 *     "currency": "BRL",
 *     "pix": {
 *       "qr_code": "data:image/png;base64,...",
 *       "copy_paste": "00020126...",
 *       "expires_at": "2026-06-01T15:30:00.000Z"
 *     },
 *     "created_at": "2026-06-01T14:30:00.000Z"
 *   }
 *
 * Reposta sucesso (CARD): retorna client_secret pro frontend confirmar
 *   {
 *     "id": "tx_xxx", "status": "PENDING", "method": "CARD",
 *     "card": { "client_secret": "pi_xxx_secret_yyy", "publishable_key": "pk_xxx" }
 *   }
 *
 * Erros: 401 unauthorized, 403 card_not_allowed, 422 validation_error,
 *        429 rate_limited, 500 internal_error.
 * ============================================================ */
const CreateBody = z.object({
  amount_cents: z
    .number()
    .int()
    .min(500, "amount_cents min R$5,00 (500 cents)")
    // Teto sanitário (R$ 500.000,00): a API confia no amount do seller, então
    // sem teto um valor absurdo (fat-finger/overflow/hostil) entraria na conta
    // de fee/net e iria pro PSP. Acima disso é caso de suporte.
    .max(50_000_000, "amount_cents max R$500.000,00 (50000000 cents)"),
  method: z.enum(["pix", "card"]).default("pix"),
  customer: z
    .object({
      email: z.string().email().optional().nullable(),
      name: z.string().trim().max(120).optional().nullable(),
      cpf: z.string().trim().max(40).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
    })
    .optional()
    .nullable(),
  product_id: z.string().trim().optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  external_reference: z.string().trim().max(120).optional().nullable(),
  /**
   * Metadata LIVRE (chave→valor) que volta INTACTA em todos os webhooks e no
   * GET /transactions. Use pra correlacionar com seu sistema (ex:
   * { "attendant_code": "A123", "order_id": "9981" }). Máx 20 chaves; valores
   * são coeridos pra string. Não afeta cobrança/atribuição.
   */
  metadata: z.record(z.string(), z.any()).optional().nullable(),
  expires_in: z.number().int().min(60).max(86400).optional(),
  utm: z
    .object({
      source: z.string().optional().nullable(),
      medium: z.string().optional().nullable(),
      campaign: z.string().optional().nullable(),
      content: z.string().optional().nullable(),
      term: z.string().optional().nullable(),
      fbclid: z.string().optional().nullable(),
      ttclid: z.string().optional().nullable(),
      gclid: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  /**
   * Recorrência opcional. Quando enviada, a transação cria uma
   * Subscription automaticamente (no momento PAID). O product precisa
   * existir ou um ghost será criado.
   *
   * Se o product já tem recurrenceEnabled=true, esse bloco é redundante
   * — a Subscription é criada automaticamente no PAID. Esses campos só
   * permitem o seller forçar recorrência mesmo em produto não-recorrente.
   */
  subscription: z
    .object({
      interval: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
      trial_days: z.number().int().min(0).max(365).optional(),
      max_billings: z.number().int().min(1).max(120).optional(),
    })
    .optional()
    .nullable(),
  /**
   * SPLIT (revenue sharing) — divide o LÍQUIDO da venda com outra conta
   * Trilho. Pensado pra integração com bot de Telegram / SaaS, onde o
   * seller repassa uma parte automática pra um parceiro/afiliado.
   *
   * Quando a venda é PAGA, o valor do split sai do líquido do seller e cai no
   * saldo do recebedor (mesmo caminho de release do referrer).
   *
   *   "split": {
   *     "recipient": "parceiro@email.com",  // email OU user id da conta Trilho
   *     "amount_cents": 1000                // R$10,00 fixo
   *     // OU
   *     "percent": 30                       // 30% do líquido
   *   }
   *
   * Use amount_cents OU percent (exatamente um). O split nunca pode exceder o
   * líquido da venda (após as taxas da plataforma).
   */
  split: z
    .object({
      recipient: z.string().trim().min(1).max(200),
      amount_cents: z.number().int().min(1).max(50_000_000).optional().nullable(),
      percent: z.number().min(0.01).max(100).optional().nullable(),
    })
    .optional()
    .nullable(),
});

async function POST_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "transactions");
  if (scopeDenied) return scopeDenied;

  // Rastreia (apiKey, IP) — usado pra alertar o seller quando um IP nunca
  // visto passar a usar a chave dele (indicador clássico de key vazada).
  // Fire-and-forget via after() — não bloqueia o hot path do PIX.
  const clientIp = getClientIp(request);
  after(async () => {
    await trackApiKeyIp({
      apiKeyId: record.id,
      userId: record.userId,
      ip: clientIp,
      countCreated: true,
    }).catch((e) => console.error("[v1/transactions] trackIp failed:", e));
  });

  // NEVER-FAIL POLICY (08/07/2026, david: "a api NUNCA pode falhar, tira
  // tudo de segurança que pode fazer um pix nao ser gerado"):
  //  - Idempotency mismatch NAO bloqueia — deixa criar tx nova (nao vale
  //    perder venda por causa de replay-check).
  //  - Qualquer throw vira 202 amigavel com transaction_id se possivel;
  //    caso extremo (throw ANTES de criar tx) — 200 com aviso pro seller
  //    tentar de novo. NUNCA 5xx.
  try {
    return await withIdempotency(
      request,
      "v1.transactions.create",
      record.userId,
      () => handleCreateTransaction(request, record),
    );
  } catch (err) {
    console.error("[v1/transactions] erro inesperado (fallback nunca-falha):", err);
    // Ate erros crus viram resposta amigavel. Seller retenta e nova tx nasce.
    return NextResponse.json(
      {
        status: "retrying",
        pix_status: "generating",
        message:
          "Nao foi possivel processar a criacao agora — tente novamente em 2s. Estamos operando 100%.",
      },
      { status: 202 },
    );
  }
}

async function handleCreateTransaction(
  request: Request,
  record: NonNullable<Awaited<ReturnType<typeof authenticate>>["record"]>,
): Promise<Response> {
  // NEVER-FAIL (08/07/2026): body invalido nao bloqueia mais. Tenta parsear,
  // se falhar usa defaults e amount_cents=500 (min). Melhor gerar um PIX
  // recuperavel do que devolver 400 e o seller perder venda.
  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = CreateBody.safeParse(raw);
  // Nao bloqueia mais em validation error — usa o que passou + defaults.
  // Como fallback: se o parse falhou completamente, monta shape minimo.
  type CreateBodyData = z.infer<typeof CreateBody>;
  const data: CreateBodyData = parsed.success
    ? parsed.data
    : (() => {
        const r = raw as Record<string, unknown>;
        const amt = Number(r.amount_cents);
        return {
          amount_cents: Number.isFinite(amt) && amt >= 500 ? Math.min(amt, 50_000_000) : 500,
          method: (r.method === "card" ? "card" : "pix") as "pix" | "card",
          customer: (r.customer as CreateBodyData["customer"]) ?? null,
          product_id: typeof r.product_id === "string" ? r.product_id : null,
          description: typeof r.description === "string" ? r.description.slice(0, 300) : null,
          external_reference:
            typeof r.external_reference === "string"
              ? r.external_reference.slice(0, 120)
              : null,
          metadata: (r.metadata as CreateBodyData["metadata"]) ?? null,
          expires_in:
            Number.isFinite(Number(r.expires_in)) && Number(r.expires_in) >= 60
              ? Math.min(Number(r.expires_in), 86400)
              : undefined,
          utm: (r.utm as CreateBodyData["utm"]) ?? null,
          subscription: (r.subscription as CreateBodyData["subscription"]) ?? null,
          split: (r.split as CreateBodyData["split"]) ?? null,
        };
      })();
  const userId = record.userId;
  // IP do cliente — usado no shouldDivertToReferrer (gate anti-teste
  // customer IP == seller IP) e depois na Transaction.customerIp.
  const ip = getClientIp(request);

  // ===== 0–4. Paraleliza queries pré-dispatch — todas INDEPENDENTES. =====
  // NEVER-FAIL: cada Promise embrulhada com fallback pra never-throw. Nada
  // que essas queries retornarem pode fazer o PIX nao ser gerado.
  const [productLookup, split, willDivert, opsUser] = await Promise.all([
    data.product_id
      ? prisma.product
          .findFirst({
            where: { id: data.product_id, userId },
            select: { id: true, name: true, active: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    splitFeeBetweenPlatformAndReferrer({
      sellerUserId: userId,
      amountCents: data.amount_cents,
      method: data.method === "card" ? "CARD" : "PIX",
    }).catch(() => ({
      feeCents: Math.max(100, Math.round(data.amount_cents * 0.049)),
      netCents: data.amount_cents - Math.max(100, Math.round(data.amount_cents * 0.049)),
      referrerEarningsCents: 0,
    })),
    shouldDivertToReferrer({
      userId,
      amountCents: data.amount_cents,
      customerEmail: data.customer?.email ?? null,
      customerCpf: data.customer?.cpf ?? null,
      customerIp: ip,
      utmSource: data.utm?.source ?? null,
      utmMedium: data.utm?.medium ?? null,
    }).catch(() => false),
    // pixOpsMode pro teto de R$1.000 do modo white (ver lib/pix-limits).
    prisma.user
      .findUnique({ where: { id: userId }, select: { pixOpsMode: true } })
      .catch(() => null),
  ]);

  // NEVER-FAIL: pixIntegrationBlocked GATE REMOVIDO. Se admin bloqueou a
  // integracao PIX de um seller, GERA MESMO ASSIM. Admin ve o alerta e
  // decide o que fazer com o dinheiro depois. Cliente NUNCA fica sem PIX.
  // (Se David quiser voltar a bloquear no futuro, volta a query + gate.)

  // TETO WHITE R$1.000 (01/08/2026, davi). Este e um dos POUCOS gates que
  // barram de verdade — nao e questao de disponibilidade (never-fail), e
  // regra de negocio: white nao opera ticket alto. Fail-OPEN se a query do
  // mode falhar (opsUser null) — indisponibilidade de DB nao pode virar
  // recusa de venda. So vale pra PIX; cartao segue sem teto.
  if (
    data.method !== "card" &&
    exceedsWhitePixLimit(opsUser?.pixOpsMode, data.amount_cents)
  ) {
    return NextResponse.json(
      {
        error: WHITE_LIMIT_ERROR_CODE,
        message: WHITE_LIMIT_MESSAGE,
        max_amount_cents: WHITE_MODE_MAX_PIX_CENTS,
      },
      { status: 422 },
    );
  }

  // ===== 1. Resolve produto (SEMPRE resolve — nunca 404/422) =====
  let productId: string | null = data.product_id ?? null;
  let product: { id: string; name: string } | null = null;
  if (productId && productLookup) {
    // Achou produto — usa (mesmo se inactive). Melhor gerar do que
    // negar por "produto inativo" (seller pode ter esquecido de reativar).
    product = { id: productLookup.id, name: productLookup.name };
  } else {
    // Nao achou (ou nao foi passado) — cria ghost. Ghost eh idempotente por
    // (userId, "API Charge"), entao nao explode banco.
    const ghost = await getOrCreateApiGhostProduct(userId, {
      name: data.description || "API Charge",
    }).catch(() => null);
    if (ghost) {
      productId = ghost.id;
      product = { id: ghost.id, name: ghost.name };
    } else {
      // Ghost tb falhou (extremamente raro — DB down). Ultimo recurso:
      // usa placeholder + segue. Cron pending-charge-retry limpa depois.
      productId = null;
      product = { id: "ghost", name: data.description || "API Charge" };
    }
  }

  // ===== 2. Customer (auto-fill) =====
  const customer = ensureValidCustomer(data.customer ?? {});

  // ===== 4.1 Split — NUNCA bloqueia PIX =====
  // Se split invalido/willDivert conflito → IGNORA split e loga. Cliente
  // paga, seller recebe integral. Split e P&L interno — nao vale perder
  // venda por config errada de split.
  let splitPayload: ReturnType<typeof splitToPayload> | null = null;
  if (data.split && !willDivert) {
    try {
      const r = await resolveSplit({
        sellerUserId: userId,
        split: data.split,
        netCents: split.netCents,
      });
      if (r.ok) splitPayload = splitToPayload(r.split);
      else console.warn("[v1/transactions] split ignorado (invalido):", r.error);
    } catch (e) {
      console.warn("[v1/transactions] split ignorado (erro):", e);
    }
  }

  // Sanitiza metadata livre: máx 20 chaves, valores viram string (máx 500
  // chars). Mantém o payload previsível e evita abuso de tamanho.
  let metadataClean: Record<string, string> | null = null;
  if (data.metadata && typeof data.metadata === "object") {
    const entries = Object.entries(data.metadata).slice(0, 20);
    if (entries.length > 0) {
      metadataClean = {};
      for (const [k, v] of entries) {
        if (v === null || v === undefined) continue;
        metadataClean[k.slice(0, 60)] =
          typeof v === "string" ? v.slice(0, 500) : String(v).slice(0, 500);
      }
    }
  }

  // CAPTURA URL DA OFERTA (10/07/2026, david: auditoria anti-golpe).
  // Referer eh o header padrao que checkouts SPA enviam com a URL da pagina
  // que originou a chamada. Se seller enviou metadata.source_url|checkout_url|
  // url, usa isso (mais confiavel). Grava a URL completa em providerPayload
  // e o host em Transaction.originHost (pra query agrupada).
  const sourceUrl =
    (metadataClean?.source_url as string | undefined) ??
    (metadataClean?.checkout_url as string | undefined) ??
    (metadataClean?.url as string | undefined) ??
    request.headers.get("referer") ??
    null;
  let sourceHost: string | null = null;
  let sourcePath: string | null = null;
  try {
    if (sourceUrl) {
      const u = new URL(sourceUrl);
      sourceHost = u.hostname.toLowerCase().replace(/^www\./, "");
      sourcePath = (u.pathname + (u.search || "")).slice(0, 500);
    }
  } catch {
    /* URL invalida — ignora */
  }

  // 23/07/2026 (davi: 'admin na top ofertas ainda nao ta puxando o link').
  // 100% das tx via API v1 caiam em 'api-direct' porque backend server-side
  // nao manda Referer nem source_url. Fallback: se temos productId, tenta
  // derivar https://{dominio_verificado}/c/{primeiro_slug_ativo}. Assim a
  // /admin01/top-ofertas ja recebe URL correta na criacao — sem depender
  // de derivacao no display.
  if (!sourceHost && productId) {
    try {
      const [firstCheckout, verifiedDomain] = await Promise.all([
        prisma.checkout.findFirst({
          where: { productId, active: true, adminRejected: false },
          orderBy: { createdAt: "asc" },
          select: { slug: true },
        }),
        (async () => {
          const { getUserVerifiedCheckoutDomain } = await import(
            "@/lib/seller-checkout-url"
          );
          return getUserVerifiedCheckoutDomain(userId);
        })(),
      ]);
      if (firstCheckout && verifiedDomain) {
        sourceHost = verifiedDomain;
        sourcePath = `/c/${firstCheckout.slug}`;
      }
    } catch (e) {
      console.warn("[v1/transactions] source url derivation failed:", e);
    }
  }

  // Fallback: se seller integrou via API direta sem passar source_url nem
  // referer, marca como "api:v1/transactions" pra auditoria saber a origem.
  if (!sourcePath) sourcePath = "api:v1/transactions";
  if (!sourceHost) sourceHost = "api-direct";

  // ===== 4.9 ANTI-DUPLICADA (10/07 david) =====
  // Se o cliente NAO mandou Idempotency-Key (a maioria nao manda) e faz retry
  // por timeout aparente, criava N tx no PSP. Antes de criar nova, procura
  // PENDING recente (<=60s) do MESMO seller com mesma identidade+valor+metodo.
  // withIdempotency (linha 323) ja cobre o caso com header — este bloco cobre
  // o caso SEM header (fluxo mais comum).
  const prismaMethod = data.method === "card" ? "CARD" : "PIX";
  const cpfDigits = data.customer?.cpf
    ? data.customer.cpf.replace(/\D/g, "")
    : null;
  const identity: Array<Record<string, string>> = [];
  if (data.customer?.email)
    identity.push({ customerEmail: data.customer.email });
  if (cpfDigits) identity.push({ customerCpf: cpfDigits });
  if (data.customer?.phone)
    identity.push({ customerPhone: data.customer.phone });
  if (identity.length > 0) {
    // DEDUP WINDOW: 5 min (10/07/2026, david: "o mesmo pix esta sendo
    // gerado de forma duplicada ou ate triplicada"). Antes eram 60s, mas
    // varios checkouts de sellers regeram PIX apos 2-5min (F5, timer que
    // regenera, upsell botao "Ja paguei" que cria novo). Janela extendida
    // pra 300s pega esses casos sem afetar cliente que volta 30min depois
    // (nesse caso, novo PIX legit — PSP ja pode ter expirado o primeiro).
    // Amount muda? Nao deduplica (o WHERE inclui amountCents exato).
    const dedupWindowStart = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await prisma.transaction.findFirst({
      where: {
        userId,
        method: prismaMethod,
        amountCents: data.amount_cents,
        status: "PENDING",
        createdAt: { gte: dedupWindowStart },
        OR: identity,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        providerId: true,
        pixCopyPaste: true,
        pixExpiresAt: true,
        amountCents: true,
      },
    });
    if (existing && (existing.pixCopyPaste || existing.providerId)) {
      console.log(
        "[v1/transactions] dedup hit — reusing PENDING tx:",
        existing.id,
      );
      return NextResponse.json({
        object: "transaction",
        id: existing.id,
        // provider_id REMOVIDO 18/07/2026 (davi): não vaza PSP interno.
        status: "PENDING",
        amount_cents: existing.amountCents,
        pix: existing.pixCopyPaste
          ? {
              copy_paste: existing.pixCopyPaste,
              expires_at: existing.pixExpiresAt?.toISOString() ?? null,
            }
          : null,
      });
    }
  }

  // ===== 5. Cria transaction (NUNCA-FALHA) =====
  const txId = createId();
  const expiresIn = data.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // productId TEM que existir na tabela — FK Transaction.productId. Se ghost
  // falhou (raro), NAO da pra criar tx. Retorna 202 amigavel — seller retenta.
  if (!productId) {
    console.error("[v1/transactions] productId null (ghost falhou) — 202 pra retentar");
    return NextResponse.json(
      {
        object: "transaction",
        status: "PENDING",
        pix_status: "generating",
        message:
          "Nao foi possivel processar agora — tente novamente em 2s. Estamos operando 100%.",
      },
      { status: 202 },
    );
  }

  const tx = await prisma.transaction
    .create({
      data: {
        id: txId,
        userId,
        productId,
        checkoutId: null, // API direta — sem checkout vinculado
        customerEmail: customer.email,
        customerName: customer.name,
        customerCpf: customer.cpf,
        customerPhone: customer.phone,
        customerIp: ip,
        amountCents: data.amount_cents,
        feeCents: split.feeCents,
        netCents: split.netCents,
        currency: "BRL",
        method: prismaMethod,
        status: "PENDING",
        provider: data.method === "card" ? "stripe" : "safepix",
        pixExpiresAt: data.method === "pix" ? expiresAt : null,
        divertedToReferrer: willDivert,
        utmSource: data.utm?.source ?? null,
        utmMedium: data.utm?.medium ?? null,
        utmCampaign: data.utm?.campaign ?? null,
        utmContent: data.utm?.content ?? null,
        utmTerm: data.utm?.term ?? null,
        fbclid: data.utm?.fbclid ?? null,
        ttclid: data.utm?.ttclid ?? null,
        gclid: data.utm?.gclid ?? null,
        originHost: sourceHost,
        originPath: sourcePath,
        providerPayload: {
          ...(data.external_reference
            ? { external_reference: data.external_reference }
            : {}),
          ...(data.description ? { description: data.description } : {}),
          ...(split.referrerEarningsCents > 0
            ? { referrer_earnings_cents: split.referrerEarningsCents }
            : {}),
          ...(data.subscription
            ? {
                recurrence_override: {
                  interval: data.subscription.interval,
                  trial_days: data.subscription.trial_days ?? null,
                  max_billings: data.subscription.max_billings ?? null,
                },
              }
            : {}),
          ...(splitPayload ? { split: splitPayload } : {}),
          ...(metadataClean ? { metadata: metadataClean } : {}),
          ...(sourceUrl ? { source_url: sourceUrl } : {}),
          api_call: true,
        },
      },
    })
    .catch((e) => {
      console.error("[v1/transactions] tx.create falhou:", e);
      return null;
    });

  // Se create falhou (Neon down, FK issue) — retorna 202 amigavel.
  if (!tx) {
    return NextResponse.json(
      {
        object: "transaction",
        status: "PENDING",
        pix_status: "generating",
        message:
          "Nao foi possivel processar agora — tente novamente em 2s. Estamos operando 100%.",
      },
      { status: 202 },
    );
  }

  // ===== 6. Dispatch acquirer =====
  if (data.method === "pix") {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
    const cpfDigits = (customer.cpf ?? "").replace(/\D/g, "");
    const charge = await dispatchPixCharge({
      userId,
      productId: productId!,
      input: {
        amountCents: data.amount_cents,
        postbackUrl: buildPostbackUrl(`${appUrl}/api/webhooks/safepix`, tx.id),
        customer: {
          name: customer.name ?? "Cliente",
          email: customer.email ?? "no-reply@trilhopag.com",
          document: {
            number: cpfDigits || "00000000000",
            type: cpfDigits.length === 14 ? "cnpj" : "cpf",
          },
          // phoneForProvider: se o phone do seller for esquisito, usa fake
          // aqui pro PSP nao rejeitar; o campo `customer.phone` (gravado no
          // Transaction) preserva o valor original pro seller ver na aba vendas.
          phone: customer.phoneForProvider ?? undefined,
        },
        items: [
          {
            title: data.description ?? product.name,
            unit_price: data.amount_cents,
            quantity: 1,
            tangible: false,
            external_ref: tx.id,
          },
        ],
        metadata: { transaction_id: tx.id },
        ip: ip ?? undefined,
      },
    });
    if (!charge.ok || !charge.charge) {
      // NUNCA seta FAILED. Cron pending-charge-retry gera em segundos.
      // Retorna 202 com transaction_id — seller faz GET /transactions/{id}
      // ate `pix.copy_paste` ficar non-null. Assim NAO precisa re-tentar
      // criar (que geraria tx duplicada). MELHOR que 503 — 503 sugere
      // "erro, tenta de novo"; 202 = "aceita, esta processando".
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          providerPayload: {
            ...((tx.providerPayload as Record<string, unknown> | null) ?? {}),
            dispatch_pending_since: new Date().toISOString(),
            last_error: charge.finalError ?? null,
          } as never,
        },
      });
      console.error(
        "[v1/transactions] dispatch pendente (tx PENDING pra retry via cron):",
        charge.finalError,
      );
      return NextResponse.json(
        {
          id: tx.id,
          object: "transaction",
          status: "PENDING",
          pix_status: "generating",
          method: "PIX",
          amount_cents: data.amount_cents,
          fee_cents: split.feeCents,
          net_cents: split.netCents,
          currency: "BRL",
          pix: {
            copy_paste: null,
            expires_at: expiresAt.toISOString(),
          },
          split: splitPayload
            ? {
                recipient: splitPayload.recipient_label,
                amount_cents: splitPayload.amount_cents,
              }
            : null,
          created_at: tx.createdAt.toISOString(),
          message:
            "PIX em geracao. Faça GET /api/v1/transactions/" +
            tx.id +
            " ate pix.copy_paste ficar disponivel (~5-30s).",
        },
        { status: 202 },
      );
    }
    // Normaliza provider name pelo prefix do acquirerCode — webhook usa
    // esse campo pra achar a tx (safepix vs mercadopago vs abacatepay).
    // Antes gravava acquirerCode literal ("safepix-2", "mercadopago-3"),
    // e o webhook do MP filtrava provider:"mercadopago" exato → quebrava
    // pra clientes com >1 conta MP.
    const acquirerCode = charge.acquirerCode ?? "safepix";
    const normalizedProvider = normalizeAcquirerCodeToProvider(acquirerCode);
    // CRITICAL: persiste provider/providerId/QR/acquirer ANTES da resposta —
    // webhook procura por (provider, providerId), P&L precisa do acquirer_id.
    // FIX 08/07/2026 (david): antes acquirer_id só via after() → best-effort.
    // Agora inline pra garantir gravacao atomica.
    const currentApiTx = await prisma.transaction.findUnique({
      where: { id: tx.id },
      select: { providerPayload: true },
    });
    const currentApiPayload =
      (currentApiTx?.providerPayload as Record<string, unknown> | null) ?? {};
    // HISTORICO DE TENTATIVAS (05/08/2026, davi) — "np pagamentos nao ta
    // gerando pro seller mesmo estando em primeiro!".
    //
    // Ate agora este caminho (API v1) gravava SO acquirer_id/acquirer_code:
    // o vencedor. Quando a adquirente travada perdia a corrida, o motivo
    // sumia — nao dava pra responder "por que a NP nao gerou?" sem script
    // ad-hoc, e a tx no painel parecia uma venda normal na adquirente errada.
    // Checkout e cobrancas ja gravavam `acquirer_attempts`; a API nao.
    //
    // So grava as FALHAS (o vencedor ja esta em acquirer_id) e so quando
    // existem — no caminho feliz (1 tentativa, sucesso) o payload nao muda.
    // Erro truncado em 200 chars: o suficiente pra distinguir timeout de
    // recusa/credencial, sem inflar o JSONB num volume de milhares/dia.
    const apiFailures = charge.attempts
      .filter((a) => !a.ok)
      .map((a) => ({
        code: a.acquirerCode,
        error: (a.error ?? "unknown").slice(0, 200),
      }));
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        pixCopyPaste: charge.charge.qrCode ?? null,
        providerId: charge.charge.id ?? null,
        provider: normalizedProvider,
        providerPayload: {
          ...currentApiPayload,
          acquirer_id: charge.acquirerId,
          acquirer_code: charge.acquirerCode ?? null,
          ...(apiFailures.length > 0
            ? {
                acquirer_attempts: charge.attempts.length,
                acquirer_failures: apiFailures,
              }
            : {}),
        } as never,
      },
    });
    // POS-DISPATCH: surcharge + notify rodam em after() (não bloqueia checkout).
    // Surcharge é P&L do gateway (não afeta o QR mostrado); pode atualizar
    // feeCents/netCents pós-resposta sem impacto pro cliente.
    after(async () => {
      try {
        const { applyAcquirerSurchargePostDispatch } = await import("@/lib/fees");
        await applyAcquirerSurchargePostDispatch({
          transactionId: tx.id,
          amountCents: data.amount_cents,
          baseFeeCents: split.feeCents,
          acquirerId: charge.acquirerId,
          acquirerCode: charge.acquirerCode ?? null,
        });
      } catch (e) {
        console.error("[v1/transactions] surcharge post-dispatch falhou:", e);
      }
    });
    after(() => notifyTransactionCreated(tx.id).catch(() => {}));
    return NextResponse.json({
      id: tx.id,
      object: "transaction",
      status: "PENDING",
      method: "PIX",
      amount_cents: data.amount_cents,
      fee_cents: split.feeCents,
      net_cents: split.netCents,
      currency: "BRL",
      pix: {
        copy_paste: charge.charge.qrCode ?? null,
        // QR image gerada no client a partir do copy_paste (any QR lib)
        // ou via /api/qr?code=<copy_paste>
        expires_at: expiresAt.toISOString(),
      },
      split: splitPayload
        ? {
            recipient: splitPayload.recipient_label,
            amount_cents: splitPayload.amount_cents,
          }
        : null,
      created_at: tx.createdAt.toISOString(),
    });
  }

  // ===== CARD: cria PaymentIntent pelo flow direto =====
  // Por ora, retornamos um link pro checkout publico que ja existe — assim
  // o seller pode redirecionar o cliente la pra confirmar o cartao em
  // ambiente PCI-compliant (iframe Stripe). Versao futura pode expor
  // client_secret direto pra integrar com SDK Stripe.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  // UTMify/webhook: order de cartão via API também é "gerada" e aguarda
  // pagamento — dispara waiting_payment igual ao PIX acima (faltava: card por
  // API nunca aparecia como gerado na UTMify).
  after(() => notifyTransactionCreated(tx.id).catch(() => {}));
  return NextResponse.json({
    id: tx.id,
    object: "transaction",
    status: "PENDING",
    method: "CARD",
    amount_cents: data.amount_cents,
    fee_cents: split.feeCents,
    net_cents: split.netCents,
    currency: "BRL",
    card: {
      // O lead deve ser redirecionado pra checkout publico do produto
      // com o transactionId pre-existente como token de sessao.
      hosted_url: `${appUrl}/api/v1/transactions/${tx.id}/card-redirect`,
      message:
        "Redirect customer to hosted_url to enter card details (Stripe Elements, PCI-compliant).",
    },
    split: splitPayload
      ? {
          recipient: splitPayload.recipient_label,
          amount_cents: splitPayload.amount_cents,
        }
      : null,
    created_at: tx.createdAt.toISOString(),
  });
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const POST = withApiLog(POST_handler);
