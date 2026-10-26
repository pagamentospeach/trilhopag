import { NextResponse } from "next/server";
import { resumeScheduledConversations } from "@/lib/bot-funnel-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 22/07/2026 (davi fase 2): acorda conversas do funil de bot que estão em
 * status "sleeping" com scheduledResumeAt vencido (bloco `wait`).
 * Roda a cada 1 min. Processa lote de 100 por execução.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await resumeScheduledConversations();
  return NextResponse.json({ ok: true, ...r });
}
