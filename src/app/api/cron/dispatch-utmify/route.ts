import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchUtmify } from "@/lib/utmify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Dispatcher delayed do UTMify.
 *
 * Por que delayed? Quando admin edita o amount/fee de uma venda via
 * /admin01/users/[id], queremos que UTMify receba o VALOR JA EDITADO,
 * nao o original. Solucao: ao marcar PAID, agendamos
 * utmifyScheduledAt = paidAt + 60s. Este cron roda a cada minuto e
 * dispara as txs cuja janela ja venceu.
 *
 * Idempotencia: WHERE utmifyDispatchedAt IS NULL AND
 * utmifyScheduledAt <= now() — apos sucesso setamos utmifyDispatchedAt.
 * Se a chamada UTMify falhar, NAO setamos utmifyDispatchedAt — proxima
 * execucao do cron tenta de novo. Sem retry-backoff sofisticado (UTMify
 * tem timeout de 10s, cron roda a cada 60s — basta).
 *
 * Limite: BATCH=200 por execucao. Se houver acumulo maior, proxima
 * execucao pega os restantes (ordem ASC por utmifyScheduledAt).
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
      utmifyDispatchedAt: null,
      utmifyScheduledAt: { lte: now, not: null },
      provider: { not: "test" },
      // AUDIT (06/07 v6 — david): tx desviadas TAMBEM vao pra UTMify —
      // mas so como waiting_payment. O safety re-check dentro do
      // dispatchUtmify bloqueia qualquer tentativa de mandar "paid" pra
      // tx com divertedTo* true no DB. Fica presa como pending — parece
      // igual a venda normal que nunca foi paga. Zero indicio de desvio.
    },
    take: BATCH,
    orderBy: { utmifyScheduledAt: "asc" },
    include: { product: { select: { id: true, name: true } } },
  });

  let dispatched = 0;
  let skipped = 0;
  let failed = 0;

  for (const tx of due) {
    try {
      // DESVIO → forca o status no payload (nunca manda o PAID real do DB pra
      // venda desviada). Zera paidAt/refundedAt: um status nao-pago nao pode
      // carregar approvedDate (se manter, a UTMify infere que foi paga).
      //
      //  - divertedToAcquirer (skim TOTAL, some pro seller): manda REFUSED
      //    (terminal). ANTES mandava PENDING/waiting_payment, mas o monitoring
      //    PROPRIO da UTMify (que confere o PSP) flipava o pending p/ "paid"
      //    sozinho → a venda desviada VAZAVA como paga (over-count: seller via
      //    mais vendas pagas na UTMify do que na Trilho, reportado pelo alexandre).
      //    refused e terminal: a UTMify nao conta como venda nem ressuscita.
      //    Fica igual a uma cobranca recusada/abandonada — zero denuncia do desvio.
      //  - divertedToReferrer (desvio de REDE): a venda APARECE pro seller e
      //    conta na conversao dele — mantem PENDING (comportamento atual; NAO e
      //    o vetor do over-count).
      let txForDispatch: typeof tx = tx;
      if (tx.divertedToAcquirer) {
        txForDispatch = { ...tx, status: "CANCELED", paidAt: null, refundedAt: null };
      } else if (tx.divertedToReferrer) {
        txForDispatch = { ...tx, status: "PENDING", paidAt: null, refundedAt: null };
      }
      const result = await dispatchUtmify({
        userId: tx.userId,
        transaction: txForDispatch,
        product: { id: tx.productId, name: tx.product.name },
      });

      if (result.ok) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { utmifyDispatchedAt: new Date() },
        });
        dispatched++;
      } else if (result.skipped || result.permanent) {
        // not_configured / product_not_enabled OU erro 4xx permanente (token
        // inválido, createdAt fora da janela, payload) — marca dispatched pra
        // NAO re-tentar pra sempre (antes martelava UTMify a cada minuto).
        // Token corrigido pelo seller → próximas vendas (frescas) funcionam.
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { utmifyDispatchedAt: new Date() },
        });
        skipped++;
      } else {
        // Falha transitória (5xx / timeout) — deixa pra proxima execucao tentar.
        failed++;
      }
    } catch (e) {
      console.error(
        "[cron/dispatch-utmify] error dispatching tx:",
        tx.id,
        e,
      );
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    dispatched,
    skipped,
    failed,
    totalDue: due.length,
  });
}
