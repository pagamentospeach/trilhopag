/**
 * Extrai host + path da request pra gravar em Transaction.originHost/originPath.
 *
 * 17/07/2026: davi pediu garantia de que TODA criação de PIX captura domínio +
 * slug. Antes, só 2 dos 8 endpoints setavam (checkout/card + api/v1/tx). Este
 * helper unifica a lógica pra evitar drift entre callers.
 *
 * Precedência do HOST:
 *   1. Header `Origin` (mais confiável — vem sempre em POST cross-origin)
 *   2. Header `Referer` (fallback pra POST same-origin)
 *   3. Header `Host` (última tentativa — servidor sabe)
 *
 * Precedência do PATH:
 *   1. Referer.pathname (o path onde o cliente estava quando disparou)
 *   2. Origin não tem path
 *   3. Fallback: label descritivo passado como `fallbackPath`
 *
 * Regras extras:
 *   - Remove `www.`, porta, trailing slash
 *   - Fallback fixo pra cron / dashboard: passa `originOverride`
 *   - Nunca throw
 */
export function extractOrigin(
  request: Request,
  opts: { fallbackHost?: string; fallbackPath?: string } = {},
): { host: string | null; path: string | null } {
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const hostHeader = request.headers.get("host");

  let host: string | null = null;
  let path: string | null = null;

  // HOST
  const originUrl = safeUrl(originHeader);
  const refererUrl = safeUrl(refererHeader);
  if (originUrl) host = originUrl.host;
  else if (refererUrl) host = refererUrl.host;
  else if (hostHeader) host = hostHeader;
  if (!host && opts.fallbackHost) host = opts.fallbackHost;

  // PATH — só o Referer tem (Origin não carrega path)
  if (refererUrl) {
    path = refererUrl.pathname + (refererUrl.search || "");
  }
  if (!path && opts.fallbackPath) path = opts.fallbackPath;

  return {
    host: normalizeHost(host),
    path: normalizePath(path),
  };
}

function safeUrl(s: string | null | undefined): URL | null {
  if (!s) return null;
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function normalizeHost(h: string | null): string | null {
  if (!h) return null;
  return h
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/:\d+$/, "")
    .slice(0, 253); // limite RFC do DNS
}

function normalizePath(p: string | null): string | null {
  if (!p) return null;
  // Remove trailing slash exceto se for "/"
  const cleaned = p.length > 1 ? p.replace(/\/$/, "") : p;
  return cleaned.slice(0, 500); // sanity cap
}
