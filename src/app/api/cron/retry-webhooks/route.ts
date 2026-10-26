import { NextResponse } from "next/server";
import { processPendingRetries } from "@/lib/webhooks";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED — sem secret = 401. Antes podiam triggar processPendingRetries
  // pra DoS no PSP via re-tentativas em massa.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const count = await processPendingRetries(100);
  return NextResponse.json({ processed: count });
}
