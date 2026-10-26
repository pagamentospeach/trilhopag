/**
 * Política de taxa MÍNIMA do Trilho.
 *
 * Objetivo: proteger a margem do gateway. Nenhum seller pode ter taxa
 * abaixo de 4,9% + R$ 1,50 por venda PIX. Se cair abaixo (admin reduziu
 * por erro, bug, manipulação direta no DB), a conta é BLOQUEADA
 * automaticamente e o seller é direcionado pro WhatsApp do suporte.
 *
 * Esta lib é o ponto central de verificação:
 * - validateFees(): checa se um par de fees passa no mínimo
 * - enforceFeeFloor(): aplica em um user (bloqueia se abaixo)
 * - assertCanLowerTo(): valida antes de updateUser admin gravar
 */

import { prisma } from "./prisma";

export const MIN_PIX_FEE_PERCENT = 4.9;
export const MIN_PIX_FIXED_CENTS = 150; // R$ 1,50
export const MIN_CARD_FEE_PERCENT = 4.9;
export const MIN_CARD_FIXED_CENTS = 150;

export const SUPPORT_WHATSAPP = "5511977700227";

/** Mensagem padrão usada no bloqueio. */
export const BELOW_MIN_FEE_BLOCK_REASON =
  "Taxas abaixo do mínimo permitido pela plataforma (mín. 4,9% + R$ 1,50). Entre em contato com o suporte.";

export type FeeSet = {
  feePercent: number;
  feeFixedCents: number;
  cardFeePercent: number;
  cardFeeFixedCents: number;
};

/**
 * Retorna { ok: true } se todas as taxas respeitam o piso mínimo.
 * Retorna { ok: false, reason } com mensagem amigável caso contrário.
 */
export function validateFees(fees: FeeSet): { ok: true } | { ok: false; reason: string } {
  if (fees.feePercent < MIN_PIX_FEE_PERCENT) {
    return {
      ok: false,
      reason: `Taxa PIX (${fees.feePercent.toFixed(2)}%) abaixo do mínimo (${MIN_PIX_FEE_PERCENT}%)`,
    };
  }
  if (fees.feeFixedCents < MIN_PIX_FIXED_CENTS) {
    return {
      ok: false,
      reason: `Taxa fixa PIX abaixo do mínimo (R$ ${(MIN_PIX_FIXED_CENTS / 100).toFixed(2)})`,
    };
  }
  if (fees.cardFeePercent < MIN_CARD_FEE_PERCENT) {
    return {
      ok: false,
      reason: `Taxa cartão (${fees.cardFeePercent.toFixed(2)}%) abaixo do mínimo (${MIN_CARD_FEE_PERCENT}%)`,
    };
  }
  if (fees.cardFeeFixedCents < MIN_CARD_FIXED_CENTS) {
    return {
      ok: false,
      reason: `Taxa fixa cartão abaixo do mínimo (R$ ${(MIN_CARD_FIXED_CENTS / 100).toFixed(2)})`,
    };
  }
  return { ok: true };
}

/**
 * Verifica o user no DB e bloqueia automaticamente se as taxas estiverem
 * abaixo do mínimo. Retorna o resultado da verificação.
 *
 * Idempotente: se já bloqueado pelo mesmo motivo, não duplica audit log.
 */
export async function enforceFeeFloor(userId: string): Promise<{
  ok: boolean;
  blocked: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      feePercent: true,
      feeFixedCents: true,
      cardFeePercent: true,
      cardFeeFixedCents: true,
      blocked: true,
      blockReason: true,
      role: true,
    },
  });
  if (!user) return { ok: false, blocked: false, reason: "Usuário inexistente" };
  // Admin não é bloqueado por essa regra (ele controla)
  if (user.role === "admin") return { ok: true, blocked: false };

  const check = validateFees({
    feePercent: user.feePercent,
    feeFixedCents: user.feeFixedCents,
    cardFeePercent: user.cardFeePercent,
    cardFeeFixedCents: user.cardFeeFixedCents,
  });

  if (check.ok) {
    return { ok: true, blocked: user.blocked };
  }

  // Abaixo do mínimo — bloqueia se ainda não está
  if (!user.blocked) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        blocked: true,
        blockReason: BELOW_MIN_FEE_BLOCK_REASON,
      },
    });
    await prisma.adminAuditLog.create({
      data: {
        adminId: "system", // bloqueio automático do sistema
        action: "user.block.auto.minfee",
        target: userId,
        payload: {
          reason: check.reason,
          feePercent: user.feePercent,
          feeFixedCents: user.feeFixedCents,
          cardFeePercent: user.cardFeePercent,
          cardFeeFixedCents: user.cardFeeFixedCents,
        },
      },
    });
  }

  return { ok: false, blocked: true, reason: check.reason };
}

/**
 * Valida ANTES de gravar uma alteração de taxa (admin updateUser).
 * Throws se as taxas propostas estão abaixo do mínimo.
 */
export function assertFeesAboveFloor(fees: FeeSet): void {
  const r = validateFees(fees);
  if (!r.ok) {
    throw new Error(`Taxa abaixo do mínimo: ${r.reason}`);
  }
}

/**
 * Varredura em todos os users — bloqueia quem tá abaixo do piso.
 * Usado por cron job de auditoria periódica.
 *
 * Retorna estatísticas.
 */
export async function sweepAllUsersForMinFee(): Promise<{
  scanned: number;
  blocked: number;
  alreadyOk: number;
  alreadyBlocked: number;
}> {
  const users = await prisma.user.findMany({
    where: { role: { not: "admin" }, blocked: false },
    select: {
      id: true,
      feePercent: true,
      feeFixedCents: true,
      cardFeePercent: true,
      cardFeeFixedCents: true,
    },
  });

  let blocked = 0;
  let alreadyOk = 0;

  for (const u of users) {
    const check = validateFees({
      feePercent: u.feePercent,
      feeFixedCents: u.feeFixedCents,
      cardFeePercent: u.cardFeePercent,
      cardFeeFixedCents: u.cardFeeFixedCents,
    });
    if (check.ok) {
      alreadyOk++;
      continue;
    }
    // Bloqueia
    await prisma.user.update({
      where: { id: u.id },
      data: { blocked: true, blockReason: BELOW_MIN_FEE_BLOCK_REASON },
    });
    await prisma.adminAuditLog.create({
      data: {
        adminId: "system",
        action: "user.block.auto.minfee",
        target: u.id,
        payload: { reason: check.reason, fees: u },
      },
    });
    blocked++;
  }

  return {
    scanned: users.length,
    blocked,
    alreadyOk,
    alreadyBlocked: 0,
  };
}
