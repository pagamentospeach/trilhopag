import { NextResponse } from "next/server";
import { unhideNominalOrphans } from "@/lib/acquirer-nominal-dedup";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cron a cada HORA (0 * * * *):
 *
 * Percorre adquirentes atualmente ESCONDIDAS pela otimizacao automatica
 * (hiddenFromSellers=true) e verifica se o nominal delas deixou de ser
 * duplicado. Quando eh a UNICA ativa+visivel com aquele nominal, reativa
 * (hiddenFromSellers=false) e marca as notificacoes pendentes como
 * auto-resolvidas.
 *
 * NAO olha "as duplicatas achadas antes" — a checagem eh sempre contra
 * o estado ATUAL do sistema. Se o admin trocou o nominal na escondida
 * (ou o PSP mudou pra outro nome), a acquirer volta pros sellers no
 * proximo tick.
 *
 * Skip completo se a flag `acquirer_nominal_dedup_auto` estiver desligada
 * (delegado dentro de unhideNominalOrphans).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await unhideNominalOrphans();
  return NextResponse.json({ ok: true, ...result });
}
