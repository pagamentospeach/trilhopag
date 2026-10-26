import { prisma } from "./prisma";

export type ApplyCouponResult = {
  ok: boolean;
  discountCents: number;
  couponId: string | null;
  code: string | null;
  reason?: string;
};

/**
 * Valida e RECLAMA o uso de um cupom de forma atômica.
 *
 * IMPORTANTE: usa `updateMany` com WHERE-conditional (`usedCount < maxUses`)
 * pra reservar o uso na mesma operação. Se outra request paralela já consumiu
 * a última quota, `count === 0` → retorna `max_uses`. Antes existia race
 * onde dois checkouts simultâneos passavam pela checagem `usedCount >= maxUses`
 * e ambos eram aceitos, gerando overflow.
 *
 * Cupons sem `maxUses` (uso infinito) só incrementam o contador (sem
 * condição extra).
 */
export async function tryApplyCoupon(input: {
  code: string | null | undefined;
  userId: string;
  productId: string;
  amountCents: number;
}): Promise<ApplyCouponResult> {
  if (!input.code || input.code.trim().length === 0) {
    return { ok: true, discountCents: 0, couponId: null, code: null };
  }
  const code = input.code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({
    where: { userId_code: { userId: input.userId, code } },
  });
  if (!coupon || !coupon.active) {
    return {
      ok: false,
      discountCents: 0,
      couponId: null,
      code,
      reason: "invalid",
    };
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return {
      ok: false,
      discountCents: 0,
      couponId: null,
      code,
      reason: "expired",
    };
  }
  if (
    coupon.productIds.length > 0 &&
    !coupon.productIds.includes(input.productId)
  ) {
    return {
      ok: false,
      discountCents: 0,
      couponId: null,
      code,
      reason: "not_applicable",
    };
  }

  let discount = 0;
  if (coupon.discountType === "percent") {
    discount = Math.round(input.amountCents * (coupon.discountValue / 100));
  } else {
    discount = coupon.discountValue;
  }
  discount = Math.min(discount, Math.max(0, input.amountCents - 100));

  // RECLAMA o uso atomicamente. updateMany com WHERE: usedCount < maxUses
  // garante que mesmo sob race-condition entre 2 checkouts paralelos
  // só um consegue passar (Postgres serializa o UPDATE).
  if (coupon.maxUses && coupon.maxUses > 0) {
    const claim = await prisma.coupon.updateMany({
      where: {
        id: coupon.id,
        usedCount: { lt: coupon.maxUses },
        active: true,
      },
      data: { usedCount: { increment: 1 } },
    });
    if (claim.count === 0) {
      // Outra request reclamou a última quota antes desta. Race perdida.
      return {
        ok: false,
        discountCents: 0,
        couponId: null,
        code,
        reason: "max_uses",
      };
    }
  } else {
    // Cupom sem limite — só incrementa pra estatística
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  return { ok: true, discountCents: discount, couponId: coupon.id, code };
}

/**
 * Decrementa o uso de um cupom — usado quando o checkout que reservou
 * o uso falha após `tryApplyCoupon` (ex: PSP rejeitou o PIX). Evita
 * que cupons "esgotem" por checkouts que nunca foram criados.
 *
 * No-op se couponId for null.
 */
export async function releaseCouponUsage(couponId: string | null) {
  if (!couponId) return;
  await prisma.coupon.updateMany({
    where: { id: couponId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}

/**
 * @deprecated — `tryApplyCoupon` já incrementa atomicamente quando
 * passa. Mantido por compat com callers antigos (no-op se não usado).
 */
export async function incrementCouponUsage(_couponId: string) {
  void _couponId;
}
