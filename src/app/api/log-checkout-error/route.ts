import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024; // 4kB — log de erro nunca precisa de mais

/**
 * Endpoint pra receber erros de render do checkout (chamado pelo error.tsx
 * boundary). Loga no Vercel pra debug.
 *
 * Hardening:
 *  - Rate limit 30/min/IP (sem isso, atacante faz DoS de logs — Vercel cobra
 *    por volume de log + barateia o serviço de logging dos outros sellers).
 *  - Cap de 4kB no body (sem isso, atacante poderia mandar stack de MBs
 *    em loop pra inflar custo).
 *  - Trunca cada campo individual também.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`log-checkout-error:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    // Lê só os primeiros 4kB do body
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const trunc = (v: unknown, n = 500) =>
      typeof v === "string" ? v.slice(0, n) : undefined;
    console.error("[checkout-render-error]", {
      message: trunc(body.message, 500),
      digest: trunc(body.digest, 80),
      url: trunc(body.url, 500),
      userAgent: trunc(body.userAgent, 300),
      stack: trunc(body.stack, 2000),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
