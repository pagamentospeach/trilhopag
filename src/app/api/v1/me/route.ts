import { withApiLog } from "@/lib/api-log";
import { NextResponse } from "next/server";
import { authenticate, requireScope } from "@/lib/api-response";

async function GET_handler(request: Request) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "balance");
  if (scopeDenied) return scopeDenied;

  const u = record.user;
  return NextResponse.json({
    object: "account",
    id: u.id,
    email: u.email,
    name: u.name,
    balance_cents: u.balanceCents,
    pending_balance_cents: u.pendingBalanceCents,
    currency: u.defaultCurrency,
  });
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);
