import { NextResponse } from "next/server";
import { releaseRetentionToBalance } from "@/lib/holding-release";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cron a cada HORA:
 *
 * Libera os 10% retidos em vendas de CARTÃO 90 dias após paidAt.
 * Quando retentionUntil <= now AND retentionReleased=false, soma o
 * retentionAmount no balanceCents do seller.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED — vide release-pending.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await releaseRetentionToBalance();
  return NextResponse.json({
    ok: true,
    ...result,
  });
}
