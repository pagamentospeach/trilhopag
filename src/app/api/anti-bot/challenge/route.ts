import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { generateChallenge } from "@/lib/security/anti-bot";

export const dynamic = "force-dynamic";

/**
 * Gera um desafio anti-bot: uma grade de emojis e o nome do que clicar.
 *
 * Endpoint público, mas rate-limited (30/min/IP) pra evitar abuso de
 * geração de tokens em massa.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  // 120/min/IP: o desafio é só uma conta matemática (GET barato). 30/min
  // estourava em IP compartilhado (CGNAT móvel / Wi-Fi) e travava o 1º passo
  // do cadastro de vários sellers legítimos ao mesmo tempo.
  const rl = rateLimit(`anti-bot-challenge:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const challenge = generateChallenge();
  return NextResponse.json({
    target: challenge.target,
    options: challenge.options,
    nonce: challenge.nonce,
    expiresAt: challenge.expiresAt,
    token: challenge.token,
    issuedAt: Date.now(),
  });
}
