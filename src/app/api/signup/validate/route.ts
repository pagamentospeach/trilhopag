import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, PRESETS, formatRetryIn } from "@/lib/rate-limit";
import { verifyChallenge } from "@/lib/security/anti-bot";

export const dynamic = "force-dynamic";

/**
 * Valida o passo de credenciais do cadastro SEM enviar código de email.
 *
 * O fluxo de confirmação por código foi removido (atrito desnecessário —
 * a conta já é criada com autoSignIn e requireEmailVerification=false). Mas
 * mantemos aqui as duas barreiras importantes que viviam no antigo
 * /send-code:
 *   1. Anti-bot (math captcha + honeypot + timing) — server-side, não
 *      bypassável só no client.
 *   2. Email já em uso — pega cedo, antes do user preencher CPF/telefone.
 */
const BotChallengeSchema = z.object({
  token: z.string().max(200),
  nonce: z.string().max(64),
  answer: z.union([z.string(), z.number()]),
  expiresAt: z.number().int(),
  issuedAt: z.number().int().optional(),
  honeypot: z.string().max(200).optional(),
});

const Body = z.object({
  email: z.string().email().max(254),
  botChallenge: BotChallengeSchema,
});

export async function POST(request: Request) {
  // Rate limit por IP (anti-spam de cadastro)
  const ip = getClientIp(request);
  const rl = rateLimit(
    `signup-validate:${ip}`,
    PRESETS.signup.limit,
    PRESETS.signup.windowMs,
  );
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Muitas tentativas desse IP. ${formatRetryIn(rl.resetIn)}`,
      },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetIn / 1000).toString() },
      },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "Dados inválidos. Recarregue a página." },
      { status: 422 },
    );
  }

  // Anti-bot MANUAL (math captcha + honeypot + timing)
  const botCheck = verifyChallenge({
    answer: parsed.data.botChallenge.answer,
    nonce: parsed.data.botChallenge.nonce,
    token: parsed.data.botChallenge.token,
    expiresAt: parsed.data.botChallenge.expiresAt,
    challengeIssuedAt: parsed.data.botChallenge.issuedAt,
    honeypot: parsed.data.botChallenge.honeypot,
  });
  if (!botCheck.ok) {
    return NextResponse.json(
      {
        error: "challenge_failed",
        reason: botCheck.reason,
        message: botCheck.userMessage,
      },
      { status: 403 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();

  // OWNED-DOMAIN GUARD (16/07/2026): pentester criou `admin@trilhopag.com`,
  // `ceo@trilhopag.com`, `master@trilhopag.com` etc — 14 contas se passando
  // por admin nosso. Nosso domínio é impersonation-only, ninguém legítimo
  // cadastra com email @trilhopag.com ou @trilhopag.com (esses são pra
  // suporte/admin interno via email server, não signup público).
  const emailDomain = email.split("@")[1] ?? "";
  const OWNED_DOMAINS = [
    "trilhopag.com",
    "trilhopag.com",
    "trilhopag.com",
    "trilhopag.com",
    "trilhopag.local",
  ];
  if (OWNED_DOMAINS.includes(emailDomain)) {
    console.warn("[signup validate] tentativa de impersonation", { email });
    return NextResponse.json(
      { error: "email_domain_not_allowed", message: "Cadastro não permitido com esse email." },
      { status: 403 },
    );
  }

  // DISPOSABLE EMAIL GUARD (16/07/2026): pentester usou tuamaeaquelaursa.com,
  // tutamail.com, fake.com pra criar contas. Lista curada em
  // src/lib/security/disposable-emails.ts. Bloqueia mailinator, yopmail,
  // 10minutemail, temp-mail, guerrillamail, throwaway, e ~150 outros.
  // Proton/Tutanota NÃO estão na lista (privacidade real).
  const { isDisposableEmail } = await import("@/lib/security/disposable-emails");
  if (isDisposableEmail(email)) {
    console.warn("[signup validate] disposable email blocked", { email });
    return NextResponse.json(
      {
        error: "disposable_email_not_allowed",
        message: "Cadastro não permitido com email temporário. Use um email pessoal permanente (Gmail, Outlook, Proton, etc).",
      },
      { status: 403 },
    );
  }

  // Email já tem conta?
  //
  // 08/08/2026 (davi): "Ta dando esse erro quando eu tento criar a conta
  // aparece que eu ja tenho login … E o user pode querer criar outra conta!"
  //
  // O 409 seco criava um beco sem saída: o cadastro cria a conta no MEIO do
  // fluxo (antes dos documentos, porque o upload exige sessão). Se qualquer
  // coisa falhava depois disso — deploy no meio, upload grande, aba fechada —
  // a pessoa voltava, tentava de novo e batia aqui: a conta dela mesma já
  // existia, e o painel mandava "faça login" pra uma conta sem documento
  // nenhum. Ficava presa.
  //
  // Agora, se o email que ela digitou é o da sessão ATUAL, isto não é
  // conflito: é retomada. Devolve `resume` e o /signup pula a criação e vai
  // direto pros documentos. Só é conflito de verdade quando o email é de
  // OUTRA pessoa — aí sim manda pro login.
  //
  // Nada além do email bloqueia: CPF/CNPJ e telefone podem repetir de
  // propósito (mesma pessoa pode ter mais de uma conta).
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    const { auth } = await import("@/lib/auth");
    const session = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);

    if (session?.user?.id === existing.id) {
      return NextResponse.json({ ok: true, resume: true });
    }

    return NextResponse.json(
      {
        error: "email_in_use",
        message:
          "Este email já tem uma conta. Entre com ele, ou use outro email pra abrir uma conta nova.",
      },
      { status: 409 },
    );
  }

  // BLOCKLIST (16/07/2026): emails/IPs banidos por fraude anterior. Lê da
  // última AdminNotification type=banned_identifiers. Mensagem deliberada-
  // mente vaga (finge que já existe) pra não confirmar ao atacante que
  // foi detectado.
  try {
    const blockNote = await prisma.adminNotification.findFirst({
      where: { type: "banned_identifiers" },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    const payload =
      (blockNote?.payload as {
        emails?: string[];
        emailDomains?: string[];
        ips?: string[];
      } | null) ?? null;
    if (payload) {
      const bannedEmails = new Set((payload.emails ?? []).map((e) => e.toLowerCase()));
      const bannedDomains = new Set((payload.emailDomains ?? []).map((d) => d.toLowerCase()));
      const bannedIps = new Set(payload.ips ?? []);
      const domain = email.split("@")[1]?.toLowerCase() ?? "";
      // Normaliza email tirando alias `+X`
      const normalizedLocal =
        email.split("@")[0]?.split("+")[0]?.toLowerCase() ?? "";
      const normalizedEmail = `${normalizedLocal}@${domain}`;
      const isEmailBanned =
        bannedEmails.has(email) ||
        bannedEmails.has(normalizedEmail) ||
        (domain && bannedDomains.has(domain));
      const isIpBanned = bannedIps.has(ip);
      if (isEmailBanned || isIpBanned) {
        console.warn("[signup validate] blocklist hit", {
          email,
          ip,
          isEmailBanned,
          isIpBanned,
        });
        // Mensagem IDÊNTICA à do email já cadastrado — se fosse diferente,
        // bastava comparar as duas respostas pra descobrir que o banimento
        // existe.
        return NextResponse.json(
          {
            error: "email_in_use",
            message:
              "Este email já tem uma conta. Entre com ele, ou use outro email pra abrir uma conta nova.",
          },
          { status: 409 },
        );
      }
    }
  } catch (e) {
    console.error("[signup validate] blocklist check failed:", e);
  }

  return NextResponse.json({ ok: true });
}
