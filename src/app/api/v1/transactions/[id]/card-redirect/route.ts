import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getSellerCheckoutUrl } from "@/lib/seller-checkout-url";

export const dynamic = "force-dynamic";

/**
 * Redireciona o cliente final pra checkout publico pra pagamento cartao.
 *
 * Quem chama: o LEAD do seller, clicando no `hosted_url` retornado pelo
 * POST /api/v1/transactions com method=card.
 *
 * Fluxo:
 *  1. Acha a transacao
 *  2. Pega o checkout vinculado (ou o primeiro checkout ativo do produto)
 *  3. Redireciona pra /c/<slug>?tx=<id>&prefill=1
 *
 * Sem auth (publico) — qualquer um com o ID da tx pode chegar aqui, mas
 * pra fingir uma tx valida precisa de cuid valido + tx tem que existir.
 * Rate-limited 60/min/IP pra evitar enumeracao.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const ip = getClientIp(request);
  const rl = rateLimit(`card-redirect:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return new NextResponse("Rate limited", { status: 429 });
  }

  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      method: true,
      status: true,
      productId: true,
      userId: true,
      checkoutId: true,
      checkout: { select: { slug: true, active: true } },
    },
  });

  if (!tx || tx.method !== "CARD") {
    return new NextResponse("Transação inválida", { status: 404 });
  }
  if (tx.status === "PAID") {
    return new NextResponse("Transação já paga", { status: 410 });
  }

  // 1. Se tem checkout vinculado e ativo → usa
  let slug: string | null = tx.checkout?.active ? tx.checkout.slug : null;

  // 2. Senão, pega o checkout ATIVO mais recente do produto
  if (!slug) {
    const c = await prisma.checkout.findFirst({
      where: { productId: tx.productId, active: true },
      orderBy: { createdAt: "desc" },
      select: { slug: true },
    });
    slug = c?.slug ?? null;
  }

  if (!slug) {
    return new NextResponse(
      "Nenhum checkout ativo pra esse produto — peça pro seller criar um",
      { status: 404 },
    );
  }

  // POLITICA JUN/2026: redireciona pro dominio PROPRIO do seller. Se ele
  // nao tem dominio verificado, /c/[slug] em trilhopag.com retorna 404 —
  // entao melhor retornar 404 aqui com mensagem clara, evitando "redirect
  // pra lugar que vai 404".
  // ?tx=<id> permite reusar a tx existente; ?prefill=1 sinaliza auto-submit.
  const sellerUrl = await getSellerCheckoutUrl(tx.userId, slug, {
    tx: tx.id,
    prefill: "1",
  });
  if (!sellerUrl) {
    return new NextResponse(
      "Seller precisa configurar dominio proprio verificado (politica jun/2026). Peca pro seller acessar /dashboard/dominios.",
      { status: 404 },
    );
  }
  return NextResponse.redirect(sellerUrl, 307);
}
