import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Marca que o cliente clicou em "Copiar PIX" no checkout.
 *
 * Métrica de conversão: PIX gerado mas não copiado = lead que nem chegou
 * a tentar pagar (provavelmente saiu do checkout). Comparar com vendas
 * aprovadas dá noção do funil:
 *   gerados -> copiados -> pagos
 *
 * Endpoint PÚBLICO (cliente do checkout ainda não tem sessão) mas só
 * grava `pixCopiedAt` se ainda for null (idempotente — multiplos clicks
 * contam como 1 conversão de copy). Rate-limited pra evitar spam.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const ip = getClientIp(request);
  const rl = rateLimit(`tx-copy:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // updateMany com condição garante:
  //  - Só marca se ainda for null (primeiro click só)
  //  - Não vaza informação se a tx não existe (count=0)
  const result = await prisma.transaction.updateMany({
    where: { id, pixCopiedAt: null, method: "PIX" },
    data: { pixCopiedAt: new Date() },
  });

  // Tambem flag pixCopied no CheckoutVisit se o body trouxer sessionId.
  // Best-effort — falhas nao bloqueiam o tracking principal.
  try {
    const body = await request.json().catch(() => ({}));
    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.slice(0, 64) : null;
    if (sessionId && sessionId.length >= 8) {
      // pega checkoutId via tx
      const tx = await prisma.transaction.findUnique({
        where: { id },
        select: { checkoutId: true },
      });
      if (tx?.checkoutId) {
        await prisma.checkoutVisit
          .updateMany({
            where: { sessionId, checkoutId: tx.checkoutId },
            data: { pixCopied: true },
          })
          .catch(() => {});
      }
    }
  } catch {
    // ignore — tracking secundario
  }

  return NextResponse.json({ ok: true, updated: result.count > 0 });
}
