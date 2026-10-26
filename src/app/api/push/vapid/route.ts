import { NextResponse } from "next/server";
import { getPushPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Endpoint publico que devolve a VAPID public key.
 * Necessario pro client subscribe — passa o key no PushManager.subscribe().
 *
 * NAO ha risco em expor a public key (ela serve so pra cifrar o
 * applicationServerKey). A private key fica no server.
 */
export async function GET() {
  const publicKey = getPushPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { ok: false, error: "push_not_configured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, publicKey });
}
