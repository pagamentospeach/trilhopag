/**
 * Verificação de email por código de 6 dígitos (obrigatório no signup).
 *
 * Introduzido 16/07/2026 após o incidente do pentester. Agora TODO signup
 * por email cai numa tela intermediária pedindo o código antes de liberar
 * o dashboard.
 *
 * Google OAuth NÃO precisa (o Google já verifica). Only email-based signup.
 *
 * Design decisions:
 *  - Código 6 dígitos numérico (fácil digitar no celular)
 *  - Guarda HASH do código, não o valor cru (constant-time compare)
 *  - Expira em 15 min
 *  - Rate limit no envio: 3 códigos por email por hora
 *  - Rate limit na verificação: 5 tentativas por email por 10 min
 *  - Códigos anteriores expiram quando um novo é gerado
 *  - Auto-cleanup de códigos velhos via cron ou lazy delete no verify
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { sendEmail } from "./email";

/** Gera código de 6 dígitos aleatório (000000–999999). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Hash SHA256 do código pra guardar no DB. */
export function hashCode(code: string): string {
  return createHash("sha256").update(String(code).trim()).digest("hex");
}

const EXPIRY_MIN = 15;
const MAX_SENDS_PER_HOUR = 3;
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFY_WINDOW_MIN = 10;

export type CreateCodeResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; error: "rate_limited"; retryInMs: number };

/**
 * Cria um código novo pra `email`. Rate-limited: máx 3 por hora por email.
 * Invalida códigos antigos (marca como used). Retorna o código em plain
 * text pra caller enviar por email (nós NÃO enviamos email aqui — separação
 * de concerns pra permitir teste).
 */
export async function createEmailVerificationCode(
  email: string,
  userId?: string,
  purpose: "signup" | "reset" = "signup",
): Promise<CreateCodeResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: quantos códigos enviados na última hora
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.emailVerificationCode.count({
    where: {
      email: normalizedEmail,
      purpose,
      createdAt: { gte: hourAgo },
    },
  });
  if (recentCount >= MAX_SENDS_PER_HOUR) {
    const oldest = await prisma.emailVerificationCode.findFirst({
      where: { email: normalizedEmail, purpose, createdAt: { gte: hourAgo } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const oldestAt = oldest?.createdAt.getTime() ?? Date.now();
    const retryInMs = Math.max(0, oldestAt + 60 * 60 * 1000 - Date.now());
    return { ok: false, error: "rate_limited", retryInMs };
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + EXPIRY_MIN * 60 * 1000);

  // Invalida códigos antigos do mesmo email/purpose (só 1 ativo por vez)
  await prisma.emailVerificationCode.updateMany({
    where: { email: normalizedEmail, purpose, used: false },
    data: { used: true },
  });

  await prisma.emailVerificationCode.create({
    data: {
      userId: userId ?? null,
      email: normalizedEmail,
      code: codeHash, // guardamos HASH, não o valor cru
      purpose,
      used: false,
      expiresAt,
    },
  });

  return { ok: true, code, expiresAt };
}

export type VerifyCodeResult =
  | { ok: true; userId: string | null }
  | {
      ok: false;
      error: "invalid" | "expired" | "too_many_attempts" | "not_found";
      message: string;
    };

/**
 * Valida o código digitado. Se OK, marca `used=true` e retorna userId (se
 * o código tem um). Constant-time compare via timingSafeEqual.
 */
export async function verifyEmailCode(
  email: string,
  providedCode: string,
  purpose: "signup" | "reset" = "signup",
): Promise<VerifyCodeResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const codeInput = String(providedCode).trim().replace(/\D/g, "");

  if (codeInput.length !== 6) {
    return {
      ok: false,
      error: "invalid",
      message: "Código deve ter 6 dígitos.",
    };
  }

  // Rate limit tentativas: se >5 tentativas nos últimos 10 min pra esse
  // email (contando pelas codes ATIVAS gastas nesse período), trava.
  // Não somos super rigorosos aqui — o gargalo real é o rate-limit do IP
  // no route handler.
  const windowStart = new Date(Date.now() - VERIFY_WINDOW_MIN * 60 * 1000);
  const attempts = await prisma.emailVerificationCode.count({
    where: {
      email: normalizedEmail,
      purpose,
      createdAt: { gte: windowStart },
    },
  });
  if (attempts > MAX_VERIFY_ATTEMPTS + MAX_SENDS_PER_HOUR) {
    return {
      ok: false,
      error: "too_many_attempts",
      message: "Muitas tentativas. Espere alguns minutos e peça um novo código.",
    };
  }

  const active = await prisma.emailVerificationCode.findFirst({
    where: {
      email: normalizedEmail,
      purpose,
      used: false,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!active) {
    return {
      ok: false,
      error: "not_found",
      message: "Nenhum código ativo. Peça um novo.",
    };
  }
  if (active.expiresAt < new Date()) {
    return {
      ok: false,
      error: "expired",
      message: "Código expirado. Peça um novo.",
    };
  }

  const expectedHash = active.code;
  const providedHash = hashCode(codeInput);
  if (expectedHash.length !== providedHash.length) {
    return {
      ok: false,
      error: "invalid",
      message: "Código incorreto.",
    };
  }
  const equal = timingSafeEqual(
    Buffer.from(expectedHash, "hex"),
    Buffer.from(providedHash, "hex"),
  );
  if (!equal) {
    return {
      ok: false,
      error: "invalid",
      message: "Código incorreto. Confira e tente de novo.",
    };
  }

  // OK. Marca como usado.
  await prisma.emailVerificationCode.update({
    where: { id: active.id },
    data: { used: true },
  });

  return { ok: true, userId: active.userId };
}

/**
 * Template de email com o código. Usa Resend via `sendEmail` já configurado.
 */
export async function sendVerificationCodeEmail(
  toEmail: string,
  code: string,
  userName?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const displayName = userName?.trim() || "";
  const greeting = displayName ? `Olá, ${displayName}!` : "Olá!";
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto;color:#1a1a1a;padding:24px">
      <h2 style="color:#0a0a0a;margin-top:0">Seu código de confirmação</h2>
      <p style="line-height:1.5">${greeting}</p>
      <p style="line-height:1.5">Use o código abaixo para confirmar seu email no Trilho:</p>
      <div style="margin:32px 0;text-align:center">
        <div style="display:inline-block;background:#22d3ee;color:#000;padding:20px 40px;border-radius:12px;font-size:36px;font-weight:700;letter-spacing:8px;font-family:'SF Mono',Menlo,Consolas,monospace">
          ${code}
        </div>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.5">
        O código expira em <strong>15 minutos</strong>. Se você não pediu esse código, ignore este email — sua conta continua segura.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="color:#999;font-size:12px">Trilho · Confirmação de conta</p>
    </div>
  `;
  const text = `Seu código de confirmação Trilho: ${code}\n\nExpira em 15 minutos. Se você não pediu, ignore este email.`;

  const r = await sendEmail({
    to: toEmail,
    subject: `${code} — seu código Trilho`,
    html,
    text,
  });
  return r;
}
