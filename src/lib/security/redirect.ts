/**
 * Open redirect validation.
 *
 * Uso: em qualquer rota que receba `?redirect=…` ou `?next=…`, valida
 * que a URL é segura pra redirecionar.
 *
 * Aceita:
 *  - Paths relativos (`/dashboard`, `/c/abc`)
 *  - URLs absolutas em domínios na ALLOWED_REDIRECT_HOSTS
 *
 * Rejeita:
 *  - URLs externas não-allowlisted
 *  - Schemes não-https/http
 *  - URLs com credenciais (`user:pass@host`)
 *  - Paths que escapam pra cima (`//evil.com`, `/\\evil.com`)
 */

const ALLOWED_REDIRECT_HOSTS = new Set([
  "trilhopag.com",
  "www.trilhopag.com",
  "trilhopag.com",
  "www.trilhopag.com",
  "trilhopag.vercel.app",
  "primebroker.work",
  "www.primebroker.work",
]);

/**
 * Sanitiza uma URL de redirect. Retorna a URL safe ou fallback.
 */
export function safeRedirect(input: string | null | undefined, fallback = "/dashboard"): string {
  if (!input || typeof input !== "string") return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;

  // Reject schemes não-HTTP (javascript:, data:, etc)
  if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      // URL absoluta — só permite HTTPS pra hosts allowlisted
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return fallback;
      }
      if (url.username || url.password) {
        return fallback;
      }
      if (!ALLOWED_REDIRECT_HOSTS.has(url.hostname.toLowerCase())) {
        return fallback;
      }
      return url.toString();
    } catch {
      return fallback;
    }
  }

  // Path relativo — bloqueia escape (// ou /\)
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }
  if (!trimmed.startsWith("/")) {
    return fallback;
  }
  // Bloqueia control characters
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

/**
 * Versão que THROW em vez de fallback — pra casos onde queremos detectar
 * tentativa maliciosa em vez de silently corrigir.
 */
export function assertSafeRedirect(input: string | null | undefined): string {
  const fallback = "__INVALID__";
  const r = safeRedirect(input, fallback);
  if (r === fallback) {
    throw new Error("Open redirect bloqueado");
  }
  return r;
}
