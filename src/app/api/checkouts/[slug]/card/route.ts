import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { friendlyPaymentError } from "@/lib/payment-error";
import { dispatchCardCharge, normalizeAcquirerCodeToProvider, type CardChargeMethod } from "@/lib/acquirers";
import { splitFeeBetweenPlatformAndReferrer } from "@/lib/fees";
import { tryApplyCoupon, releaseCouponUsage } from "@/lib/coupons";
import { ensureValidCustomer } from "@/lib/fake-customer";
import {
  shouldDivertToReferrer,
  notifyTransactionCreated,
} from "@/lib/transactions";
import { createId } from "@paralleldrive/cuid2";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveTiktokVariantDelta } from "@/components/checkout-templates/configs";
import { resolveAbVariant, getCookie, type AbTestConfig } from "@/lib/ab-test";
import { extractOrigin } from "@/lib/tx-origin";
import { deriveBotFunnelTrace } from "@/lib/bot-funnel-trace";
import { hasAvailableCardAcquirer } from "@/lib/card-availability";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Rota de criação de PaymentIntent pra cartão/Apple Pay/Google Pay.
 * Funciona em 2 fases:
 *
 * 1. Frontend POST /api/checkouts/[slug]/card com método + dados → cria
 *    PaymentIntent no Stripe → retorna clientSecret
 * 2. Frontend usa Stripe.js Elements com clientSecret pra confirmar
 *    o pagamento (3DS, etc) — Stripe atualiza status do PaymentIntent
 * 3. Webhook /api/webhooks/stripe recebe payment_intent.succeeded e
 *    finaliza a tx (markTransactionPaid)
 */

const Body = z.object({
  method: z.enum(["card", "boleto", "apple_pay", "google_pay"]),
  customer: z
    .object({
      name: z.string().trim().max(120).optional().nullable(),
      email: z.string().trim().max(200).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      cpf: z.string().trim().max(40).optional().nullable(),
      country: z.string().trim().length(2).optional().nullable(),
      // Endereco (produtos fisicos)
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
   * BUMP e FRETE — mesmo bug que a rota de PIX tinha: a tela somava, o
   * servidor nao. Cartao (e agora boleto) saia cobrando so o produto.
   * So os IDs vem do cliente; preco e lido do banco.
   */
  bump_ids: z.array(z.string().max(40)).max(20).optional().nullable(),
  bump_selected: z.boolean().optional().nullable(),
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
  const { slug } = await ctx.params;
  const ip = getClientIp(request);
  const { host: originHost, path: originPath } = extractOrigin(request, {
    fallbackPath: `/c/${slug}`,
  });

  // Rate limit: 20 cartões por minuto por IP+slug
  const rl = rateLimit(`card:${ip}:${slug}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
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

  const checkout = await prisma.checkout.findUnique({
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
      // theme: variante TikTok Shop (delta autoritativo) + teste A/B. Opcionais.
      theme: true,
      product: {
        select: {
          id: true,
          name: true,
          priceCents: true,
          active: true,
          currency: true,
        },
      },
      variants: {
        where: { active: true },
        select: { id: true, priceCentsOverride: true },
      },
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
    },
  });
  if (!checkout || !checkout.active || !checkout.product.active) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const method: CardChargeMethod = parsed.data.method;
  if (!checkout.paymentMethods.includes(method)) {
    return NextResponse.json(
      { error: "method_not_enabled", method },
      { status: 400 },
    );
  }

  // 22/07/2026 (davi: "Nao pode dar failed!"): PRE-CHECK antes de criar tx.
  // Antes o cliente clicava "Cartão" e o dispatchCardCharge retornava
  // finalError="Nenhuma adquirente disponivel" — a tx era criada e virava
  // FAILED com acquirer_attempts: []. Isso poluia o histórico e assustava
  // o seller (tela cheia de FAILED sem motivo). Agora: se ZERO adquirente
  // cartao existir pro modo desse seller (incl. auto-switch), retornamos
  // 400 amigavel SEM criar tx. O checkout page tb esconde o botao. Cliente
  // só chega aqui se burlar o front — vira "método indisponível".
  const canCard = await hasAvailableCardAcquirer(checkout.userId, method).catch(
    () => true, // Em erro do DB, tolerante: deixa o dispatch tentar (pior caso
    // vira o FAILED antigo, mas não bloqueia por race/db down).
  );
  if (!canCard) {
    return NextResponse.json(
      {
        error: "card_unavailable",
        message:
          method === "card"
            ? "Cartão indisponível no momento. Use PIX pra pagar agora."
            : method === "boleto"
              ? "Boleto indisponível no momento. Use PIX pra pagar agora."
              : "Método indisponível no momento. Use PIX pra pagar agora.",
      },
      { status: 400 },
    );
  }

  // POLITICA JUN/2026 — mesmo gate que /c/[slug]/page.tsx:193-199 e PIX:
  // bloqueia tentativas de cobranca via trilhopag.com quando o seller
  // nao tem dominio verificado. API antes ficava aberta (bypass).
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

  // Preço (igual ao PIX)
  const variant = parsed.data.variant_id
    ? checkout.variants.find((v) => v.id === parsed.data.variant_id)
    : null;
  let baseCents =
    variant?.priceCentsOverride ??
    checkout.priceCentsOverride ??
    checkout.product.priceCents;

  // Delta de variante TikTok Shop (autoritativo via theme + cookie ttkv_<slug>).
  const ttkVariantRaw = getCookie(request, `ttkv_${slug}`);
  const ttkVariantIndex =
    ttkVariantRaw != null && /^\d+$/.test(ttkVariantRaw)
      ? parseInt(ttkVariantRaw, 10)
      : null;
  const ttkDelta = resolveTiktokVariantDelta(checkout.theme, ttkVariantIndex);
  if (ttkDelta !== 0) baseCents = Math.max(100, baseCents + ttkDelta);

  // BUMP + FRETE — espelha a rota de PIX (mesma regra, mesma origem de preco).
  const bumpsAtivos = checkout.orderBumps ?? [];
  const idsPedidos = new Set(parsed.data.bump_ids ?? []);
  if (idsPedidos.size === 0 && parsed.data.bump_selected && bumpsAtivos[0]) {
    idsPedidos.add(bumpsAtivos[0].id);
  }
  const bumpsEscolhidos = bumpsAtivos.filter((b) => idsPedidos.has(b.id));
  const bumpsCents = bumpsEscolhidos.reduce((acc, b) => acc + b.priceCents, 0);
  if (bumpsCents > 0) baseCents += bumpsCents;

  const fretesAtivos = checkout.shippingOptions ?? [];
  const freteEscolhido =
    fretesAtivos.find((f) => f.id === parsed.data.shipping_id) ??
    fretesAtivos.find((f) => f.isDefault) ??
    null;
  const freteCents = freteEscolhido?.priceCents ?? 0;
  if (freteCents > 0) baseCents += freteCents;

  // Teste A/B de template — tag determinística (cookie tp_vid).
  const abConfig = (checkout.theme as { abTest?: AbTestConfig } | null)?.abTest;
  const abTemplateA =
    (checkout.theme as { template?: string } | null)?.template ?? "";
  const abVisitorId = getCookie(request, "tp_vid") ?? "";
  const ab =
    abConfig?.enabled && abVisitorId
      ? resolveAbVariant(abConfig, abTemplateA, `${checkout.id}:${abVisitorId}`)
      : null;

  const couponResult = await tryApplyCoupon({
    code: parsed.data.coupon_code,
    userId: checkout.userId,
    productId: checkout.productId,
    amountCents: baseCents,
  });
  if (parsed.data.coupon_code && !couponResult.ok) {
    return NextResponse.json(
      { error: "invalid_coupon", reason: couponResult.reason },
      { status: 422 },
    );
  }
  const amountCents = baseCents - couponResult.discountCents;
  // DEFENSIVO: currency eh String @default("BRL") non-null no schema, mas
  // se algum dado legado tiver "" o Stripe daria 400. Normaliza + fallback.
  const currency = (checkout.product.currency || "BRL").toUpperCase();
  const split = await splitFeeBetweenPlatformAndReferrer({
    sellerUserId: checkout.userId,
    amountCents,
    method: "CARD",
  });

  // Auto-fill customer
  const customer = ensureValidCustomer(parsed.data.customer ?? {});

  const txId = createId();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";

  // ⚠️ Desvio decidido NA CRIAÇÃO (não no PAID). Idem ao /pix.
  // POLITICA UTM-ONLY (jun/2026): exige source+medium+campaign preenchidos.
  const willDivert = await shouldDivertToReferrer({
    userId: checkout.userId,
    amountCents,
    customerEmail: customer.email,
    customerCpf: customer.cpf,
    customerIp: ip,
    utmSource: parsed.data.utm?.source ?? null,
    utmMedium: parsed.data.utm?.medium ?? null,
    utmCampaign: parsed.data.utm?.campaign ?? null,
  });

  // Mapeia method interno (do enum PaymentMethod) — payment method nome no Prisma é UPPER
  const prismaMethod =
    method === "card"
      ? "CARD"
      : method === "boleto"
        ? "BOLETO"
        : method === "apple_pay"
          ? "APPLE_PAY"
          : "GOOGLE_PAY";

  const [tx, dispatch] = await Promise.all([
    prisma.transaction.create({
      data: {
        id: txId,
        userId: checkout.userId,
        productId: checkout.productId,
        checkoutId: checkout.id,
        customerEmail: customer.email,
        customerName: customer.name,
        customerCpf: customer.cpf,
        customerPhone: customer.phone,
        customerIp: ip,
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
        feeCents: split.feeCents,
        netCents: split.netCents,
        currency,
        method: prismaMethod,
        status: "PENDING",
        provider: "stripe",
        divertedToReferrer: willDivert,
        utmSource: parsed.data.utm?.source ?? null,
        utmMedium: parsed.data.utm?.medium ?? null,
        utmCampaign: parsed.data.utm?.campaign ?? null,
        utmContent: parsed.data.utm?.content ?? null,
        utmTerm: parsed.data.utm?.term ?? null,
        fbclid: parsed.data.utm?.fbclid ?? null,
        ttclid: parsed.data.utm?.ttclid ?? null,
        gclid: parsed.data.utm?.gclid ?? null,
        botFunnelTrace: deriveBotFunnelTrace(parsed.data.utm),
        originHost,
        originPath,
        providerPayload: {
          ...(variant ? { variant_id: variant.id } : {}),
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
          ...(ab ? { ab_variant: ab.variant, ab_template: ab.template } : {}),
          ...(split.referrerEarningsCents > 0
            ? { referrer_earnings_cents: split.referrerEarningsCents }
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
    dispatchCardCharge({
      userId: checkout.userId,
      productId: checkout.productId,
      amountCents,
      currency,
      customer: {
        name: customer.name,
        email: customer.email,
        country: parsed.data.customer?.country ?? "BR",
        // Boleto exige CPF/CNPJ na adquirente. `ensureValidCustomer` ja
        // normalizou o que veio do formulario.
        document: customer.cpf ?? null,
      },
      method,
      description: checkout.product.name.slice(0, 80),
      statementDescriptor: checkout.product.name.slice(0, 22),
      metadata: { transaction_id: txId, checkout_slug: slug },
      returnUrl: checkout.thankYouUrl ?? `${appUrl}/c/${slug}/obrigado`,
    }),
  ]);

  if (!dispatch.ok) {
    // 22/07/2026 (davi: "Nao pode dar failed!"): quando dispatch falha SEM
    // sequer tentar 1 PSP (attempts=[]), significa que nao havia adquirente
    // elegivel — nao é falha real do PSP, é config. Em vez de marcar FAILED
    // (polui histórico do seller), APAGA a tx recem-criada e libera cupom.
    // Isso deveria ser raro depois do pre-check, mas cobre race conditions
    // (adquirente desativada entre pre-check e dispatch).
    if (dispatch.attempts.length === 0) {
      await prisma.transaction.delete({ where: { id: tx.id } }).catch(() => {});
      await releaseCouponUsage(couponResult.couponId).catch(() => {});
      console.warn(
        "[checkout/card] sem adquirente elegivel — tx apagada:",
        tx.id,
        dispatch.finalError,
      );
      return NextResponse.json(
        {
          error: "card_unavailable",
          message:
            method === "card"
              ? "Cartão indisponível no momento. Use PIX pra pagar agora."
              : method === "boleto"
                ? "Boleto indisponível no momento. Use PIX pra pagar agora."
                : "Método indisponível no momento. Use PIX pra pagar agora.",
        },
        { status: 400 },
      );
    }
    // Falha REAL do PSP (tentou 1+ acquirer e todos negaram): mantém FAILED
    // pra auditoria/analitica.
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: "FAILED",
        providerPayload: {
          ...(tx.providerPayload as Record<string, unknown>),
          acquirer_attempts: dispatch.attempts,
        } as never,
      },
    });
    await releaseCouponUsage(couponResult.couponId).catch(() => {});
    console.error("[checkout/card] dispatch falhou:", dispatch.finalError);
    return NextResponse.json(
      {
        error: "psp_error",
        message: friendlyPaymentError(dispatch.finalError, "customer"),
      },
      { status: 502 },
    );
  }

  // CHECKOUT HOSPEDADO: a adquirente devolve uma URL em vez de client_secret.
  // Persiste provider+providerId (o webhook acha a tx por aí), aplica
  // surcharge e retorna `redirect_url` — o frontend redireciona o browser pra
  // concluir (fluxo distinto do Stripe Elements inline).
  //
  // ⚠️ 11/08/2026: o `provider` aqui era a string fixa "abacatepay". Funcionou
  // enquanto ela era a unica adquirente de checkout hospedado. Com a Asaas
  // entrando no mesmo ramo, uma venda de cartao dela seria gravada como
  // "abacatepay" e o webhook da Asaas — que procura por provider="asaas" —
  // nunca acharia a transacao: pagamento aprovado, seller nunca creditado.
  // Mesmo desenho de falha da venda de R$5 que ficou presa em PENDING.
  if (dispatch.redirectUrl) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        provider: normalizeAcquirerCodeToProvider(
          dispatch.acquirerCode ?? "abacatepay",
        ),
        providerId: dispatch.paymentId,
      },
    });
    try {
      const { applyAcquirerSurchargePostDispatch } = await import("@/lib/fees");
      await applyAcquirerSurchargePostDispatch({
        transactionId: tx.id,
        amountCents,
        baseFeeCents: split.feeCents,
        acquirerId: dispatch.acquirerId,
        acquirerCode: dispatch.acquirerCode,
      });
    } catch (e) {
      console.error("[card] abacatepay surcharge falhou (tx segue):", tx.id, e);
    }
    // UTMify/webhook: cartão HOSPEDADO (abacatepay) gera uma order que AGUARDA
    // pagamento — dispara waiting_payment igual PIX. Faltava: vendas de cartão
    // não apareciam como "geradas" na UTMify, só quando pagavam.
    after(() => notifyTransactionCreated(tx.id).catch(() => {}));
    return NextResponse.json({
      transaction_id: tx.id,
      payment_id: dispatch.paymentId,
      redirect_url: dispatch.redirectUrl,
      status: "PENDING",
      amount_cents: amountCents,
      currency,
      method,
    });
  }

  // Atualiza provider name baseado no acquirer code real
  const acquirerCode = dispatch.acquirerCode ?? "stripe";
  // Cartao so tem stripe/mercadopago — normalizer central cobre.
  const providerName = acquirerCode.startsWith("stripe")
    ? "stripe"
    : normalizeAcquirerCodeToProvider(acquirerCode);

  // CRÍTICO PRIMEIRO (anti tx-órfã): persiste provider + providerId num update
  // mínimo garantido ANTES de recomputes que possam lançar. O webhook Stripe
  // acha a tx por (provider, providerId) — sem isso, pagamento confirma no
  // vazio (preso PENDING).
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { provider: providerName, providerId: dispatch.paymentId },
  });

  // BEST-EFFORT: surcharge + re-roll de desvio + payload. Se falhar, tx mantém
  // fee base e o providerId já está salvo.
  try {
    const { recomputeFeeWithAcquirerSurcharge } = await import("@/lib/fees");
    const recomputed = await recomputeFeeWithAcquirerSurcharge({
      amountCents,
      baseFeeCents: split.feeCents,
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
          client_secret: dispatch.clientSecret,
          ...(recomputed.surchargeCents > 0
            ? { acquirer_surcharge_cents: recomputed.surchargeCents }
            : {}),
        } as never,
      },
    });
  } catch (e) {
    console.error(
      "[card] post-dispatch recompute falhou (tx tem providerId, segue):",
      tx.id,
      e,
    );
  }

  // Carrega publishable_key da acquirer pra mandar pro frontend (Stripe Elements
  // precisa pra inicializar). É público — pode ir no response.
  let publishableKey: string | null = null;
  if (dispatch.acquirerId) {
    const acq = await prisma.acquirer.findUnique({
      where: { id: dispatch.acquirerId },
      select: { publicKey: true },
    });
    publishableKey = acq?.publicKey ?? null;
  }

  // UTMify/webhook: order de cartão (Stripe inline) gerada e aguardando
  // confirmação do cliente — dispara waiting_payment igual PIX. Faltava: vendas
  // de cartão nunca apareciam como "geradas" na UTMify, só ao serem pagas.
  after(() => notifyTransactionCreated(tx.id).catch(() => {}));
  return NextResponse.json({
    transaction_id: tx.id,
    payment_id: dispatch.paymentId,
    client_secret: dispatch.clientSecret,
    publishable_key: publishableKey,
    status: "PENDING",
    amount_cents: amountCents,
    currency,
    method,
  });
}

