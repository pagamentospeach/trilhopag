import { NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/api-response";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { getSellerBalanceBuckets } from "@/lib/holding-release";

export const dynamic = "force-dynamic";

/* ============================================================
 * GET /api/v1/balance — saldo da conta (equivalente ao /dashboard/balance
 * da SafePix, mas com o detalhamento real do Trilho).
 *
 * Retorna:
 *  - available_cents: saldo LIBERADO (sacável agora)
 *  - pending_pix_cents / pending_card_cents: vendas pagas ainda em holding
 *  - retained_card_cents: retenção de cartão (liberada após D+X)
 *  - in_withdrawal_cents: saques abertos (PENDING/PROCESSING) já debitados
 *  - upcoming_releases: calendário dos próximos releases
 *
 * O valor SACÁVEL via API é sempre `available_cents` (já released). Os outros
 * buckets são informativos.
 * ============================================================ */
async function GET_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "balance");
  if (scopeDenied) return scopeDenied;

  const userId = record.userId;

  const [buckets, openWithdrawals] = await Promise.all([
    getSellerBalanceBuckets(userId),
    prisma.withdrawal.aggregate({
      where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amountCents: true },
    }),
  ]);

  const inWithdrawalCents = openWithdrawals._sum.amountCents ?? 0;

  return NextResponse.json({
    object: "balance",
    currency: "BRL",
    // Sacável agora (já liberado no balanceCents do seller).
    available_cents: buckets.availableCents,
    // Vendas pagas ainda em holding (vão liberar no availableAt de cada uma).
    pending_pix_cents: buckets.pendingPixCents,
    pending_card_cents: buckets.pendingCardCents,
    // Retenção de cartão (libera no fim do período de retenção).
    retained_card_cents: buckets.retainedCardCents,
    // Saques já solicitados e debitados, aguardando pagamento.
    in_withdrawal_cents: inWithdrawalCents,
    // Próximos releases (calendário) — até 50.
    upcoming_releases: buckets.upcomingReleases.map((r) => ({
      transaction_id: r.txId,
      date: r.date,
      cents: r.cents,
      kind: r.kind,
      method: r.method,
    })),
  });
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);
