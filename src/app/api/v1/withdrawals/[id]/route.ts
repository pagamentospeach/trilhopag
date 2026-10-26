import { NextResponse } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/* ============================================================
 * GET /api/v1/withdrawals/{id} — status de um saque específico.
 * Escopado à conta dona da API key (não vaza saque de outro seller).
 * ============================================================ */
async function GET_handler(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "withdrawals");
  if (scopeDenied) return scopeDenied;

  const { id } = await ctx.params;

  const w = await prisma.withdrawal.findFirst({
    where: { id, userId: record.userId },
  });
  if (!w) {
    return errorResponse(404, "withdrawal_not_found", "Saque não encontrado.");
  }

  return NextResponse.json({
    id: w.id,
    object: "withdrawal",
    status: w.status,
    method: w.method,
    amount_cents: w.amountCents,
    fee_cents: w.feeCents,
    net_cents: Math.max(0, w.amountCents - w.feeCents),
    pix_key: w.method === "pix" ? w.pixKey : null,
    pix_key_type: w.method === "pix" ? w.pixKeyType : null,
    wallet_address: w.method === "usdt_solana" ? w.walletAddress : null,
    fail_reason: w.failReason,
    // provider_id REMOVIDO 18/07/2026 (davi): identifica PSP de saída.
    paid_at: w.paidAt?.toISOString() ?? null,
    created_at: w.createdAt.toISOString(),
    updated_at: w.updatedAt.toISOString(),
  });
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);
