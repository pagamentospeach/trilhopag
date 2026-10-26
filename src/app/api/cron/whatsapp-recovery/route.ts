import { NextResponse } from "next/server";
import { processCartRecovery } from "@/lib/whatsapp";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // FAIL CLOSED — sem secret = 401.
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await processCartRecovery();
  return NextResponse.json({ processed: results.length, results });
}
