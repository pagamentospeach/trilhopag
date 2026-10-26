import { NextResponse } from "next/server";
import { auditSafepixBalances } from "@/lib/safepix-balance-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron a cada 20 MINUTOS — AUDITORIA DE SALDO SafePix (tripwire de fraude).
 *
 * Compara o saldo das contas SafePix com o último snapshot. Se o saldo caiu e
 * os saques do gateway (auto/manual/sweep) + reembolsos NÃO explicam a queda,
 * cria um alerta crítico no admin (possível dreno não autorizado). Best-effort.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED: sem secret no env = 401.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await auditSafepixBalances();
  return NextResponse.json(result);
}
