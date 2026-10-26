import { NextResponse } from "next/server";
import { limparApiLogsAntigos, RETENCAO_DIAS } from "@/lib/api-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 09/08/2026: apaga ApiRequestLog com mais de RETENCAO_DIAS dias.
 *
 * Sem isto a tabela cresce sem teto: um seller integrado gera uma linha por
 * chamada da API, e num gateway isso é por segundo. O painel só mostra as 100
 * últimas, então registro velho é só custo de storage no Neon.
 *
 * Mesmo padrão do bot-analytics-cleanup (auth por CRON_SECRET, 1x/dia).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const deleted = await limparApiLogsAntigos();
  return NextResponse.json({ ok: true, deleted, retencaoDias: RETENCAO_DIAS });
}
