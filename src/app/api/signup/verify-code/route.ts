import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyEmailCode } from "@/lib/email-verification";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
  code: z.string().min(4).max(10),
});

/**
 * Valida o código de 6 dígitos digitado pelo user. Se OK, marca
 * `user.emailVerified = true` no DB e libera acesso ao dashboard.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  // Rate limit mais apertado pra tentativa (anti bruteforce)
  const rl = rateLimit(`verify-code:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: Math.ceil(rl.resetIn / 1000) },
      { status: 429 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const result = await verifyEmailCode(email, parsed.data.code, "signup");
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: 400 },
    );
  }

  // Marca usuário como verificado (idempotente).
  await prisma.user.update({
    where: { email },
    data: { emailVerified: true },
  }).catch((e) => {
    // User pode não existir se email veio inconsistente — não bloqueia,
    // só loga (o código já foi consumido pra evitar replay).
    console.error("[verify-code] falha ao marcar emailVerified:", e);
  });

  // Limpa cookie tp_verify_skip (banner some no próximo render do dashboard).
  const res = NextResponse.json({ ok: true });
  res.cookies.set("tp_verify_skip", "", { path: "/", maxAge: 0 });
  return res;
}
