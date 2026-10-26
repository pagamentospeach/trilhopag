import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 22/07/2026 (davi fase 3): apaga BotAnalyticsEvent com mais de 30 dias.
 * Roda 1×/dia. O dashboard só olha janela de 7-30 dias, então histórico
 * mais velho é ruído + custo de storage.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const r = await prisma.botAnalyticsEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return NextResponse.json({ ok: true, deleted: r.count });
}
