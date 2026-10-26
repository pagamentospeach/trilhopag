/**
 * Origin/Referer validation pra Server Actions sensíveis.
 *
 * Next.js já bloqueia CSRF clássico via SameSite=Lax + Origin check no
 * Server Actions. Esta lib adiciona uma segunda barreira pra ações
 * financeiras críticas (saque, mudança de saldo, compra de tema):
 *
 * `assertSafeOrigin()` checa que:
 *   - O header Origin OU Referer veio
 *   - O host é um dos ALLOWED_HOSTS
 *
 * Throws ServerActionForbidden se falhar.
 */

import { headers } from "next/headers";

const ALLOWED_HOSTS = new Set([
  "trilhopag.com",
  "www.trilhopag.com",
  "trilhopag.com",
  "www.trilhopag.com",
  "trilhopag.vercel.app",
  "localhost:3000",
  "localhost:3001",
]);

export class ServerActionForbiddenError extends Error {
  constructor(reason: string) {
    super(`Server Action forbidden: ${reason}`);
    this.name = "ServerActionForbiddenError";
  }
}

/**
 * Valida origem da request. Use em Server Actions sensíveis ANTES de
 * qualquer operação que mute estado financeiro.
 *
 * Em dev (localhost), aceita tudo. Em produção, exige Origin/Referer
 * em ALLOWED_HOSTS.
 */
export async function assertSafeOrigin(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  const h = await headers();
  const origin = h.get("origin");
  const referer = h.get("referer");
  const host = h.get("host");

  // Pelo menos um precisa estar presente
  if (!origin && !referer) {
    throw new ServerActionForbiddenError("Origin/Referer ausentes");
  }

  // Verifica que host bate com Origin/Referer (anti-tampering)
  const candidate = origin ?? referer ?? "";
  let candidateHost = "";
  try {
    candidateHost = new URL(candidate).host.toLowerCase();
  } catch {
    throw new ServerActionForbiddenError("Origin/Referer inválido");
  }

  if (!ALLOWED_HOSTS.has(candidateHost) && !candidateHost.endsWith(".vercel.app")) {
    throw new ServerActionForbiddenError(`Origin não permitido: ${candidateHost}`);
  }

  // Sanity check: Host header também deve estar nos allowed
  if (host && !ALLOWED_HOSTS.has(host.toLowerCase()) && !host.endsWith(".vercel.app")) {
    throw new ServerActionForbiddenError(`Host header não permitido: ${host}`);
  }
}

/** Versão que não throw — retorna boolean. */
export async function isSafeOrigin(): Promise<boolean> {
  try {
    await assertSafeOrigin();
    return true;
  } catch {
    return false;
  }
}
