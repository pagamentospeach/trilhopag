import { NextResponse } from "next/server";
import { processScheduledWithdrawals } from "@/lib/scheduled-withdraw";

export const dynamic = "force-dynamic";
// O caminho do saque automático pode ler saldo das contas SafePix + chamar a
// API de transferência (via requestWithdrawal → tryAutoWithdraw). 60s de folga.
export const maxDuration = 60;

/**
 * Cron de SAQUE AUTOMÁTICO PROGRAMADO (seller-side). Roda a cada 2 min: pra cada
 * seller com o gatilho ligado e saldo >= threshold, cria um saque PIX automático
 * (via requestWithdrawal — com todas as proteções). Auth via CRON_SECRET.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await processScheduledWithdrawals();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron/scheduled-withdraw] erro:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
