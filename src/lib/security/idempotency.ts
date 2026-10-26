/**
 * Idempotency keys — protege endpoints de mutação financeira contra
 * duplicação por retry (network glitch, double-click, etc).
 *
 * Cliente envia header `Idempotency-Key: <uuid>`. Server:
 *  1. Calcula bodyHash do request
 *  2. Procura IdempotencyKey com a key
 *  3. Se existir + bodyHash bate → devolve a resposta original (200)
 *  4. Se existir + bodyHash NÃO bate → 422 "Idempotency key reuse with different body"
 *  5. Se não existir → executa, grava IdempotencyKey, devolve resposta
 *
 * Lifecycle: keys expiram em 24h (limpas por cron — ver `cleanupExpired`).
 */

import { createHash } from "crypto";
import { prisma } from "../prisma";

const TTL_HOURS = 24;

export type IdempotencyContext = {
  key: string | null;
  bodyHash: string;
};

/** Lê o header Idempotency-Key e calcula hash do body. */
export async function getIdempotencyContext(
  req: Request,
  body: string,
): Promise<IdempotencyContext> {
  const key = req.headers.get("idempotency-key");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return { key: key?.trim() || null, bodyHash };
}

/**
 * Procura uma resposta cached pra essa key.
 * Retorna `null` se não existe ou se o body mudou (treat as new request).
 *
 * Se body mudou: throws com mensagem clara.
 */
export async function checkIdempotency(
  ctx: IdempotencyContext,
): Promise<{ status: number; body: unknown } | null> {
  if (!ctx.key) return null;
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key: ctx.key },
  });
  if (!existing) return null;
  // Expirado — pode reusar
  if (existing.expiresAt < new Date()) {
    await prisma.idempotencyKey.delete({ where: { key: ctx.key } });
    return null;
  }
  if (existing.bodyHash !== ctx.bodyHash) {
    throw new IdempotencyKeyReuseError();
  }
  return {
    status: existing.status,
    body: existing.response,
  };
}

/** Grava a resposta pra próximas tentativas com a mesma key. */
export async function saveIdempotency(
  ctx: IdempotencyContext,
  result: { status: number; body: unknown },
  endpoint: string,
  userId: string | null = null,
): Promise<void> {
  if (!ctx.key) return;
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  try {
    await prisma.idempotencyKey.create({
      data: {
        key: ctx.key,
        bodyHash: ctx.bodyHash,
        response: result.body as object,
        status: result.status,
        endpoint,
        userId,
        expiresAt,
      },
    });
  } catch (err) {
    // P2002 = race condition (alguma outra request acabou de criar)
    // Não é fatal — silenciosamente ignore
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("P2002") && !msg.includes("Unique constraint")) {
      throw err;
    }
  }
}

export class IdempotencyKeyReuseError extends Error {
  constructor() {
    super("Idempotency-Key reuse with different body");
    this.name = "IdempotencyKeyReuseError";
  }
}

/**
 * Limpa keys expiradas (rodar via cron ou edge function 1x/dia).
 */
export async function cleanupExpired(): Promise<number> {
  const r = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return r.count;
}

/**
 * Higher-order helper pra envolver um handler com idempotency check.
 *
 * Uso:
 * ```ts
 * export async function POST(req: NextRequest) {
 *   return withIdempotency(req, "checkout.pix.create", null, async () => {
 *     // ... lógica normal
 *     return NextResponse.json(result);
 *   });
 * }
 * ```
 */
export async function withIdempotency<T extends Response>(
  req: Request,
  endpoint: string,
  userId: string | null,
  handler: () => Promise<T>,
): Promise<Response> {
  const body = await req.clone().text();
  const ctx = await getIdempotencyContext(req, body);

  try {
    const cached = await checkIdempotency(ctx);
    if (cached) {
      return new Response(JSON.stringify(cached.body), {
        status: cached.status,
        headers: {
          "Content-Type": "application/json",
          "X-Idempotent-Replay": "true",
        },
      });
    }
  } catch (err) {
    if (err instanceof IdempotencyKeyReuseError) {
      return new Response(
        JSON.stringify({
          error: "idempotency_key_reuse",
          message: err.message,
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }
    throw err;
  }

  const res = await handler();
  // Clone pra ler o body sem consumir o response original
  const clone = res.clone();
  const text = await clone.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // resposta não-JSON; mantém string
  }
  await saveIdempotency(
    ctx,
    { status: res.status, body: parsed },
    endpoint,
    userId,
  );
  return res;
}
