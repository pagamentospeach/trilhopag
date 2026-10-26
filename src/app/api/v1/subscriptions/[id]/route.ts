import { NextResponse } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";
import { serializeSubscription } from "@/lib/recurrence";

export const dynamic = "force-dynamic";

/* GET /api/v1/subscriptions/{id} — consulta uma assinatura (PIX recorrente).
 * Autenticada só via API key, escopada ao dono. */
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
  const scopeDenied = requireScope(record, "subscriptions");
  if (scopeDenied) return scopeDenied;

  const { id } = await ctx.params;
  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    return errorResponse(400, "invalid_id", "Subscription id is malformed");
  }

  const s = await prisma.subscription.findFirst({
    where: { id, userId: record.userId },
  });
  if (!s) {
    return errorResponse(
      404,
      "subscription_not_found",
      "No subscription with this id belongs to your account",
    );
  }
  return NextResponse.json(serializeSubscription(s));
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);
