import { NextResponse, after } from "next/server";
import QRCode from "qrcode";
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
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { buildPostbackUrl } from "@/lib/security/webhook-secret";
import { extractOrigin } from "@/lib/tx-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  // NEVER-FAIL (jun/2026): blinda a rota — qualquer throw inesperado vira 503
  // amigável em vez de 500 cru. O cliente nunca vê erro técnico.
  try {
    return await handleUpsellPost(request, ctx);
  } catch (err) {
    console.error("[upsell] erro inesperado no POST (fallback amigável):", err);
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

async function handleUpsellPost(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const url = new URL(request.url);
  const originalTxId = url.searchParams.get("tx");
  if (!originalTxId) {
    return NextResponse.json({ error: "missing_tx" }, { status: 400 });
  }

  // FIX A7: rate-limit por IP+slug. originalTxId é público na thank-you page,
  // atacante poderia spammar este endpoint pra criar PIX em loop e drenar
  // quota da PSP. 10 requests / min por IP + slug é mais do que qualquer
  // user legítimo precisaria.
  const ip = getClientIp(request);
  const rl = rateLimit(`upsell:${ip}:${slug}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Leitura CRÍTICA com retry rápido (1x) em soluço transiente do Neon.
  const checkout = await withDbRetry(() =>
    prisma.checkout.findUnique({
      where: { slug },
      // pixOpsMode: teto de R$1.000 no modo white (ver lib/pix-limits).
      include: { product: true, user: { select: { pixOpsMode: true } } },
    }),
  );
  if (!checkout || !checkout.active || !checkout.upsellProductId) {
    return NextResponse.json({ error: "no_upsell_available" }, { status: 404 });
  }

  // POLÍTICA JUN/2026 — mesmo gate do /pix e /card: bloqueia upsell via
  // trilhopag.com quando o seller não tem domínio verificado. Antes o upsell
  // NÃO tinha gate nenhum (criava PIX sem dono de domínio elegível).
  const { host: originHost, path: originPath } = extractOrigin(request, {
    fallbackPath: `/c/${slug}/upsell`,
  });
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
      return NextResponse.json({ error: "seller_needs_domain" }, { status: 404 });
    }
  }

  const upsellProduct = await prisma.product.findFirst({
    where: { id: checkout.upsellProductId, active: true },
  });
  if (!upsellProduct) {
    return NextResponse.json({ error: "upsell_inactive" }, { status: 404 });
  }

  const originalTx = await prisma.transaction.findFirst({
    where: { id: originalTxId, checkoutId: checkout.id, status: "PAID" },
  });
  if (!originalTx) {
    return NextResponse.json(
      { error: "original_not_paid" },
      { status: 400 },
    );
  }
  // AUDIT (06/07 — david): tx original desviada NUNCA gera upsell. Se
  // gerasse, a segunda tx (upsell) apareceria pro seller com originalTxId
  // apontando pra uma tx que o seller NAO VE — denunciando o desvio.
  // Retorna 404 igual ao "sem upsell" pra client cair no fluxo padrao
  // (tela obrigado sem oferta).
  if (originalTx.divertedToAcquirer || originalTx.divertedToReferrer) {
    return NextResponse.json({ error: "no_upsell_available" }, { status: 404 });
  }

  const amountCents = upsellProduct.priceCents;

  // TETO WHITE R$1.000 (01/08/2026, davi). Vale pro upsell tambem — senao
  // bastava por o produto caro como upsell pra furar o teto.
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

  const willDivertUpsell = await shouldDivertToReferrer({
    userId: checkout.userId,
    amountCents,
    customerEmail: originalTx.customerEmail,
    customerCpf: originalTx.customerCpf,
    customerIp: originalTx.customerIp,
    utmSource: originalTx.utmSource,
    utmMedium: originalTx.utmMedium,
  });

  const tx = await prisma.transaction.create({
    data: {
      userId: checkout.userId,
      productId: upsellProduct.id,
      checkoutId: checkout.id,
      customerEmail: originalTx.customerEmail,
      customerName: originalTx.customerName,
      customerCpf: originalTx.customerCpf,
      customerPhone: originalTx.customerPhone,
      customerIp: originalTx.customerIp,
      // Herda endereco da tx original (mesmo cliente, mesma sessao)
      customerCep: originalTx.customerCep,
      customerAddress: originalTx.customerAddress,
      customerNumber: originalTx.customerNumber,
      customerComplement: originalTx.customerComplement,
      customerNeighborhood: originalTx.customerNeighborhood,
      customerCity: originalTx.customerCity,
      customerState: originalTx.customerState,
      amountCents,
      feeCents,
      netCents,
      currency: "BRL",
      method: "PIX",
      status: "PENDING",
      provider: "safepix",
      divertedToReferrer: willDivertUpsell,
      utmSource: originalTx.utmSource,
      utmMedium: originalTx.utmMedium,
      utmCampaign: originalTx.utmCampaign,
      utmContent: originalTx.utmContent,
      utmTerm: originalTx.utmTerm,
      fbclid: originalTx.fbclid,
      ttclid: originalTx.ttclid,
      gclid: originalTx.gclid,
      // Herda o trace do bot funnel (se veio via bloco payment modo LINK).
      // Assim o upsell também pode acordar o funil pelo branch pagou.
      botFunnelTrace: originalTx.botFunnelTrace,
      originHost,
      originPath,
      providerPayload: {
        upsell_of: originalTx.id,
        // BUG-FIX (rede): congela o ganho do referrer no upsell — antes o
        // payload só tinha upsell_of, então o split do referrer era DESCARTADO
        // (holding-release/markPaid nunca achavam referrer_earnings_cents e o
        // indicador não recebia comissão da venda de upsell).
        ...(split.referrerEarningsCents > 0
          ? { referrer_earnings_cents: split.referrerEarningsCents }
          : {}),
      },
    },
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";

  // Roteia pelo dispatcher pra respeitar a ordem de adquirentes do seller
  // (UserAcquirer.pixPriority). Se a primária falhar, tenta a próxima.
  const dispatch = await dispatchPixCharge({
    userId: checkout.userId,
    productId: upsellProduct.id,
    input: {
      amountCents,
      postbackUrl: buildPostbackUrl(`${appUrl}/api/webhooks/safepix`, tx.id),
      customer: {
        name: originalTx.customerName ?? "Cliente",
        email: originalTx.customerEmail,
        document: {
          number: originalTx.customerCpf ?? "",
          type: (originalTx.customerCpf ?? "").length === 14 ? "cnpj" : "cpf",
        },
        phone: originalTx.customerPhone ?? undefined,
      },
      items: [
        {
          title: `Upsell: ${upsellProduct.name.slice(0, 70)}`,
          unit_price: amountCents,
          quantity: 1,
          tangible: false,
          external_ref: upsellProduct.id,
        },
      ],
      metadata: {
        transaction_id: tx.id,
        upsell_of: originalTx.id,
        checkout_slug: slug,
      },
    },
  });

  if (!dispatch.ok || !dispatch.charge) {
    // NUNCA seta FAILED (08/07/2026, david: "todo pix deve sempre ser gerado").
    // Deixa em PENDING com dispatch_pending_since — cron pending-charge-retry
    // pega e retenta. Cliente ve o QR aparecer via polling em
    // /api/transactions/[id]/status.
    await prisma.transaction
      .update({
        where: { id: tx.id },
        data: {
          providerPayload: {
            ...(tx.providerPayload as Record<string, unknown>),
            dispatch_pending_since: new Date().toISOString(),
            last_error: dispatch.finalError ?? null,
          } as never,
        },
      })
      .catch(() => {});
    console.error(
      "[checkout/upsell] dispatch pendente — cron ira retomar:",
      dispatch.finalError,
    );
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

  // PROVIDER FIX (jun/2026): era hardcoded "safepix". Se o upsell caisse em
  // MP/AbacatePay, o webhook (que busca por provider) nunca achava a tx.
  // Agora deriva o provider do acquirerCode usado, igual ao /pix.
  const upsellAcquirerCode = dispatch.acquirerCode ?? "safepix";
  const upsellProviderName = normalizeAcquirerCodeToProvider(upsellAcquirerCode);

  // CRITICAL: persiste provider/providerId/QR/acquirer ANTES da resposta.
  // Webhook depende de (provider, providerId) e P&L do (acquirer_id).
  // Sem isso, PIX orfão + tx sem rastreio de qual conta processou.
  //
  // FIX 08/07/2026 (david): antes o acquirer_id so era gravado no after()
  // via applyAcquirerSurchargePostDispatch. Como after() eh best-effort
  // no Vercel (morrido quando o processo termina cedo), tx as vezes
  // ficavam com "s/ adq" no dashboard. Agora grava inline no mesmo
  // update — atomico + sempre roda.
  const currentUpsellTx = await prisma.transaction.findUnique({
    where: { id: tx.id },
    select: { providerPayload: true },
  });
  const currentUpsellPayload =
    (currentUpsellTx?.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      provider: upsellProviderName,
      providerId: charge.id,
      pixCopyPaste: charge.qrCode,
      pixQrCode: charge.qrCode,
      pixExpiresAt: charge.expiresAt ? new Date(charge.expiresAt) : null,
      providerPayload: {
        ...currentUpsellPayload,
        acquirer_id: dispatch.acquirerId,
        acquirer_code: dispatch.acquirerCode,
      } as never,
    },
  });

  let qrCodeDataUrl: string | null = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(charge.qrCode, {
      width: 320,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {}

  // SURCHARGE em after() (jun/2026 — pós-resposta, não bloqueia o QR):
  // P&L interno, pode aplicar após resposta sem impacto pro cliente.
  after(async () => {
    try {
      const { applyAcquirerSurchargePostDispatch } = await import("@/lib/fees");
      await applyAcquirerSurchargePostDispatch({
        transactionId: tx.id,
        amountCents,
        baseFeeCents: feeCents,
        acquirerId: dispatch.acquirerId,
        acquirerCode: dispatch.acquirerCode,
        extraPayload: { upsell_of: originalTx.id },
      });
    } catch (e) {
      console.error("[upsell] surcharge post-dispatch falhou:", e);
    }
  });
  // after(): roda pós-resposta sem ser cortado pelo serverless (UTMify
  // waiting_payment + webhook + push do upsell chegam de forma confiável).
  after(() => notifyTransactionCreated(tx.id).catch(() => {}));

  return NextResponse.json({
    transaction_id: tx.id,
    // provider_id REMOVIDO 18/07/2026 (davi): identifica PSP interno.
    status: "PENDING",
    amount_cents: amountCents,
    copy_paste: charge.qrCode,
    qr_code_image: qrCodeDataUrl,
    expires_at: charge.expiresAt,
  });
}
