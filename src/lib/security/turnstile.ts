/**
 * Cloudflare Turnstile — anti-bot challenge invisível.
 *
 * Mais leve que reCAPTCHA, gratuito, sem rastreamento. Roda como JS na
 * página e libera um token que o servidor valida via API Cloudflare.
 *
 * USO:
 * 1. Configure env vars:
 *      NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAA...
 *      TURNSTILE_SECRET_KEY=0x4AAA... (server only)
 * 2. No client: importe <TurnstileWidget> de @/components/security/turnstile-widget
 *    e renderize antes do botão submit. Capture o token via onSuccess.
 * 3. No server: chame `verifyTurnstileToken(token, ip)` antes de processar.
 *
 * IMPORTANTE: Turnstile NÃO deve ser usado em /c/* (checkout público) —
 * conversão > segurança. Ver application points abaixo.
 */

import { getClientIp } from "../rate-limit";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true; challenge_ts?: string; hostname?: string }
  | { ok: false; reason: string; codes?: string[] };

/**
 * Valida um token Turnstile com a Cloudflare. Inclui IP do client pra
 * proteção contra reutilização cross-IP.
 *
 * Em dev (sem TURNSTILE_SECRET_KEY), sempre OK — não trava local dev.
 * Em prod sem secret, FALHA fechado (defesa em profundidade).
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  request?: Request,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Dev sem secret: bypassa silenciosamente
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // Em prod sem secret = falha fechado (mas marca como bypass)
      return { ok: false, reason: "turnstile_not_configured" };
    }
    return { ok: true };
  }

  if (!token || typeof token !== "string" || token.length < 10) {
    return { ok: false, reason: "missing_or_invalid_token" };
  }

  const ip = request ? getClientIp(request) : undefined;

  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  let response: Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      // Timeout 10s — não deixa Turnstile bloquear forever
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Fail OPEN em network errors — Cloudflare offline não deve travar app
    return { ok: false, reason: "network_error_cloudflare" };
  }

  if (!response.ok) {
    return { ok: false, reason: `cloudflare_${response.status}` };
  }

  const data = (await response.json()) as {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    "error-codes"?: string[];
    action?: string;
    cdata?: string;
  };

  if (!data.success) {
    return {
      ok: false,
      reason: "turnstile_failed",
      codes: data["error-codes"] ?? [],
    };
  }

  return {
    ok: true,
    challenge_ts: data.challenge_ts,
    hostname: data.hostname,
  };
}

/**
 * Versão throw — pra uso em Server Actions.
 *
 * @throws Error se validação falhou
 */
export async function assertTurnstileToken(
  token: string | null | undefined,
  request?: Request,
): Promise<void> {
  const result = await verifyTurnstileToken(token, request);
  if (!result.ok) {
    throw new Error(`turnstile_check_failed: ${result.reason}`);
  }
}

/** Retorna a sitekey pública (safe para expor no frontend). */
export function getTurnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
}
