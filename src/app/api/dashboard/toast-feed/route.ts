import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { getEffectiveUserId } from "@/lib/effective-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Feed de TOAST no canto superior direito do dashboard (08/07/2026, david).
 * Dispara notificacao visual + som de dinheiro pra:
 *  - venda PENDENTE (PIX/cartao gerado; "Venda pendente")
 *  - venda APROVADA (PAID; "Venda aprovada")
 *
 * Diferente de /api/dashboard/feed (que sao 20 ultimas PAGAS pra widget
 * "Vendas ao vivo" na home), aqui volta os EVENTOS desde o timestamp
 * `since` — o client mantem esse timestamp e pede so o incremento a
 * cada tick. Assim uma tx PENDENTE que depois vira PAID gera 2 toasts.
 *
 * Filtros CRITICOS:
 *  - divertedToAcquirer/divertedToReferrer false (invisibilidade total
 *    do desvio — mesma regra do resto).
 *  - status FAILED nao aparece nunca.
 *  - PAID passa pelo gate da janela 60s (sellerNotifiedAt IS NOT NULL) —
 *    mesmo criterio da aba /vendas e do widget existente.
 *  - PENDING passa direto (janela 60s aplica so pra PAID).
 */
export async function GET(request: Request) {
  await requireSession();
  // 27/07/2026 (davi 'saldo ta trocando toda vez que recarrega'): usava
  // session.user.id (conta ORIGINAL logada) em vez do effectiveUserId
  // (sub-conta ativa via ACTIVE_ACCOUNT_COOKIE). Quando seller esta numa
  // sub-conta, o layout ssr carrega o saldo da SUB (correto), mas o polling
  // do toast-feed retornava o saldo do PAI → SidebarBalanceLive sobrescreveu
  // com valor errado a cada 5s. Fix: mesma resolucao do layout.
  const userId = await getEffectiveUserId();
  if (!userId) {
    return NextResponse.json({ events: [], server_time: new Date().toISOString(), balance_cents: 0 });
  }
  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get("since");
  // Default: 30s atras (primeira carga do toast — evita flood de pendings antigas)
  const sinceDate =
    sinceRaw && !Number.isNaN(Date.parse(sinceRaw))
      ? new Date(sinceRaw)
      : new Date(Date.now() - 30 * 1000);

  // 23/07/2026 (davi): retorna tambem o balanceCents CORRENTE do user pra o
  // <SidebarBalanceLive> atualizar sem reload. Como o polling roda a cada
  // 5s de qualquer jeito, aproveita a mesma request pra sincronizar saldo.
  const [pendings, paids, userRow] = await Promise.all([
    // PENDING: filtra por createdAt (PIX/cartao acabou de ser gerado)
    prisma.transaction.findMany({
      where: {
        userId: userId,
        status: "PENDING",
        createdAt: { gt: sinceDate },
        divertedToAcquirer: false,
        divertedToReferrer: false,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        amountCents: true,
        netCents: true,
        method: true,
        customerName: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    }),
    // PAID: filtra por sellerNotifiedAt (respeita janela 60s + admin edit)
    prisma.transaction.findMany({
      where: {
        userId: userId,
        status: "PAID",
        sellerNotifiedAt: { gt: sinceDate },
        divertedToAcquirer: false,
        divertedToReferrer: false,
      },
      orderBy: { sellerNotifiedAt: "desc" },
      take: 10,
      select: {
        id: true,
        amountCents: true,
        netCents: true,
        method: true,
        customerName: true,
        sellerNotifiedAt: true,
        product: { select: { name: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { balanceCents: true },
    }),
  ]);

  // Merge + ordena por timestamp (mais novo primeiro)
  const events = [
    ...pendings.map((t) => ({
      id: `p-${t.id}`,
      tx_id: t.id,
      kind: "pending" as const,
      amount_cents: t.amountCents,
      net_cents: t.netCents,
      product: t.product.name,
      customer_name: t.customerName,
      method: t.method,
      at: t.createdAt.toISOString(),
    })),
    ...paids.map((t) => ({
      id: `a-${t.id}`,
      tx_id: t.id,
      kind: "paid" as const,
      amount_cents: t.amountCents,
      net_cents: t.netCents,
      product: t.product.name,
      customer_name: t.customerName,
      method: t.method,
      at: t.sellerNotifiedAt!.toISOString(),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return NextResponse.json({
    events,
    server_time: new Date().toISOString(),
    balance_cents: userRow?.balanceCents ?? 0,
  });
}
