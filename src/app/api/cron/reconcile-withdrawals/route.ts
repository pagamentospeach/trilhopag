import { NextResponse } from "next/server";
import { reconcileStuckWithdrawals } from "@/lib/reconcile-withdrawals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron a cada 10 MINUTOS — rede de segurança pros SAQUES AUTOMÁTICOS.
 *
 * Re-consulta na SafePix os saques auto presos em PROCESSING (webhook
 * safepix-transfer perdido) e finaliza os que a SafePix confirma como pagos
 * (markWithdrawalPaid) ou falhos (markWithdrawalFailed + estorno). Respostas
 * ambíguas ficam intocadas pro admin. Idempotente.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED: sem secret no env = 401.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await reconcileStuckWithdrawals();
  return NextResponse.json({ ok: true, ...result });
}
