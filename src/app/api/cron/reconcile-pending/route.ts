import { NextResponse } from "next/server";
import {
  reconcilePendingAbacatePay,
  reconcileRefundedAbacatePay,
  reconcilePendingSharkBanking,
  reconcileRefundedSharkBanking,
  reconcilePendingCaju,
  reconcileMedCaju,
  reconcilePendingAsaas,
} from "@/lib/reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron a cada 10 MINUTOS — rede de segurança contra webhook PERDIDO.
 *
 * Re-consulta na API da AbacatePay as vendas PENDING recentes e marca como paga
 * (markTransactionPaid) as que a adquirente confirma como paga. Pega vendas que
 * foram pagas mas cujo webhook não chegou/não processou — sem isso, ficavam
 * presas em PENDING pra sempre (dinheiro do seller "sumindo").
 *
 * AbacatePay (jun/2026): o webhook é bloqueado se faltar ABACATEPAY_WEBHOOK_SECRET
 * no env; este reconciliador garante o crédito INDEPENDENTE do webhook, via
 * GET /pixQrCode/check.
 *
 * Idempotente: markTransactionPaid não re-credita venda já PAID/REFUNDED.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED: sem secret no env = 401.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // allSettled pra nunca 500 o cron por causa de uma falha da adquirente.
  // 1) PENDING→PAID (webhook de pagamento perdido)
  // 2) PAID→REFUNDED/CHARGEBACK (MED PIX / reembolso perdido — desconta o seller)
  //
  // Caju entrou em 01/08/2026: até então ela não tinha endpoint de status
  // funcional, então não dava pra reconciliar. Ver comentário em reconcile.ts.
  //
  // Asaas entrou em 10/08/2026, depois de uma venda real de R$5 ficar presa
  // em PENDING porque o webhook estava cadastrado mas desligado no painel
  // deles. Ver reconcilePendingAsaas em reconcile.ts.
  const [abacate, refunds, shark, sharkRefunds, caju, cajuMed, asaas] =
    await Promise.allSettled([
      reconcilePendingAbacatePay(),
      reconcileRefundedAbacatePay(),
      reconcilePendingSharkBanking(),
      reconcileRefundedSharkBanking(),
      reconcilePendingCaju(),
      reconcileMedCaju(),
      reconcilePendingAsaas(),
    ]);
  return NextResponse.json({
    ok: true,
    abacatepay:
      abacate.status === "fulfilled" ? abacate.value : { error: String(abacate.reason) },
    abacatepayRefunds:
      refunds.status === "fulfilled" ? refunds.value : { error: String(refunds.reason) },
    sharkbanking:
      shark.status === "fulfilled" ? shark.value : { error: String(shark.reason) },
    sharkbankingRefunds:
      sharkRefunds.status === "fulfilled"
        ? sharkRefunds.value
        : { error: String(sharkRefunds.reason) },
    caju: caju.status === "fulfilled" ? caju.value : { error: String(caju.reason) },
    cajuMed:
      cajuMed.status === "fulfilled" ? cajuMed.value : { error: String(cajuMed.reason) },
    asaas: asaas.status === "fulfilled" ? asaas.value : { error: String(asaas.reason) },
  });
}
