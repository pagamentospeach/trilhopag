import { NextResponse } from "next/server";
import { releasePendingToBalance } from "@/lib/holding-release";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cron a cada 1 MINUTO:
 *
 * Libera pro balanceCents do seller vendas onde availableAt <= now AND
 * releasedToBalance = false:
 *   - PIX: 1 minuto após paidAt
 *   - CARD: 30 dias após paidAt (descontando os 10% retidos)
 *
 * Credita também os referrer earnings na mesma operação.
 *
 * Idempotente — usa updateMany condicional anti-race.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED: sem secret no env = 503. Antes era curto-circuito que
  // deixava cron ABERTO se a env var não carregasse — atacante podia
  // forçar release antecipado pra esvaziar holding.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await releasePendingToBalance();
  return NextResponse.json({
    ok: true,
    ...result,
  });
}
