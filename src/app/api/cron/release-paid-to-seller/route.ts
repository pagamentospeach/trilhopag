import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fireSellerSidePaidDispatches } from "@/lib/transactions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Release-paid-to-seller — encerra a janela de 60s.
 *
 * Quando uma tx vira PAID, em vez de disparar TUDO imediatamente o
 * markTransactionPaid agenda sellerNotifyScheduledAt = paidAt + 60s.
 * Nesse intervalo:
 *   - Admin VE a tx como PAID (pode editar valor, desviar via UI).
 *   - SELLER NAO ve a tx (filtro `sellerNotifiedAt IS NOT NULL` em todas
 *     as views seller-facing).
 *   - Nenhum webhook/push/email/pixel/sale-bot disparou.
 *   - Saldo NAO foi creditado (availableAt forcado a paidAt+60s minimo).
 *   - Referrer NAO foi creditado (split de divertedToReferrer aguarda).
 *
 * Este cron roda 1×/min. Para cada tx vencida, chama
 * fireSellerSidePaidDispatches que LE o estado FINAL (admin pode ter
 * editado/desviado nos 60s) e:
 *   - divertedToAcquirer: skip total (skim silencioso).
 *   - divertedToReferrer: credita referrer + grava split no payload.
 *   - Normal: webhook + push + email + sale-bot + conquistas + recorrencia
 *     + pixels + CRM.
 *
 * Idempotente: WHERE sellerNotifiedAt IS NULL AND
 * sellerNotifyScheduledAt <= now() — depois do dispatch seta
 * sellerNotifiedAt = now. Race-safe via updateMany condicional.
 *
 * Limite: BATCH=200 por execucao. Excesso vai na proxima execucao.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const BATCH = 200;

  const due = await prisma.transaction.findMany({
    where: {
      status: "PAID",
      sellerNotifiedAt: null,
      sellerNotifyScheduledAt: { lte: now, not: null },
      provider: { not: "test" },
      // GATE ADICIONAL (18/07/2026, davi: "verifica se tem algo vazando"):
      // tx desviada NUNCA deve ter sellerNotifiedAt setado. Antes o cron
      // pegava e marcava notified — inofensivo hoje (todas as views seller-
      // facing cross-check divertedTo*), mas: (1) polui auditoria, (2) se
      // algum caller futuro filtrar SÓ por sellerNotifiedAt IS NOT NULL,
      // vazamento imediato. Defesa em profundidade: se ta desviada, ignora.
      divertedToAcquirer: false,
      divertedToReferrer: false,
    },
    select: { id: true },
    take: BATCH,
    orderBy: { sellerNotifyScheduledAt: "asc" },
  });

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const { id } of due) {
    try {
      // Race-safe claim: so processa se sellerNotifiedAt AINDA eh null.
      const claim = await prisma.transaction.updateMany({
        where: { id, sellerNotifiedAt: null },
        data: { sellerNotifiedAt: new Date() },
      });
      if (claim.count === 0) {
        skipped++;
        continue;
      }

      // Dispatches FORA da updateMany — se falhar, sellerNotifiedAt ja
      // foi setado entao nao reprocessa (evita duplo webhook/push/email).
      // Falhas individuais sao loggadas pelas proprias funcoes.
      await fireSellerSidePaidDispatches(id);
      processed++;
    } catch (e) {
      console.error("[cron/release-paid-to-seller] failed for tx:", id, e);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    failed,
    totalDue: due.length,
  });
}
