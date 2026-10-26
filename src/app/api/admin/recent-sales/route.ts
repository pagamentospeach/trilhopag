import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Feed de vendas pro painel /admin01/insights (polling client-side).
 * Admin-only. Retorna as ultimas vendas PAGAS reais (exclui testes).
 */
export async function GET() {
  const r = await requireAdmin();
  if (!r) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // FIX 08/07/2026 (Felipe Lopes "— eterno"): inclui createdAt no select
  // pra fallback quando paidAt vem null (webhook marcou PAID mas nao seteou
  // timestamp em algum branch antigo — tx zumbi mas venda real).
  const sales = await prisma.transaction.findMany({
    where: { status: "PAID", provider: { not: "test" } },
    select: {
      id: true,
      amountCents: true,
      method: true,
      paidAt: true,
      createdAt: true,
      provider: true,
      customerEmail: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      user: { select: { id: true, email: true, name: true } },
    },
    // paidAt DESC NULLS LAST — Postgres default poria null primeiro
    // (venda zumbi PAID sem paidAt no topo eterno).
    orderBy: [
      { paidAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 30,
  });

  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    sales: sales.map((s) => ({
      id: s.id,
      amountCents: s.amountCents,
      method: s.method,
      provider: s.provider,
      // paidAt ?? createdAt — nunca null. Evita traço eterno na UI.
      paidAt: (s.paidAt ?? s.createdAt).toISOString(),
      customerEmail: s.customerEmail,
      sellerId: s.user.id,
      seller: s.user.name ?? s.user.email,
      diverted: s.divertedToAcquirer || s.divertedToReferrer,
    })),
  });
}
