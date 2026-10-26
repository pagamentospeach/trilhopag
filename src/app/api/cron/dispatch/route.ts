import { NextResponse } from "next/server";
import { processDispatch } from "@/lib/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron do Disparo (SMS/Email) — recuperação de PIX pendente usando os
 * provedores PRÓPRIOS do seller. Roda a cada 2 min.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await processDispatch();
  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({
    attempted: results.length,
    sent,
    results: results.slice(0, 50),
  });
}
