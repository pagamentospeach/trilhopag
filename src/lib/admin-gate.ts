/**
 * Token da "porta" do /admin01 (as 3 batidas no X da tela de erro falsa).
 *
 * Formato: `<expiraEmMs>.<hmacSha256Base64Url>`.
 *
 * Usa Web Crypto (não `node:crypto`) porque o `proxy.ts` roda no runtime
 * Edge, onde os módulos do Node não existem. O mesmo módulo é importado dos
 * dois lados pra assinatura e verificação nunca saírem de sincronia.
 *
 * De novo: isto é camuflagem contra scanner automático, não autenticação —
 * passar da porta só te leva pra tela de login normal.
 */

const TTL_MS = 6 * 60 * 60 * 1000; // 6h
export const GATE_COOKIE = "tp_gk";

function secret(): string {
  // Reaproveita um segredo que já existe em produção. O fallback só roda em
  // dev — em prod qualquer uma dessas está setada.
  return (
    process.env.APP_ENCRYPTION_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "trilho-dev-gate"
  );
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return b64url(sig);
}

export async function issueGateToken(): Promise<string> {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${await sign(exp)}`;
}

export async function isGateTokenValid(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = await sign(exp);
  // Comparação de tempo constante — o payload é público, mas custa nada.
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export const GATE_TTL_SECONDS = TTL_MS / 1000;
