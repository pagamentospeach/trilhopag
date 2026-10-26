import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, PRESETS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  memberAreaId: z.string().max(64),
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(
    `member-login:${ip}`,
    PRESETS.login.limit,
    PRESETS.login.windowMs,
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Muitas tentativas." },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetIn / 1000).toString() } },
    );
  }
  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 422 });
  }
  const email = parsed.data.email.toLowerCase().trim();
  const member = await prisma.member.findFirst({
    where: { memberAreaId: parsed.data.memberAreaId, email, blocked: false },
  });
  if (!member || !member.passwordHash) {
    return NextResponse.json(
      { error: "invalid_credentials", message: "Email ou senha incorretos." },
      { status: 401 },
    );
  }
  const ok = await bcrypt.compare(parsed.data.password, member.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "invalid_credentials", message: "Email ou senha incorretos." },
      { status: 401 },
    );
  }

  // Gera novo token de sessão
  const token = randomBytes(24).toString("hex");
  await prisma.member.update({
    where: { id: member.id },
    data: { loginToken: token, lastLoginAt: new Date() },
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(`tp_m_${parsed.data.memberAreaId}`, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
