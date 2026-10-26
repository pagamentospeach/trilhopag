/**
 * Cron: garante que os bots de funil estejam no ar 24h por dia.
 *
 * 30/07/2026 (davi): "Isso nunca mais pode acontecer, todos os bots devem
 * funcionar 24h por dia!" — depois de um bot ficar mudo por dias sem que
 * ninguém percebesse (o painel ainda mostrava "Bot rodando").
 *
 * Roda de 10 em 10 minutos. Para cada bot que DEVERIA estar respondendo:
 * confere webhook/token/funil, religa sozinho o que dá (webhook caído ou
 * apontando pro lugar errado) e avisa o seller por push do que não dá.
 * Também destrava conversas cujo cooldown de /start já venceu.
 *
 * A lógica toda vive em src/lib/bot-health.ts — aqui é só o gatilho.
 */
import { NextResponse } from "next/server";
import { runBotHealthCheck, sweepExpiredAutoBlocks } from "@/lib/bot-health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let unblocked = 0;
  try {
    unblocked = await sweepExpiredAutoBlocks();
  } catch (e) {
    console.error("[bot-health] sweepExpiredAutoBlocks error:", e);
  }

  try {
    const r = await runBotHealthCheck();
    if (r.broken > 0 || r.repaired > 0) {
      console.warn(
        `[bot-health] ${r.checked} bots · ok=${r.ok} consertados=${r.repaired} ` +
          `quebrados=${r.broken} avisos=${r.alerted} destravados=${unblocked}`,
      );
    }
    return NextResponse.json({
      ok: true,
      checked: r.checked,
      healthy: r.ok,
      repaired: r.repaired,
      broken: r.broken,
      alerted: r.alerted,
      unblocked,
      // Só o que precisa de atenção humana — evita resposta gigante.
      issues: r.reports
        .filter((x) => x.status === "broken")
        .map((x) => ({ botId: x.botId, name: x.name, issue: x.issue, detail: x.detail })),
    });
  } catch (e) {
    console.error("[bot-health] error:", e);
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? "erro" },
      { status: 500 },
    );
  }
}
