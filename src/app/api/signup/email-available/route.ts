import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp, formatRetryIn } from "@/lib/rate-limit";
import { isDisposableEmail } from "@/lib/security/disposable-emails";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email().max(254) });

/**
 * Checagem leve do email, chamada enquanto a pessoa ainda está no primeiro
 * passo do cadastro.
 *
 * 08/08/2026 (davi): "divida ela em passo a passo… Enriqueça de detalhes".
 * Descobrir que o email já tem conta DEPOIS de digitar endereço e subir três
 * fotos é o pior momento possível. Aqui o aviso aparece na hora.
 *
 * `resume: true` = o email é o da sessão aberta neste navegador. Não é
 * conflito: é a própria pessoa voltando pra terminar um cadastro que parou no
 * meio (a conta nasce antes dos documentos, porque o upload exige sessão).
 *
 * Isto NÃO substitui o /api/signup/validate: aquele continua sendo a barreira
 * de verdade (anti-bot, blocklist, domínio próprio) e roda no envio final.
 * Este é só o aviso adiantado — por isso o rate limit é bem mais apertado,
 * pra não virar um oráculo de "esse email tem conta aqui?".
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`signup-email-check:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: `Muitas checagens. ${formatRetryIn(rl.resetIn)}` },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetIn / 1000).toString() } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ status: "invalid" });
  }

  const email = parsed.data.email.toLowerCase().trim();

  if (isDisposableEmail(email)) {
    return NextResponse.json({
      status: "blocked",
      message: "Email temporário não é aceito. Use um email pessoal permanente.",
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ status: "free" });

  const session = await auth.api
    .getSession({ headers: request.headers })
    .catch(() => null);
  if (session?.user?.id === existing.id) {
    return NextResponse.json({ status: "resume" });
  }

  return NextResponse.json({
    status: "taken",
    message: "Este email já tem uma conta. Entre com ele, ou use outro pra abrir uma conta nova.",
  });
}
