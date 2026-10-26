/**
 * Rate limiter em memória (token bucket simples).
 *
 * ⚠️ LIMITACAO CONHECIDA (auditoria jun/2026): por ser in-memory, cada
 * instancia serverless da Vercel tem o PROPRIO contador. Sob carga (varias
 * instancias warm), o limite efetivo vira ~limite × N_instancias. Isso
 * significa que:
 *   - Pra ENDPOINTS DE POLLING/checkout (tx-status, pix, card): OK. Cliente
 *     real raramente passa do limite mesmo multiplicado, e o objetivo eh
 *     so frear script bobo, nao defesa anti-DDoS.
 *   - Pra BRUTE-FORCE de credenciais (login/2fa/admin): NAO eh garantia
 *     forte. Um atacante distribuido contornaria.
 *
 * PARA DEFESA DISTRIBUIDA REAL (quando precisar), trocar este Map por um
 * store compartilhado:
 *   1. Upstash Redis (free tier 10k cmd/dia) — `@upstash/ratelimit`.
 *   2. Vercel KV (Redis gerenciado).
 * A assinatura de `rateLimit()` ja eh sync-friendly; pra async store basta
 * promover pra `Promise<RateLimitResult>` e dar await nos callers.
 *
 * Decisao atual: mantido in-memory porque (a) nao ha Redis/KV provisionado
 * e (b) adicionar round-trip de rede no hot-path de pagamento (pix/card)
 * custaria latencia. Login/2fa ja tem protecoes proprias (Turnstile/captcha
 * + lockout). Revisar se surgir abuso real medido.
 */

type Bucket = {
  count: number;
  resetAt: number; // epoch ms
};

const buckets = new Map<string, Bucket>();

// Limpa buckets expirados periodicamente (best-effort)
let lastCleanup = 0;
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetIn: number; // ms
};

/**
 * Verifica e incrementa o contador.
 *
 * @param key   identificador único (ip+ação ou userId+ação)
 * @param limit máximo de hits dentro da janela
 * @param windowMs duração da janela em ms
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  cleanup();
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetIn: windowMs };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetIn: existing.resetAt - now };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    resetIn: existing.resetAt - now,
  };
}

/**
 * Extrai IP do request — usa headers que o Vercel/proxies setam.
 */
export function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}

// Presets comuns
export const PRESETS = {
  // Login: 5 tentativas a cada 5 min
  login: { limit: 5, windowMs: 5 * 60_000 },
  // Signup: 60 por 15 min por IP. Afrouxado de novo (jun/2026): o público vem
  // de CGNAT de operadora móvel + navegador in-app, onde MUITOS sellers legítimos
  // compartilham o MESMO IP. 10/15min derrubava cadastro em massa no pico. A
  // defesa anti-bot real é o captcha+honeypot+timing do /signup/validate, não o
  // limite-IP. 60/15min dá folga pra IP compartilhado sem abrir abuso (cada
  // tentativa ainda precisa resolver o desafio).
  signup: { limit: 60, windowMs: 15 * 60_000 },
  // API write: 60 req/min por chave
  apiWrite: { limit: 60, windowMs: 60_000 },
  // Webhooks recebidos: 600/min
  webhook: { limit: 600, windowMs: 60_000 },
  // 2FA verify: 5 a cada 5 min
  twofa: { limit: 5, windowMs: 5 * 60_000 },
  // Admin login: 3 por 15 min
  adminLogin: { limit: 3, windowMs: 15 * 60_000 },
} as const;

/**
 * Formata "Aguarde N min" ou "Aguarde N seg" a partir de ms.
 * Usado em mensagens de erro de rate-limit.
 */
export function formatRetryIn(resetInMs: number): string {
  const secs = Math.ceil(resetInMs / 1000);
  if (secs < 60) return `Aguarde ${secs}s.`;
  const mins = Math.ceil(secs / 60);
  return `Aguarde ${mins} min.`;
}
