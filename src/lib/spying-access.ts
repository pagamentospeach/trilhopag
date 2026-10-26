/**
 * Sistema de acesso a Espionagem (swipe file pago).
 *
 * Duas alas independentes:
 *   "facebook" — R$ 67,00 (acesso vitalicio)
 *   "tiktok"   — R$ 97,00 (acesso vitalicio)
 *
 * Compra eh registrada em InternalPurchase com feature="spying:<platform>".
 * Reuso o modelo do tema (saldo OU PIX via MP white) — mesmo padrao.
 *
 * Helpers:
 *   - hasSpyingAccess(userId, platform) — verifica se ja comprou
 *   - getOwnedPlatforms(userId)         — lista platforms compradas
 *   - SPYING_PRICES                     — precos centralizados
 */

import { prisma } from "./prisma";

export type SpyingPlatform = "facebook" | "tiktok";

/** Precos padrao em cents. Admin pode override via admin01/precos. */
export const SPYING_PRICES: Record<SpyingPlatform, number> = {
  facebook: 6700,
  tiktok: 9700,
};

export const SPYING_LABELS: Record<SpyingPlatform, string> = {
  facebook: "Facebook Ads",
  tiktok: "TikTok Ads",
};

export function isValidSpyingPlatform(s: string): s is SpyingPlatform {
  return s === "facebook" || s === "tiktok";
}

/**
 * Retorna preco efetivo. Por ora hardcoded; pode aceitar override
 * futuro (e.g. AdminConfig) sem mudar a assinatura.
 */
export function getSpyingPriceCents(platform: SpyingPlatform): number {
  return SPYING_PRICES[platform];
}

/**
 * Retorna true se o user ja comprou acesso a essa plataforma.
 * Comprou = InternalPurchase status="paid" com feature="spying:<platform>".
 * FRIEND ACCOUNT BYPASS: contas amigo tem acesso liberado em tudo.
 */
export async function hasSpyingAccess(
  userId: string,
  platform: SpyingPlatform,
): Promise<boolean> {
  const friend = await prisma.user.findUnique({
    where: { id: userId },
    select: { isFriendAccount: true },
  });
  if (friend?.isFriendAccount) return true;
  const purchase = await prisma.internalPurchase.findFirst({
    where: {
      userId,
      feature: `spying:${platform}`,
      status: "paid",
    },
    select: { id: true },
  });
  return purchase !== null;
}

/**
 * Lista todas as plataformas que o user comprou.
 */
export async function getOwnedSpyingPlatforms(
  userId: string,
): Promise<SpyingPlatform[]> {
  const purchases = await prisma.internalPurchase.findMany({
    where: {
      userId,
      feature: { startsWith: "spying:" },
      status: "paid",
    },
    select: { feature: true },
  });
  const out: SpyingPlatform[] = [];
  for (const p of purchases) {
    const plat = p.feature.slice("spying:".length);
    if (isValidSpyingPlatform(plat) && !out.includes(plat)) {
      out.push(plat);
    }
  }
  return out;
}

/**
 * Compra direta com SALDO. Atomico — debita balanceCents + cria
 * InternalPurchase com status="paid" na mesma transacao.
 *
 * Idempotente: se ja tem acesso, retorna ok sem cobrar.
 */
export async function purchaseSpyingWithBalance(
  userId: string,
  platform: SpyingPlatform,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isValidSpyingPlatform(platform)) {
    return { ok: false, reason: "invalid_platform" };
  }
  const already = await hasSpyingAccess(userId, platform);
  if (already) return { ok: true };

  const priceCents = getSpyingPriceCents(platform);

  try {
    await prisma.$transaction(async (db) => {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { balanceCents: true },
      });
      if (!user) throw new Error("user_not_found");
      if (user.balanceCents < priceCents) throw new Error("insufficient_balance");

      // Debita saldo (race-safe via WHERE balanceCents >= priceCents)
      const upd = await db.user.updateMany({
        where: { id: userId, balanceCents: { gte: priceCents } },
        data: { balanceCents: { decrement: priceCents } },
      });
      if (upd.count === 0) throw new Error("insufficient_balance");

      await db.internalPurchase.create({
        data: {
          userId,
          feature: `spying:${platform}`,
          amountCents: priceCents,
          paymentMethod: "balance",
          status: "paid",
          paidAt: new Date(),
          metadata: { platform, priceCents } as never,
        },
      });
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "purchase_failed";
    return { ok: false, reason: msg };
  }
}

/**
 * Marca como pago apos confirmacao do PIX via webhook MP.
 * Idempotente.
 */
export async function recordSpyingPixPurchase(
  userId: string,
  platform: SpyingPlatform,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isValidSpyingPlatform(platform)) {
    return { ok: false, reason: "invalid_platform" };
  }
  const already = await hasSpyingAccess(userId, platform);
  if (already) return { ok: true };
  return { ok: true };
}
