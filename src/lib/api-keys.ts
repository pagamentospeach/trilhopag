import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { prisma } from "./prisma";
import { withDbRetry } from "./db-retry";

const KEY_PREFIX = "tp_live_";

/** Comparação constant-time pra evitar timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function generateApiKey() {
  const raw = randomBytes(28).toString("base64url");
  const key = `${KEY_PREFIX}${raw}`;
  const prefix = key.slice(0, 12);
  const keyHash = createHash("sha256").update(key).digest("hex");
  return { key, prefix, keyHash };
}

export function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Verifica a API key vinda do header `Authorization`.
 *
 * ⚠️ HARDENING 08/07/2026 (david: "erro fatal! varios PIX nao gerando").
 * Sellers relatavam 401 "Invalid API key" com chaves VÁLIDAS. 3 correções:
 *
 *  1. Log estruturado do MOTIVO da recusa (missing_bearer / bad_prefix /
 *     not_found / revoked / expired) + prefix truncado da chave. Sem PII.
 *     Assim conseguimos diagnosticar em prod na 1a bateria de logs.
 *
 *  2. `withDbRetry` no findUnique — soluço transiente do Neon (timeout de
 *     rede) NAO pode gerar 401 falso. Retenta 1x com backoff 150ms.
 *
 *  3. Update de `lastUsedAt` movido pra `after()` (fire-and-forget). Antes,
 *     este WRITE bloqueava o hot path e um timeout dele fazia a request
 *     inteira falhar. Agora a resposta sai imediatamente e o WRITE roda
 *     pós-resposta. Erro nele nao afeta o seller.
 *
 *  4. Auth via `Authorization: Bearer` E fallback pra `X-Api-Key` — algumas
 *     libs (PHP curl legado, Postman collections importadas) preferem
 *     X-Api-Key. Mesma chave, comportamento identico.
 *
 *  5. Tolerância a espaços/quotes acidentais no valor do header — algumas
 *     libs escrevem `Authorization: Bearer "tp_live_..."` (com aspas).
 */
export async function verifyApiKey(authHeader: string | null, altKey?: string | null) {
  const rawKey = extractApiKey(authHeader, altKey);
  if (!rawKey) {
    console.warn(`[api-keys] auth fail: missing_bearer (header=${authHeader ? "present" : "null"})`);
    return null;
  }
  if (!rawKey.startsWith(KEY_PREFIX)) {
    console.warn(`[api-keys] auth fail: bad_prefix (got="${rawKey.slice(0, 8)}...")`);
    return null;
  }
  const keyHash = hashKey(rawKey);
  // Retry em soluço transiente do Neon — leitura idempotente.
  const record = await withDbRetry(() =>
    prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    }),
  ).catch((e) => {
    // Erro DETERMINÍSTICO do DB (nao transiente) — loga e trata como null.
    // Melhor NAO retornar 500 se a auth falhar, pra nao vazar interno.
    console.error(`[api-keys] auth fail: db_error (${e instanceof Error ? e.message : String(e)})`);
    return null;
  });

  if (!record) {
    console.warn(`[api-keys] auth fail: not_found (prefix="${rawKey.slice(0, 12)}")`);
    return null;
  }
  if (record.revokedAt) {
    console.warn(`[api-keys] auth fail: revoked (id=${record.id})`);
    return null;
  }
  if (record.expiresAt && record.expiresAt < new Date()) {
    console.warn(`[api-keys] auth fail: expired (id=${record.id})`);
    return null;
  }
  // HARD BLOCK (16/07/2026): dono blocked=true → chave inválida, mesmo sem revokedAt.
  // Cobre o caso de admin ter só marcado blocked sem revogar keys.
  if (record.user?.blocked) {
    console.warn(`[api-keys] auth fail: user_blocked (id=${record.id}, userId=${record.userId})`);
    return null;
  }

  // Update lastUsedAt pós-resposta (nao bloqueia o hot path).
  // Erro aqui nao afeta o seller — auth ja passou.
  // Fallback: se after() nao esta disponivel (chamado fora de route handler),
  // usa Promise.resolve().then() como fire-and-forget puro.
  try {
    after(async () => {
      await prisma.apiKey
        .update({
          where: { id: record.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((e) => {
          console.error(`[api-keys] lastUsedAt update failed for ${record.id}:`, e);
        });
    });
  } catch {
    // after() nao disponivel — dispara fire-and-forget mesmo.
    void prisma.apiKey
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});
  }

  return record;
}

/**
 * Extrai a chave de Authorization: Bearer OU X-Api-Key.
 *
 * Tolerância:
 *  - `Bearer   tp_live_...` (multiplos espaços)
 *  - `Bearer tp_live_...`
 *  - `Bearer "tp_live_..."` (com aspas)
 *  - `tp_live_...` direto (alguns clientes enviam sem "Bearer")
 *  - X-Api-Key: tp_live_... (fallback)
 */
function extractApiKey(authHeader: string | null, altKey?: string | null): string | null {
  const tryClean = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    let s = raw.trim();
    // Remove prefix "Bearer" opcional (case-insensitive)
    const m = s.match(/^Bearer\s+(.+)$/i);
    if (m) s = m[1].trim();
    // Remove aspas envolventes acidentais
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
    return s || null;
  };
  return tryClean(authHeader) ?? tryClean(altKey);
}
