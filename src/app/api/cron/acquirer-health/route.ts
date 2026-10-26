import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeGlobalAcquirerRankingToday,
  applyBestGlobalOrderForUser,
} from "@/lib/best-order";

/**
 * Re-aplica a "melhor ordem global do gateway" pra todos os sellers que estão
 * com a função ligada. Calcula o ranking global UMA vez e reescreve a ordem de
 * cada seller. Roda a cada tick do acquirer-health (a cada 15 min).
 */
async function reapplyBestOrderForAll(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { autoBestOrderEnabled: true },
    select: { id: true },
  });
  if (users.length === 0) return 0;
  const ranking = await computeGlobalAcquirerRankingToday();
  let updated = 0;
  for (const u of users) {
    try {
      await applyBestGlobalOrderForUser(u.id, ranking);
      updated += 1;
    } catch (e) {
      console.error("[acquirer-health] best-order falhou p/", u.id, e);
    }
  }
  return updated;
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * CIRCUIT BREAKER de adquirente (OPT-IN, default OFF).
 *
 * So faz algo se ACQUIRER_BREAKER_ENABLED === "1" nas env vars. Quando
 * ligado: olha as transacoes da ULTIMA HORA por adquirente (via
 * providerPayload.acquirer_id) e, se uma adquirente teve >= MIN tentativas
 * e aprovacao < THRESHOLD, AUTO-DESATIVA (globalEnabled=false) pra parar de
 * queimar conversao. NUNCA re-ativa sozinha — admin reativa na mão depois
 * de resolver (em /admin01/acquirers).
 *
 * Os alertas (/api/admin/alerts) ja sinalizam aprovacao baixa mesmo com o
 * breaker desligado — este cron so adiciona a acao automatica.
 */
const MIN_ATTEMPTS = 20;
const THRESHOLD = 0.3; // 30%

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Re-aplica a melhor ordem global pra quem está com a função ligada.
  // Roda SEMPRE (independente do circuit breaker).
  let bestOrderUpdated = 0;
  try {
    bestOrderUpdated = await reapplyBestOrderForAll();
  } catch (e) {
    console.error("[acquirer-health] reapplyBestOrderForAll error:", e);
  }

  if (process.env.ACQUIRER_BREAKER_ENABLED !== "1") {
    return NextResponse.json({
      ok: true,
      breaker: "off",
      disabled: 0,
      bestOrderUpdated,
    });
  }

  try {
    const stats = await prisma.$queryRaw<
      Array<{ acq: string | null; total: number; paid: number }>
    >`
      SELECT "providerPayload"->>'acquirer_id' AS acq,
             COUNT(*)::int AS total,
             (COUNT(*) FILTER (WHERE status = 'PAID'))::int AS paid
      FROM "Transaction"
      WHERE "createdAt" >= now() - interval '60 minutes'
        AND provider <> 'test'
        AND "providerPayload"->>'acquirer_id' IS NOT NULL
      GROUP BY 1
    `;

    const toDisable: { id: string; total: number; rate: number }[] = [];
    for (const row of stats) {
      if (!row.acq || row.total < MIN_ATTEMPTS) continue;
      const rate = row.total > 0 ? row.paid / row.total : 0;
      if (rate < THRESHOLD) toDisable.push({ id: row.acq, total: row.total, rate });
    }

    let disabled = 0;
    for (const d of toDisable) {
      const res = await prisma.acquirer.updateMany({
        where: { id: d.id, globalEnabled: true },
        data: {
          globalEnabled: false,
          adminNote: `auto-desativada (breaker ${new Date().toLocaleString("pt-BR")}): aprovação ${(d.rate * 100).toFixed(0)}% em ${d.total} tentativas/1h`,
        },
      });
      if (res.count > 0) {
        disabled += res.count;
        console.warn(
          `[acquirer-breaker] DESATIVOU ${d.id}: ${(d.rate * 100).toFixed(0)}% aprovação em ${d.total} tentativas/1h`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      breaker: "on",
      checked: stats.length,
      disabled,
      bestOrderUpdated,
      flagged: toDisable.map((d) => ({ id: d.id, rate: Number(d.rate.toFixed(2)), total: d.total })),
    });
  } catch (e) {
    console.error("[acquirer-health] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
