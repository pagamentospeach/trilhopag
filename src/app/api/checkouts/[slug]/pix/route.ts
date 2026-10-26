import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { friendlyPaymentError } from "@/lib/payment-error";
import { withDbRetry } from "@/lib/db-retry";
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
} from "@/lib/pix-limits";
import { tryApplyCoupon, releaseCouponUsage } from "@/lib/coupons";
import { ensureValidCustomer } from "@/lib/fake-customer";
import { createId } from "@paralleldrive/cuid2";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { deriveBotFunnelTrace } from "@/lib/bot-funnel-trace";
import { buildPostbackUrl } from "@/lib/security/webhook-secret";
import { extractOrigin } from "@/lib/tx-origin";
import { resolveTiktokVariantDelta } from "@/components/checkout-templates/configs";
import { resolveAbVariant, getCookie, type AbTestConfig } from "@/lib/ab-test";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Schema PERMISSIVO: aceita tudo opcional. O que vier inválido
// ou faltando, geramos automaticamente via ensureValidCustomer.
// O objetivo é o Pix NUNCA travar por validação — o seller quer
// o link funcionando 100% do tempo.
const Body = z.object({
  customer: z
    .object({
      name: z.string().trim().max(120).optional().nullable(),
      email: z.string().trim().max(200).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      cpf: z.string().trim().max(40).optional().nullable(),
      // Endereco (produtos fisicos / templates com isPhysical=true)
      cep: z.string().trim().max(20).optional().nullable(),
      address: z.string().trim().max(200).optional().nullable(),
      number: z.string().trim().max(20).optional().nullable(),
      complement: z.string().trim().max(120).optional().nullable(),
      neighborhood: z.string().trim().max(120).optional().nullable(),
      city: z.string().trim().max(120).optional().nullable(),
      state: z.string().trim().max(40).optional().nullable(),
    })
    .optional()
    .nullable(),
  variant_id: z.string().optional().nullable(),
  coupon_code: z.string().trim().max(40).optional().nullable(),
  /**
   * ORDER BUMPS escolhidos pelo cliente. Portado da BravoPay 11/08/2026
   * (Pedro Albanez: "produto custa 29,90, bump de 19,90, na hora de copiar o
   * pix aparecia 30,00 em vez de 48,90").
   *
   * O bug e o mesmo aqui: o front SEMPRE somou e exibiu o bump, mas o schema
   * nao tinha campo nenhum — o zod descartava o que chegava e a cobranca saia
   * com o preco do produto puro.
   *
   * So os IDs vem do cliente. O PRECO e lido do banco — aceitar valor do
   * request deixaria qualquer um pagar bump de R$ 0,00.
   *
   * `bump_selected` e o formato ANTIGO (booleano, um bump so) que o
   * pix-checkout.tsx ainda manda. Mantido pra nao quebrar quem esta com essa
   * tela em cache no navegador.
   */
  bump_ids: z.array(z.string().max(40)).max(20).optional().nullable(),
  bump_selected: z.boolean().optional().nullable(),
  /** Frete escolhido. Mesmo problema e mesma regra dos bumps: so o ID. */
  shipping_id: z.string().max(40).optional().nullable(),
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
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  // NEVER-FAIL (jun/2026): blinda TODA a rota. Qualquer throw inesperado (ex.:
  // timeout do Neon nas leituras pré-dispatch) vira mensagem AMIGÁVEL 503 em vez
  // de 500 cru com "The operation was aborted due to timeout". O cliente nunca
  // vê erro técnico; o front faz auto-retry no 503.
  try {
    return await handlePixPost(request, ctx);
  } catch (err) {
    console.error("[pix] erro inesperado no POST (fallback amigável):", err);
    return NextResponse.json(
      {
        error: "psp_error",
        message: friendlyPaymentError(
          err instanceof Error ? err.message : String(err),
          "customer",
        ),
      },
      { status: 503 },
    );
  }
}

async function handlePixPost(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;

  // Rate limit por IP+slug: máx 20 PIX por minuto. Protege contra abuso
  // de geração massiva (custaria $$$ no PSP) sem atrapalhar clientes reais.
  const ip = getClientIp(request);
  // Captura domínio + path via helper único (17/07/2026). Fallback = slug do
  // checkout se referer não vier. Assim toda tx tem originHost + originPath
  // pra auditoria em /admin01/pix-origins e /admin01/top-ofertas.
  const { host: originHost, path: originPath } = extractOrigin(request, {
    fallbackPath: `/c/${slug}`,
  });
  const rl = rateLimit(`pix:${ip}:${slug}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Aguarde alguns segundos antes de tentar novamente." },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetIn / 1000).toString() } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  // SELECT explícito reduz bytes transferidos do DB (era findUnique with include
  // que trazia campos não usados). Mantém só o essencial pro fluxo de PIX.
  // Leitura CRÍTICA com retry rápido (1x) em soluço transiente do Neon.
  const checkout = await withDbRetry(() => prisma.checkout.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
      slug: true,
      active: true,
      paymentMethods: true,
      priceCentsOverride: true,
      thankYouUrl: true,
      productId: true,
      // theme: lê config de variantes TikTok Shop (delta de preço autoritativo)
      // + config do teste A/B de template. Ambos opcionais — fallback seguro.
      theme: true,
      product: {
        select: {
          id: true,
          name: true,
          priceCents: true,
          active: true,
        },
      },
      variants: {
        where: { active: true },
        select: { id: true, priceCentsOverride: true },
      },
      // Order bumps ATIVOS — fonte do preco (o request so manda os IDs).
      orderBumps: {
        where: { active: true },
        select: { id: true, title: true, priceCents: true },
        orderBy: { sortOrder: "asc" },
      },
      shippingOptions: {
        where: { active: true },
        select: { id: true, name: true, priceCents: true, isDefault: true },
        orderBy: { sortOrder: "asc" },
      },
      // Bloqueio de integração PIX (admin) — seller parado de vender.
      // pixOpsMode: teto de R$1.000 no modo white (ver lib/pix-limits).
      user: { select: { pixIntegrationBlocked: true, pixOpsMode: true } },
    },
  }));
  if (!checkout || !checkout.active || !checkout.product.active) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // ADMIN bloqueou a geração de PIX nesta conta → nenhum PIX é gerado.
  if (checkout.user?.pixIntegrationBlocked) {
    return NextResponse.json({ error: "pix_disabled" }, { status: 403 });
  }
  if (!checkout.paymentMethods.includes("pix")) {
    return NextResponse.json(
      { error: "pix_not_enabled" },
      { status: 400 },
    );
  }

  // POLITICA JUN/2026 — mesmo gate que /c/[slug]/page.tsx:193-199:
  // quando request vem em trilhopag.com E o seller NAO tem dominio
  // verificado, bloqueia. Antes a checagem so existia no page; a API
  // ficava aberta pra qualquer curl direto (bypass da politica).
  // Permite em localhost/.vercel.app pra dev/QA nao quebrar.
  const isMainDomain =
    originHost === "trilhopag.com" || originHost === "www.trilhopag.com";
  const isDevHost =
    !originHost ||
    originHost.startsWith("localhost") ||
    originHost.endsWith(".vercel.app");
  if (isMainDomain && !isDevHost) {
    // Sub-account herda dominios do grupo (fix 06/07 — adsriya0 reportou
    // "n da pra usar o dominio, o davi q setou por la").
    const { getUserGroupIds } = await import("@/lib/seller-checkout-url");
    const groupIds = await getUserGroupIds(checkout.userId);
    const hasVerifiedDomain = await prisma.customDomain.findFirst({
      where: {
        userId: { in: groupIds },
        status: "verified",
        useCheckout: true,
      },
      select: { id: true },
    });
    if (!hasVerifiedDomain) {
      return NextResponse.json(
        {
          error: "seller_needs_domain",
          message:
            "Este checkout requer dominio proprio verificado. Peca pro seller configurar em /dashboard/dominios.",
        },
        { status: 404 },
      );
    }
  }

  const variant = parsed.data.variant_id
    ? checkout.variants.find((v) => v.id === parsed.data.variant_id)
    : null;
  // Prioridade de preço: variante A/B → preço deste checkout → preço do produto
  let baseCents =
    variant?.priceCentsOverride ??
    checkout.priceCentsOverride ??
    checkout.product.priceCents;

  // Delta de variante do TikTok Shop: AUTORITATIVO no servidor. O cliente só
  // manda o índice (cookie ttkv_<slug>); o valor vem do theme salvo. Mantém o
  // total cobrado igual ao exibido no template. Clamp >= 100 (R$1) por segurança.
  const ttkVariantRaw = getCookie(request, `ttkv_${slug}`);
  const ttkVariantIndex =
    ttkVariantRaw != null && /^\d+$/.test(ttkVariantRaw)
      ? parseInt(ttkVariantRaw, 10)
      : null;
  const ttkDelta = resolveTiktokVariantDelta(checkout.theme, ttkVariantIndex);
  if (ttkDelta !== 0) baseCents = Math.max(100, baseCents + ttkDelta);

  /**
   * ORDER BUMPS — soma ao valor cobrado.
   *
   * Casa os IDs que vieram do cliente com os bumps ATIVOS deste checkout e
   * soma o preco DO BANCO. ID que nao pertence a este checkout (ou bump
   * desativado depois que a pagina carregou) e ignorado — nao derruba a
   * venda, so nao cobra aquele item.
   *
   * `bump_selected` (formato antigo, booleano) cai no PRIMEIRO bump ativo,
   * que e exatamente o que aquela tela exibia quando so havia suporte a um.
   */
  const bumpsAtivos = checkout.orderBumps ?? [];
  const idsPedidos = new Set(parsed.data.bump_ids ?? []);
  if (idsPedidos.size === 0 && parsed.data.bump_selected && bumpsAtivos[0]) {
    idsPedidos.add(bumpsAtivos[0].id);
  }
  const bumpsEscolhidos = bumpsAtivos.filter((b) => idsPedidos.has(b.id));
  const bumpsCents = bumpsEscolhidos.reduce((sm, b) => sm + b.priceCents, 0);
  if (bumpsCents > 0) baseCents += bumpsCents;

  /**
   * FRETE — mesma familia do bump.
   *
   * O useBumpsShippingState ja devolvia `shippingTotal` e a tela ja somava,
   * mas a rota nunca teve uma linha de shipping: produto fisico saia cobrado
   * sem o frete que o cliente escolheu.
   *
   * Sem `shipping_id` cai no isDefault — e o que a tela ja vem marcado, entao
   * quem nao tocar na opcao paga o que estava selecionado na frente dele.
   */
  const fretesAtivos = checkout.shippingOptions ?? [];
  const freteEscolhido =
    fretesAtivos.find((f) => f.id === parsed.data.shipping_id) ??
    fretesAtivos.find((f) => f.isDefault) ??
    null;
  const freteCents = freteEscolhido?.priceCents ?? 0;
  if (freteCents > 0) baseCents += freteCents;

  // Teste A/B de template: registra em qual braço o visitante caiu (mesma
  // atribuição determinística do page.tsx, via cookie tp_vid). Só pra tag.
  const abConfig = (checkout.theme as { abTest?: AbTestConfig } | null)?.abTest;
  const abTemplateA =
    (checkout.theme as { template?: string } | null)?.template ?? "";
  const abVisitorId = getCookie(request, "tp_vid") ?? "";
  const ab =
    abConfig?.enabled && abVisitorId
      ? resolveAbVariant(abConfig, abTemplateA, `${checkout.id}:${abVisitorId}`)
      : null;

  // Paraleliza coupon + willDivert (independentes; coupon afeta amountCents,
  // mas o divert é decidido por UTM/user, não pelo valor).
  const [couponResult, willDivert] = await Promise.all([
    tryApplyCoupon({
      code: parsed.data.coupon_code,
      userId: checkout.userId,
      productId: checkout.productId,
      amountCents: baseCents,
    }),
    shouldDivertToReferrer({
      userId: checkout.userId,
      amountCents: baseCents,
      customerEmail: parsed.data.customer?.email ?? null,
      customerCpf: parsed.data.customer?.cpf ?? null,
      customerIp: ip,
      utmSource: parsed.data.utm?.source ?? null,
      utmMedium: parsed.data.utm?.medium ?? null,
      utmCampaign: parsed.data.utm?.campaign ?? null,
    }),
  ]);

  if (parsed.data.coupon_code && !couponResult.ok) {
    return NextResponse.json(
      { error: "invalid_coupon", reason: couponResult.reason },
      { status: 422 },
    );
  }

  const amountCents = baseCents - couponResult.discountCents;

  // TETO WHITE R$1.000 (01/08/2026, davi). Barra ANTES de criar a Transaction
  // — se deixasse passar pro dispatch, o cliente ficaria no spinner de
  // "gerando PIX" por ~30min ate o cron de retry desistir. Cupom ja aplicado:
  // o teto vale sobre o valor QUE O CLIENTE PAGA, nao sobre o preco cheio.
  if (exceedsWhitePixLimit(checkout.user?.pixOpsMode, amountCents)) {
    return NextResponse.json(
      { error: WHITE_LIMIT_ERROR_CODE, message: WHITE_LIMIT_MESSAGE },
      { status: 422 },
    );
  }

  const split = await splitFeeBetweenPlatformAndReferrer({
    sellerUserId: checkout.userId,
    amountCents,
  });
  const feeCents = split.feeCents;
  const netCents = split.netCents;
  const referrerEarningsCents = split.referrerEarningsCents;

  // `ip` já foi computado lá em cima pelo rate limit

  // Auto-fill: qualquer campo faltando/inválido é substituído por dado
  // aleatório válido. Garante que o Pix SEMPRE seja gerado.
  const customer = ensureValidCustomer(parsed.data.customer ?? {});
  const cpf = customer.cpf;
  // `phone` — valor pra gravar no Transaction.customerPhone (aparece na aba
  // vendas do seller). Preserva o valor exato que o cliente digitou.
  const phone = customer.phone;
  // `phoneForProvider` — usado no dispatch ao PSP. Igual a `phone` se o
  // formato passa em isValidPhone; senao vira fake pra PIX gerar sem erro.
  const phoneForProvider = customer.phoneForProvider;

  // ANTI-DUPLICADA (10/07 david): checkout gerava 2-3 PIX quando cliente clicava
  // rapido/refreshava. Antes de criar nova tx, procura PENDING recente (<=5min)
  // do MESMO cliente (mesmo checkout + IP + valor + qualquer identidade).
  //
  // JANELA EXTENDIDA 60s → 300s (10/07 v2, david: duplicidades Caju rolando com
  // gap 154-299s). Muitos checkouts regeram PIX em 2-5min (timer, F5, upsell
  // "ja paguei" bug). Se identidade+valor batem em <=5min, reusa. Cliente que
  // volta 30min+ depois gera novo (razoavel — PSP pode ter expirado o primeiro).
  const cpfDigits = customer.cpf ? customer.cpf.replace(/\D/g, "") : null;
  const dedupWindowStart = new Date(Date.now() - 5 * 60 * 1000);
  const identity: Array<Record<string, string>> = [];
  if (customer.email) identity.push({ customerEmail: customer.email });
  if (cpfDigits) identity.push({ customerCpf: cpfDigits });
  if (customer.phone) identity.push({ customerPhone: customer.phone });
  if (identity.length > 0) {
    const existing = await prisma.transaction.findFirst({
      where: {
        checkoutId: checkout.id,
        customerIp: ip,
        amountCents,
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
    if (existing && existing.pixCopyPaste && existing.providerId) {
      console.log(
        "[checkout/pix] dedup hit — reusing PENDING tx:",
        existing.id,
      );
      return NextResponse.json({
        transaction_id: existing.id,
        // provider_id REMOVIDO 18/07/2026 (davi): PSP interno não vaza.
        status: "PENDING",
        amount_cents: existing.amountCents,
        copy_paste: existing.pixCopyPaste,
        expires_at: existing.pixExpiresAt?.toISOString() ?? null,
      });
    }
  }

  // OTIMIZAÇÃO: pre-gerar txId pra rodar tx.create + SafePix dispatch
  // EM PARALELO. Economiza ~50-100ms por request.
  const txId = createId();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";

  const [tx, dispatch] = await Promise.all([
    prisma.transaction.create({
      data: {
        id: txId,
        userId: checkout.userId,
        productId: checkout.productId,
        checkoutId: checkout.id,
        customerEmail: customer.email,
        customerName: customer.name,
        customerCpf: cpf,
        customerPhone: phone,
        customerIp: ip,
        // Endereco — quando produto digital, vem tudo null (template nao
        // coleta). Normaliza CEP removendo nao-digitos pra busca consistente.
        customerCep:
          parsed.data.customer?.cep?.replace(/\D/g, "").trim() || null,
        customerAddress: parsed.data.customer?.address?.trim() || null,
        customerNumber: parsed.data.customer?.number?.trim() || null,
        customerComplement: parsed.data.customer?.complement?.trim() || null,
        customerNeighborhood:
          parsed.data.customer?.neighborhood?.trim() || null,
        customerCity: parsed.data.customer?.city?.trim() || null,
        customerState: parsed.data.customer?.state?.trim() || null,
        amountCents,
        feeCents,
        netCents,
        currency: "BRL",
        method: "PIX",
        status: "PENDING",
        provider: "safepix",
        divertedToReferrer: willDivert,
        utmSource: parsed.data.utm?.source ?? null,
        utmMedium: parsed.data.utm?.medium ?? null,
        utmCampaign: parsed.data.utm?.campaign ?? null,
        utmContent: parsed.data.utm?.content ?? null,
        utmTerm: parsed.data.utm?.term ?? null,
        fbclid: parsed.data.utm?.fbclid ?? null,
        ttclid: parsed.data.utm?.ttclid ?? null,
        gclid: parsed.data.utm?.gclid ?? null,
        // 22/07/2026 fase 2: bloco payment modo LINK do funil de bot Telegram
        // manda o cliente pro checkout com utm_source=telegram_bot. Derivamos
        // botFunnelTrace pra reconciliar branch pagou/nao-pagou depois.
        botFunnelTrace: deriveBotFunnelTrace(parsed.data.utm),
        originHost,
        originPath,
        providerPayload: {
          ...(variant ? { variant_id: variant.id } : {}),
          // Bumps comprados. Sem isto o seller cobra o bump e nao tem como
          // saber o que precisa entregar — nao existe tabela de bump vendido,
          // entao o registro fica aqui (mesmo padrao do referrer_earnings).
          ...(bumpsEscolhidos.length > 0
            ? {
                order_bumps: bumpsEscolhidos.map((b) => ({
                  id: b.id,
                  title: b.title,
                  price_cents: b.priceCents,
                })),
                order_bumps_cents: bumpsCents,
              }
            : {}),
          ...(freteEscolhido && freteCents > 0
            ? {
                shipping_id: freteEscolhido.id,
                shipping_name: freteEscolhido.name,
                shipping_cents: freteCents,
              }
            : {}),
          ...(ttkDelta !== 0
            ? {
                tiktok_variant_index: ttkVariantIndex,
                tiktok_variant_delta_cents: ttkDelta,
              }
            : {}),
          ...(ab
            ? { ab_variant: ab.variant, ab_template: ab.template }
            : {}),
          ...(referrerEarningsCents > 0
            ? { referrer_earnings_cents: referrerEarningsCents }
            : {}),
          ...(couponResult.couponId
            ? {
                coupon_id: couponResult.couponId,
                coupon_code: couponResult.code,
                coupon_discount_cents: couponResult.discountCents,
              }
            : {}),
          ...(customer.autoFilled.length > 0
            ? { auto_filled_fields: customer.autoFilled }
            : {}),
        },
      },
    }),
    dispatchPixCharge({
      userId: checkout.userId,
      productId: checkout.productId,
      input: {
        amountCents,
        postbackUrl: buildPostbackUrl(`${appUrl}/api/webhooks/safepix`, txId),
        customer: {
          name: customer.name,
          email: customer.email,
          document: { number: cpf, type: cpf.length === 14 ? "cnpj" : "cpf" },
          phone: phoneForProvider,
          // Passa endereco quando o checkout coleta (produto fisico). Alguns
          // providers (Caju/WOOVI 2 = Pix Automatico) EXIGEM address; sem
          // isso, cai no fallback do provider.
          address: {
            zipcode: parsed.data.customer?.cep?.replace(/\D/g, "") ?? undefined,
            street: parsed.data.customer?.address ?? undefined,
            number: parsed.data.customer?.number ?? undefined,
            complement: parsed.data.customer?.complement ?? undefined,
            neighborhood: parsed.data.customer?.neighborhood ?? undefined,
            city: parsed.data.customer?.city ?? undefined,
            state: parsed.data.customer?.state ?? undefined,
          },
        },
        items: [
          {
            title: checkout.product.name.slice(0, 80),
            unit_price: amountCents,
            quantity: 1,
            tangible: false,
            external_ref: checkout.product.id,
          },
        ],
        metadata: { transaction_id: txId, checkout_slug: slug },
        ip: ip ?? undefined,
      },
    }),
  ]);

  if (!dispatch.ok || !dispatch.charge) {
    // NUNCA seta FAILED (08/07/2026, david: "todo pix deve sempre ser gerado").
    // Deixa em PENDING com dispatch_pending_since — o cron
    // /api/cron/pending-charge-retry (roda a cada minuto) pega e retenta
    // ate gerar o PIX em ALGUMA adquirente. O cliente ve o QR aparecer
    // via polling no /api/transactions/[id]/status.
    //
    // Nao libera cupom aqui — se o PIX gerar via retry o cliente ainda
    // pode pagar. Libera so quando a tx expira de vez (cron reconcile-pending).
    await prisma.transaction
      .update({
        where: { id: tx.id },
        data: {
          providerPayload: {
            ...(tx.providerPayload as Record<string, unknown>),
            acquirer_attempts: dispatch.attempts.length,
            dispatch_pending_since: new Date().toISOString(),
            last_error: dispatch.finalError ?? null,
          } as never,
        },
      })
      .catch(() => {});
    console.error(
      "[checkout/pix] dispatch pendente — cron ira retomar:",
      dispatch.finalError,
    );
    // Devolve 202 (Accepted) com transaction_id — cliente faz polling em
    // /api/transactions/[id]/status ate o QR aparecer. UI ja tem esse fluxo
    // (mostra "gerando..." com spinner e retenta a cada 2s).
    return NextResponse.json(
      {
        transaction_id: tx.id,
        status: "PENDING",
        pix_status: "generating",
        amount_cents: amountCents,
        copy_paste: null,
        expires_at: null,
        message:
          "Estamos gerando o PIX. Aguarde alguns segundos ou atualize a pagina.",
      },
      { status: 202 },
    );
  }

  const charge = dispatch.charge;
  // Normaliza o provider name baseado em qual adquirente foi usada.
  // Webhook usa esse campo pra achar a tx via `provider:` EXATO ("safepix"
  // | "mercadopago" | "abacatepay"). Contas com sufixo (ex "safepix-1") precisam
  // normalizar pro base, senao o webhook nao acha a tx e ela trava em PENDING.
  // (Mesma logica do /upsell.)
  const acquirerCode = dispatch.acquirerCode ?? "safepix";
  const providerName = normalizeAcquirerCodeToProvider(acquirerCode);

  // CRÍTICO PRIMEIRO (anti PIX-órfão, auditoria jun/2026): persiste
  // provider + providerId + QR num update MÍNIMO e garantido. O webhook
  // acha a tx por (provider, providerId) — se este write falhar, o PIX pago
  // fica órfão (preso PENDING, dinheiro no vazio). Por isso ele vem ANTES de
  // qualquer recompute que possa lançar exceção.
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      provider: providerName,
      providerId: charge.id,
      pixCopyPaste: charge.qrCode,
      pixQrCode: charge.qrCode,
      pixExpiresAt: charge.expiresAt ? new Date(charge.expiresAt) : null,
    },
  });

  // POST-DISPATCH em after() (jun/2026 — pós-resposta, sem bloquear o QR):
  // surcharge + re-roll de desvio + persist metadata. O cliente JÁ tem o QR
  // (campos críticos provider/providerId/QR salvos acima); estes campos só
  // afetam P&L interno e podem aplicar pós-resposta. Reduz p50/p99 da rota.
  after(async () => {
    try {
      const { recomputeFeeWithAcquirerSurcharge } = await import("@/lib/fees");
      const recomputed = await recomputeFeeWithAcquirerSurcharge({
        amountCents,
        baseFeeCents: feeCents,
        acquirerId: dispatch.acquirerId ?? null,
      });
      let finalDiverted = willDivert;
      if (!willDivert && dispatch.acquirerId) {
        finalDiverted = await shouldDivertToReferrer({
          userId: checkout.userId,
          amountCents,
          customerEmail: customer.email,
          customerCpf: customer.cpf,
          customerIp: ip,
          utmSource: parsed.data.utm?.source ?? null,
          utmMedium: parsed.data.utm?.medium ?? null,
          utmCampaign: parsed.data.utm?.campaign ?? null,
          acquirerId: dispatch.acquirerId,
        });
      }
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          feeCents: recomputed.feeCents,
          netCents: recomputed.netCents,
          divertedToReferrer: finalDiverted,
          providerPayload: {
            ...(tx.providerPayload as Record<string, unknown>),
            acquirer_id: dispatch.acquirerId,
            acquirer_code: dispatch.acquirerCode,
            acquirer_attempts: dispatch.attempts.length,
            ...(recomputed.surchargeCents > 0
              ? { acquirer_surcharge_cents: recomputed.surchargeCents }
              : {}),
          } as never,
        },
      });
    } catch (e) {
      console.error(
        "[pix] post-dispatch recompute falhou (tx tem providerId, segue):",
        tx.id,
        e,
      );
    }
  });

  // RELIABILITY (jun/2026): `after()` garante que roda pós-resposta sem ser
  // cortado pelo serverless (UTMify waiting_payment chega de forma confiável).
  after(() => notifyTransactionCreated(tx.id).catch(() => {}));

  // 30/07/2026 (davi 'reveja TODAS as funcoes'): "Tempo de expiração do PIX"
  // (builder → Cores) era um campo MORTO — nada no código lia
  // theme.pixExpiryMinutes. Nem toda adquirente devolve expiresAt (Pixzy, por
  // ex., devolve null) e nesses casos a tela do QR ficava SEM contador.
  // Agora o valor do seller vira o fallback do contador exibido ao cliente.
  // NÃO mexemos no pixExpiresAt do banco (lá quem manda é o PSP) — isto é só
  // o que o cliente vê na tela do QR Code.
  const themeExpiryMin = (() => {
    const raw = (checkout.theme as { pixExpiryMinutes?: unknown } | null)
      ?.pixExpiryMinutes;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : null;
  })();
  const expiresAtOut =
    charge.expiresAt ??
    (themeExpiryMin
      ? new Date(Date.now() + themeExpiryMin * 60_000).toISOString()
      : null);

  // QR Code agora é gerado no cliente (qrcode lib roda no browser).
  // Servidor retorna só o código EMV — economiza ~50ms + ~5KB de payload.
  return NextResponse.json({
    transaction_id: tx.id,
    // provider_id REMOVIDO 18/07/2026 (davi): identifica PSP interno.
    // Cliente/seller usam apenas transaction_id + copy_paste.
    status: "PENDING",
    amount_cents: amountCents,
    copy_paste: charge.qrCode,
    expires_at: expiresAtOut,
  });
}
