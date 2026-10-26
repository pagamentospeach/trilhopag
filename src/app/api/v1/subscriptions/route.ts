import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, requireScope } from "@/lib/api-response";
import { friendlyPaymentError } from "@/lib/payment-error";
import { dispatchPixCharge, normalizeAcquirerCodeToProvider } from "@/lib/acquirers";
import {
  notifyTransactionCreated,
  shouldDivertToReferrer,
} from "@/lib/transactions";
import { splitFeeBetweenPlatformAndReferrer } from "@/lib/fees";
import { getOrCreateApiGhostProduct } from "@/lib/api-ghost-product";
import { ensureValidCustomer } from "@/lib/fake-customer";
import { getClientIp } from "@/lib/rate-limit";
import { intervalLabel, serializeSubscription } from "@/lib/recurrence";
import { resolveSplit, splitToPayload } from "@/lib/api-split";
import { trackApiKeyIp } from "@/lib/api-key-ip";
import { buildPostbackUrl } from "@/lib/security/webhook-secret";
import { extractOrigin } from "@/lib/tx-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* ============================================================
 * GET /api/v1/subscriptions — lista as assinaturas (PIX recorrente) do
 * seller. Autenticada SÓ via API key. Filtros: ?status=active|past_due|
 * canceled|completed, ?limit, ?cursor.
 * ============================================================ */
async function GET_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "subscriptions");
  if (scopeDenied) return scopeDenied;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const subs = await prisma.subscription.findMany({
    where: {
      userId: record.userId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = subs.length > limit;
  const data = hasMore ? subs.slice(0, -1) : subs;

  return NextResponse.json({
    data: data.map(serializeSubscription),
    has_more: hasMore,
    next_cursor: hasMore ? data[data.length - 1]?.id : null,
  });
}

/* ============================================================
 * POST /api/v1/subscriptions — cria um PIX RECORRENTE via API.
 *
 * Gera o PRIMEIRO PIX (cobrança de ativação). Quando o cliente paga esse
 * PIX, a assinatura é ativada e o Trilho gera um novo PIX automaticamente
 * a cada ciclo (cron). Tudo configurável pelo seller — sem precisar criar
 * produto.
 *
 * Body:
 *   {
 *     "amount_cents": 9990,                 // valor de CADA cobrança (min 500)
 *     "interval": "monthly",                // weekly|monthly|quarterly|yearly
 *       // OU
 *     "interval_days": 15,                  // cadência CUSTOM em dias (1..365)
 *     "customer": { "email": "...", "name": "...", "cpf": "...", "phone": "..." },
 *     "trial_days": 7,                      // opcional: adia a 2ª cobrança
 *     "max_billings": 12,                   // opcional: encerra após N cobranças
 *     "product_id": "cuid",                 // opcional (sem ele usa ghost)
 *     "description": "Plano Pro",           // opcional
 *     "external_reference": "assinatura_1", // opcional
 *     "expires_in": 3600,                   // opcional: validade do 1º PIX (s)
 *     "utm": { "source": "...", ... }       // opcional
 *   }
 * ============================================================ */
const CreateSubBody = z
  .object({
    amount_cents: z.number().int().min(500, "amount_cents min R$5,00 (500 cents)"),
    interval: z
      .enum(["weekly", "monthly", "quarterly", "yearly"])
      .optional()
      .nullable(),
    interval_days: z.number().int().min(1).max(365).optional().nullable(),
    customer: z
      .object({
        email: z.string().email().optional().nullable(),
        name: z.string().trim().max(120).optional().nullable(),
        cpf: z.string().trim().max(40).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
      })
      .optional()
      .nullable(),
    trial_days: z.number().int().min(0).max(365).optional().nullable(),
    max_billings: z.number().int().min(1).max(120).optional().nullable(),
    product_id: z.string().trim().optional().nullable(),
    description: z.string().trim().max(300).optional().nullable(),
    external_reference: z.string().trim().max(120).optional().nullable(),
    expires_in: z.number().int().min(60).max(86400).optional(),
    // SPLIT recorrente: divide o líquido de CADA cobrança com outra conta
    // Trilho (parceiro/afiliado). Aplicado no 1º PIX e em todas as
    // renovações geradas pelo cron. Use amount_cents OU percent.
    split: z
      .object({
        recipient: z.string().trim().min(1).max(200),
        amount_cents: z
          .number()
          .int()
          .min(1)
          .max(50_000_000)
          .optional()
          .nullable(),
        percent: z.number().min(0.01).max(100).optional().nullable(),
      })
      .optional()
      .nullable(),
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
  })
  .refine((d) => !!d.interval || !!d.interval_days, {
    message: "Informe 'interval' (weekly|monthly|quarterly|yearly) ou 'interval_days' (1..365)",
    path: ["interval"],
  });

async function POST_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "subscriptions");
  if (scopeDenied) return scopeDenied;

  // Rastreia (apiKey, IP) — alerta seller quando um IP novo passa a usar a chave.
  const clientIpSub = getClientIp(request);
  after(async () => {
    await trackApiKeyIp({
      apiKeyId: record.id,
      userId: record.userId,
      ip: clientIpSub,
      countCreated: true,
    }).catch((e) => console.error("[v1/subscriptions] trackIp failed:", e));
  });

  // NEVER-FAIL body parse (08/07/2026): nunca bloqueia por body invalido.
  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = CreateSubBody.safeParse(raw);
  type CreateSubBodyData = z.infer<typeof CreateSubBody>;
  const data: CreateSubBodyData = parsed.success
    ? parsed.data
    : (() => {
        const r = raw as Record<string, unknown>;
        const amt = Number(r.amount_cents);
        return {
          amount_cents: Number.isFinite(amt) && amt >= 500 ? amt : 500,
          interval: (r.interval as CreateSubBodyData["interval"]) ?? "monthly",
          interval_days:
            typeof r.interval_days === "number" ? r.interval_days : null,
          customer: (r.customer as CreateSubBodyData["customer"]) ?? null,
          trial_days: typeof r.trial_days === "number" ? r.trial_days : null,
          max_billings:
            typeof r.max_billings === "number" ? r.max_billings : null,
          product_id: typeof r.product_id === "string" ? r.product_id : null,
          description:
            typeof r.description === "string" ? r.description.slice(0, 300) : null,
          external_reference:
            typeof r.external_reference === "string"
              ? r.external_reference.slice(0, 120)
              : null,
          expires_in:
            typeof r.expires_in === "number" && r.expires_in >= 60
              ? Math.min(r.expires_in, 86400)
              : undefined,
          split: (r.split as CreateSubBodyData["split"]) ?? null,
          utm: (r.utm as CreateSubBodyData["utm"]) ?? null,
        };
      })();
  const userId = record.userId;
  const ip = getClientIp(request);

  // Intervalo final: custom "days:N" tem prioridade se enviado.
  const interval = data.interval_days
    ? `days:${data.interval_days}`
    : (data.interval as string) || "monthly";

  // Paraleliza queries pré-dispatch — nao pode bloquear PIX se DB soluçar.
  const [productLookup, split, willDivert] = await Promise.all([
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
      method: "PIX",
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
  ]);

  // ===== 1. Produto (SEMPRE resolve — nunca 404/422) =====
  let productId: string | null = data.product_id ?? null;
  let productName = data.description || "Assinatura via API";
  if (productId && productLookup) {
    productName = productLookup.name;
  } else {
    const ghost = await getOrCreateApiGhostProduct(userId, {
      name: data.description || "Assinatura via API",
    }).catch(() => null);
    if (ghost) {
      productId = ghost.id;
      productName = ghost.name;
    } else {
      productId = null;
      productName = data.description || "Assinatura via API";
    }
  }

  // ===== 2. Customer (auto-fill) =====
  const customer = ensureValidCustomer(data.customer ?? {});

  // Split recorrente — NUNCA bloqueia PIX. Ignora se invalido.
  let splitPayload: ReturnType<typeof splitToPayload> | null = null;
  if (data.split && !willDivert) {
    try {
      const r = await resolveSplit({
        sellerUserId: userId,
        split: data.split,
        netCents: split.netCents,
      });
      if (r.ok) splitPayload = splitToPayload(r.split);
      else console.warn("[v1/subscriptions] split ignorado:", r.error);
    } catch (e) {
      console.warn("[v1/subscriptions] split ignorado (erro):", e);
    }
  }

  // ===== 3. Primeiro PIX (ativação da assinatura) =====
  const txId = createId();
  const expiresIn = data.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const tx = await prisma.transaction.create({
    data: {
      id: txId,
      userId,
      productId: productId!,
      checkoutId: null,
      customerEmail: customer.email,
      customerName: customer.name,
      customerCpf: customer.cpf,
      customerPhone: customer.phone,
      customerIp: ip,
      amountCents: data.amount_cents,
      feeCents: split.feeCents,
      netCents: split.netCents,
      currency: "BRL",
      method: "PIX",
      status: "PENDING",
      provider: "safepix",
      pixExpiresAt: expiresAt,
      divertedToReferrer: willDivert,
      utmSource: data.utm?.source ?? null,
      utmMedium: data.utm?.medium ?? null,
      utmCampaign: data.utm?.campaign ?? null,
      utmContent: data.utm?.content ?? null,
      utmTerm: data.utm?.term ?? null,
      fbclid: data.utm?.fbclid ?? null,
      ttclid: data.utm?.ttclid ?? null,
      gclid: data.utm?.gclid ?? null,
      // 23/07/2026 (davi: 'top ofertas ainda nao ta puxando link'). Se
      // Referer vier vazio (comum em backend server-side), tenta derivar
      // https://{dominio_verificado}/c/{primeiro_slug_ativo} do seller —
      // assim /admin01/top-ofertas mostra a URL correta em vez de
      // 'api-direct'. Mesma logica do /api/v1/transactions/route.ts.
      ...(await (async () => {
        const { host, path } = extractOrigin(request, {
          fallbackHost: undefined,
          fallbackPath: undefined,
        });
        if (host) return { originHost: host, originPath: path ?? null };
        if (productId) {
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
              return {
                originHost: verifiedDomain,
                originPath: `/c/${firstCheckout.slug}`,
              };
            }
          } catch (e) {
            console.warn(
              "[v1/subscriptions] source url derivation failed:",
              e,
            );
          }
        }
        return {
          originHost: "api-direct",
          originPath: "api:v1/subscriptions",
        };
      })()),
      providerPayload: {
        ...(data.external_reference ? { external_reference: data.external_reference } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(split.referrerEarningsCents > 0
          ? { referrer_earnings_cents: split.referrerEarningsCents }
          : {}),
        // É isto que faz a Subscription ser criada quando o 1º PIX for pago.
        recurrence_override: {
          interval,
          trial_days: data.trial_days ?? null,
          max_billings: data.max_billings ?? null,
          // Split propagado pra TODAS as renovações (lido pelo cron).
          ...(splitPayload ? { split: splitPayload } : {}),
        },
        // Split do 1º PIX (cobrança de ativação) — creditado no release.
        ...(splitPayload ? { split: splitPayload } : {}),
        api_call: true,
        api_subscription: true,
      },
    },
  });

  // ===== 4. Dispatch PIX =====
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
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
        // phoneForProvider: preserva customer.phone no DB, manda fake pro PSP
        // caso o formato do seller nao passe em isValidPhone.
        phone: customer.phoneForProvider ?? undefined,
      },
      items: [
        {
          title: data.description ?? productName,
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
    // ate pix.copy_paste ficar non-null. Evita duplicar assinatura.
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
      "[v1/subscriptions] dispatch pendente (tx PENDING pra retry via cron):",
      charge.finalError,
    );
    return NextResponse.json(
      {
        object: "recurring_pix",
        status: "awaiting_first_payment_generation",
        recurrence: {
          interval,
          interval_label: intervalLabel(interval),
          amount_cents: data.amount_cents,
          trial_days: data.trial_days ?? null,
          max_billings: data.max_billings ?? null,
          split: splitPayload
            ? {
                recipient: splitPayload.recipient_label,
                amount_cents: splitPayload.amount_cents,
              }
            : null,
          note: "PIX de ativacao em geracao. Faça GET /api/v1/transactions/" +
            tx.id +
            " ate pix.copy_paste ficar disponivel (~5-30s).",
        },
        first_charge: {
          transaction_id: tx.id,
          status: "PENDING",
          pix_status: "generating",
          amount_cents: data.amount_cents,
          pix: {
            copy_paste: null,
            expires_at: expiresAt.toISOString(),
          },
        },
        created_at: tx.createdAt.toISOString(),
      },
      { status: 202 },
    );
  }

  // Normaliza provider name pelo prefix do acquirerCode (webhook usa pra achar).
  const acquirerCode = charge.acquirerCode ?? "safepix";
  const normalizedProvider = normalizeAcquirerCodeToProvider(acquirerCode);
  // CRITICAL: persiste provider/providerId/QR/acquirer ANTES da resposta —
  // webhook precisa da tupla + P&L do acquirer_id (fix 08/07/2026 david:
  // "algumas tx nao estao marcando a adquirente"). Antes o acquirer_id
  // só vinha via after() (best-effort).
  const currentSubTx = await prisma.transaction.findUnique({
    where: { id: tx.id },
    select: { providerPayload: true },
  });
  const currentSubPayload =
    (currentSubTx?.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      pixCopyPaste: charge.charge.qrCode ?? null,
      providerId: charge.charge.id ?? null,
      provider: normalizedProvider,
      providerPayload: {
        ...currentSubPayload,
        acquirer_id: charge.acquirerId,
        acquirer_code: charge.acquirerCode ?? null,
      } as never,
    },
  });
  // SURCHARGE + notify em after() (pós-resposta).
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
      console.error("[v1/subscriptions] surcharge post-dispatch falhou:", e);
    }
  });
  after(() => notifyTransactionCreated(tx.id).catch(() => {}));

  return NextResponse.json({
    object: "recurring_pix",
    // A Subscription só nasce quando o 1º PIX for PAGO (via webhook). Aqui
    // devolvemos o PIX de ativação + a config que vai valer.
    status: "awaiting_first_payment",
    recurrence: {
      interval,
      interval_label: intervalLabel(interval),
      amount_cents: data.amount_cents,
      trial_days: data.trial_days ?? null,
      max_billings: data.max_billings ?? null,
      split: splitPayload
        ? {
            recipient: splitPayload.recipient_label,
            amount_cents: splitPayload.amount_cents,
          }
        : null,
      note: "A assinatura é ativada quando o 1º PIX for pago. Depois, um novo PIX é gerado automaticamente a cada ciclo.",
    },
    first_charge: {
      transaction_id: tx.id,
      status: "PENDING",
      amount_cents: data.amount_cents,
      pix: {
        copy_paste: charge.charge.qrCode ?? null,
        expires_at: expiresAt.toISOString(),
      },
    },
    created_at: tx.createdAt.toISOString(),
  });
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const POST = withApiLog(POST_handler);
