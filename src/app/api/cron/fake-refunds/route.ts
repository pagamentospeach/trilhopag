import { NextResponse } from "next/server";
import { applyDueFakeRefunds } from "@/lib/transactions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron de REEMBOLSO FAKE (admin-only).
 *
 * Aplica os reembolsos fake VENCIDOS: tx PAID com fakeRefundScheduledAt <= now
 * e fakeRefundApplied=false. Cada uma vira REFUNDED (reverte saldo + taxa,
 * dispara webhook transaction.refunded) com providerPayload.fake_refund=true.
 * NAO chama o PSP.
 *
 * Agendamento das tx acontece:
 *   - automatico: markTransactionPaid sorteia User.fakeRefundPercent e agenda
 *     paidAt + User.fakeRefundDelayDays;
 *   - manual: botao "reembolso fake" por transacao no /admin01.
 *
 * Protegido por CRON_SECRET. Configurado no vercel.json.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const r = await applyDueFakeRefunds(200);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron/fake-refunds] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
