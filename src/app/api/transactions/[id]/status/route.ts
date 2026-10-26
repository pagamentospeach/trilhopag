import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveUpsellChoice } from "@/lib/upsell-ab";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Polling endpoint usado pelo checkout pra detectar PAID.
 *
 * IDOR mitigation:
 *  - transactionId é cuid (>10^30 entropia) — não é enumerável por brute force
 *  - thankYouUrl só é retornada quando status=PAID (não vaza upsell até pagar)
 *  - Rate limit por IP: 120 req/min — impede polling massivo abusivo
 *  - Response minimal: zero info sensível (sem valor, sem email, sem user)
 *
 * Headers no-cache estritos pra evitar cache compartilhado.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  // Rate limit por IP — antípoda de enumeration scanning
  const ip = getClientIp(request);
  const rl = rateLimit(`tx-status:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rl.resetIn / 1000).toString(),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // Validação básica do formato (cuid tem ~22-25 chars alfanuméricos)
  if (typeof id !== "string" || id.length < 10 || id.length > 64 || !/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json(
      { error: "invalid_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      paidAt: true,
      expiredAt: true,
      upsellShownVariant: true,
      method: true,
      amountCents: true,
      customerState: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      // PIX fields — cliente que recebeu 202 (dispatch pendente) faz polling
      // aqui ate copy_paste aparecer. Suporta o novo fluxo "nunca falha, sempre
      // gera" (08/07/2026).
      pixCopyPaste: true,
      pixExpiresAt: true,
      providerId: true,
      checkout: {
        select: {
          upsellUrl: true,
          upsellAbTest: true,
          upsellRouting: true,
          upsellTargetCheckoutId: true,
          thankYouUrl: true,
          slug: true,
        },
      },
    },
  });
  if (!tx) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  // CRITICAL FIX (jun/2026): endpoint pulava upsellUrl, voltando so o
  // thankYouUrl. Resultado: clientes polling no checkout (dropv2,
  // pix-checkout) redirecionavam direto pro thankYou e o upsell nunca
  // disparava. Agora respeitamos a mesma prioridade da pagina /obrigado:
  //   upsellUrl > thankYouUrl > /c/slug/obrigado (com upsell embed)
  //
  // AUDIT (06/07 — david): tx desviada NAO retorna upsellUrl nem
  // thankYouUrl externa. Se retornasse, o cliente iria pro upsell do
  // seller e a nova tx (linkada a essa desviada) apareceria pro seller
  // → denuncia o desvio. Fallback pra /obrigado interno (que TAMBEM
  // bloqueia oferta se desviada).
  const isDiverted = tx.divertedToAcquirer || tx.divertedToReferrer;
  let thankYouUrl: string | null = null;
  if (tx.status === "PAID" && !isDiverted) {
    // A/B: sorteia a variante de upsell de forma determinística pelo id da tx
    // (estável entre polls). Sem A/B, retorna o upsellUrl único.
    const choice = tx.checkout
      ? resolveUpsellChoice(tx.checkout, tx.id, {
          method: tx.method,
          amountCents: tx.amountCents,
          customerState: tx.customerState,
        })
      : null;
    if (choice) {
      thankYouUrl = choice.url;
      // Atribuição: grava a variante MOSTRADA (1x — na primeira vez que cai
      // aqui PAID). Best-effort: NUNCA quebra o redirect se a escrita falhar.
      if (!tx.upsellShownVariant) {
        try {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              upsellShownVariant: choice.variantLabel ?? "single",
              upsellShownCheckoutId: choice.targetCheckoutId,
            },
          });
        } catch {
          // ignora — métrica de funil não pode atrapalhar o pós-venda
        }
      }
    } else if (tx.checkout?.thankYouUrl) {
      thankYouUrl = tx.checkout.thankYouUrl;
    } else if (tx.checkout?.slug) {
      thankYouUrl = `/c/${tx.checkout.slug}/obrigado?tx=${tx.id}`;
    }
  }

  // pix_status ajuda o front a saber se ja pode mostrar o QR:
  //  - "generating": tx PENDING mas ainda sem copy_paste (cron esta retentando)
  //  - "ready": copy_paste disponivel, mostra QR pra pagar
  //  - "paid": ja pago
  //  - "expired": expirou sem pagamento
  const pixStatus =
    tx.status === "PAID"
      ? "paid"
      : tx.status === "EXPIRED" || tx.expiredAt
        ? "expired"
        : tx.pixCopyPaste
          ? "ready"
          : "generating";

  return NextResponse.json(
    {
      transaction_id: tx.id,
      status: tx.status,
      pix_status: pixStatus,
      paid_at: tx.paidAt?.toISOString() ?? null,
      expired_at: tx.expiredAt?.toISOString() ?? null,
      thankYouUrl,
      // PIX QR (aparece quando dispatch termina). Cliente que teve 202 fica
      // fazendo polling ate copy_paste virar non-null.
      pix:
        tx.method === "PIX"
          ? {
              copy_paste: tx.pixCopyPaste,
              expires_at: tx.pixExpiresAt?.toISOString() ?? null,
            }
          : null,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
