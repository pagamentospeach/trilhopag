import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  createEmailVerificationCode,
  sendVerificationCodeEmail,
} from "@/lib/email-verification";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/security/escape-html";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(254),
});

/**
 * Envia código de 6 dígitos pro email do user. Roda:
 *  - Automaticamente logo depois do signup (frontend chama)
 *  - Quando user clica "reenviar código" na tela de verificação
 *
 * Rate limit em 3 camadas:
 *   - IP: 5 requests/min (evita bot bruteforce)
 *   - Email: 3 códigos/hora (na lib email-verification)
 *   - Silencioso: sempre retorna 200 se o email não existe (anti-enum)
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`send-code:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: Math.ceil(rl.resetIn / 1000) },
      { status: 429 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, emailVerified: true, blocked: true },
  });

  // 08/08/2026 (davi): "pagina de verificacao de email, mesmo apos verificar ta
  // voltando a aparecer na minha tela".
  //
  // Este `sent: true` mentiroso era metade do problema. Pra quem NÃO é dono do
  // email a mentira é obrigatória (senão a rota vira um oráculo de "esse email
  // tem conta aqui, e já está verificada?"). Mas pra quem está pedindo código
  // do PRÓPRIO email da sessão não há nada a esconder — e esconder deixava a
  // pessoa parada numa tela esperando um email que nunca ia chegar.
  //
  // Então: se o pedido é do dono da sessão, conta a verdade. Pra qualquer
  // outro, a resposta vaga de sempre.
  if (user?.emailVerified) {
    const session = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);
    if (session?.user?.id === user.id) {
      return NextResponse.json({ ok: true, sent: false, alreadyVerified: true });
    }
    return NextResponse.json({ ok: true, sent: true });
  }

  // Anti-enum + segurança: user inexistente ou banido também recebe sucesso
  // vago — nenhuma das duas informações deve vazar.
  if (!user || user.blocked) {
    return NextResponse.json({ ok: true, sent: true });
  }

  const result = await createEmailVerificationCode(email, user.id, "signup");
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Muitos códigos enviados. Espere ${Math.ceil(result.retryInMs / 60_000)} min e tente de novo.`,
        retryAfter: Math.ceil(result.retryInMs / 1000),
      },
      { status: 429 },
    );
  }

  const emailResult = await sendVerificationCodeEmail(
    user.email,
    result.code,
    escapeHtml(user.name), // extra safety: escape name antes de interpolar em HTML
  );
  if (!emailResult.ok) {
    console.error("[send-verification-code] falha no envio:", emailResult.error);
    return NextResponse.json(
      { error: "send_failed", message: "Não foi possível enviar o email agora. Tente de novo em alguns segundos." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sent: true });
}
