/**
 * DB-based rate limiting — persiste entre cold starts (serverless).
 *
 * Pra endpoints críticos onde o rate limit in-memory (`src/lib/rate-limit.ts`)
 * é ineficaz por causa de cold starts no Vercel.
 *
 * Algoritmo: sliding-window fixo. Cada `windowMs` recomeça do zero. Não é
 * perfeito (atacante pode burst no boundary do window), mas é suficiente
 * pra defender login, signup, password reset, PIX create.
 *
 * Custos: ~2 queries por hit (1 upsert + 1 read). Aceitável pra endpoints
 * de mutação. NÃO use em endpoints de polling de alta freq.
 *
 * Limpeza: cron `cleanupRateLimitBuckets()` apaga buckets expirados.
 */

import { prisma } from "../prisma";

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetIn: number; // ms
};

/**
 * Verifica e incrementa o counter atomicamente.
 *
 * @param key — identificador único do bucket (ex: "login:ip:1.2.3.4")
 * @param limit — máximo de hits permitidos na janela
 * @param windowMs — duração da janela em ms
 */
export async function rateLimitDb(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // Reseta o bucket se a janela expirou. Garantia atômica via upsert + check.
  // Estratégia:
  //   1. Se não existe ou windowStart < cutoff: cria/reseta com count=1
  //   2. Caso contrário: incrementa count
  // Usa transação pra evitar race condition entre check + update.
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!existing || existing.windowStart < windowStart) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      return { count: 1, windowStart: now };
    } else {
      const updated = await tx.rateLimitBucket.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
      return { count: updated.count, windowStart: existing.windowStart };
    }
  });

  const resetIn = Math.max(
    0,
    result.windowStart.getTime() + windowMs - now.getTime(),
  );

  if (result.count > limit) {
    return { ok: false, remaining: 0, resetIn };
  }

  return { ok: true, remaining: limit - result.count, resetIn };
}

/**
 * Apaga buckets expirados (mais antigos que 1h). Roda via cron.
 */
export async function cleanupRateLimitBuckets(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const r = await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return r.count;
}

/** Presets pra endpoints comuns. */
export const RL_PRESETS_DB = {
  /** Login: 5 tentativas / 5 min */
  login: { limit: 5, windowMs: 5 * 60_000 },
  /** Admin login: 3 tentativas / 15 min */
  adminLogin: { limit: 3, windowMs: 15 * 60_000 },
  /** Signup: 3 / hora — anti-abuso */
  signup: { limit: 3, windowMs: 60 * 60_000 },
  /** Password reset: 3 / hora */
  passwordReset: { limit: 3, windowMs: 60 * 60_000 },
  /** PIX create por user: 20 / min */
  pixCreate: { limit: 20, windowMs: 60_000 },
  /** Withdraw: 5 / hora — proteção contra abuse */
  withdraw: { limit: 5, windowMs: 60 * 60_000 },
  /** Theme purchase: 10 / hora */
  themePurchase: { limit: 10, windowMs: 60 * 60_000 },
} as const;
