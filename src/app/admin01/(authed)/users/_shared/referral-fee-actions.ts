/**
 * Ajuste de taxas por modo — sobrou do /dashboard/rede.
 *
 * 10/08/2026 (davi): "Apaga a aba de minha rede". A aba do seller saiu, mas o
 * ADMIN continua editando taxas de indicado por aqui (users/[id] e o modal de
 * bulk), entao estas tres actions vieram junto com o editor pra dentro do
 * admin em vez de morrer com a rota.
 *
 * As outras seis actions do arquivo original (desvio, taxa avulsa, defaults de
 * link) foram embora com a aba — nenhuma tela restante chamava.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId } from "@/lib/auth-helpers";
import {
} from "@/lib/fees";

const SimpleInput = z.object({
  feePercent: z.coerce.number().min(0).max(50),
  feeFixedCents: z.coerce.number().int().min(0).max(10000),
});

/**
 * Update simples (PIX só) — usado pelo form inline da lista de rede.
 * Kept pra retrocompatibilidade.
 */
const ModePixFee = z.object({
  pixPct: z.number().min(0).max(100),
  pixFix: z.number().int().min(0).max(100_000),
});

const LinkModeDefaultsInput = z.object({
  black: ModePixFee,
  white: ModePixFee.extend({
    cardPct: z.number().min(0).max(100),
    cardFix: z.number().int().min(0).max(100_000),
  }),
  hot: ModePixFee,
  withdrawalFeeCents: z.number().int().min(0).max(100_000),
});

export async function updateLinkDefaultsByMode(
  input: z.infer<typeof LinkModeDefaultsInput>,
) {
  const userId = await requireSessionUserId();
  const parsed = LinkModeDefaultsInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      feePercent: true,
      feeFixedCents: true,
      cardFeePercent: true,
      cardFeeFixedCents: true,
      withdrawalFeeCents: true,
    },
  });
  if (!me) return { ok: false as const, error: "User inválido." };

  const { black, white, hot, withdrawalFeeCents } = parsed.data;
  // REGRA: o indicado NUNCA pode ter taxa menor que a do próprio indicador —
  // ele ganha justamente na diferença. Vale pros 3 modos (PIX em todos, cartão
  // no white) + saque. Comparado contra a taxa atual do indicador por método.
  const checks: Array<[number, number, string]> = [
    [black.pixPct, me.feePercent, "Black PIX %"],
    [black.pixFix, me.feeFixedCents, "Black PIX fixa"],
    [white.pixPct, me.feePercent, "White PIX %"],
    [white.pixFix, me.feeFixedCents, "White PIX fixa"],
    [white.cardPct, me.cardFeePercent, "White Cartão %"],
    [white.cardFix, me.cardFeeFixedCents, "White Cartão fixa"],
    [hot.pixPct, me.feePercent, "Hot PIX %"],
    [hot.pixFix, me.feeFixedCents, "Hot PIX fixa"],
    [withdrawalFeeCents, me.withdrawalFeeCents, "Saque"],
  ];
  for (const [proposed, mine, label] of checks) {
    if (proposed < mine) {
      const isPct = label.endsWith("%");
      const mineStr = isPct ? `${mine}%` : `R$ ${(mine / 100).toFixed(2)}`;
      return {
        ok: false as const,
        error: `${label} não pode ser menor que a sua taxa (${mineStr}). Você ganha na diferença — defina ≥ a sua.`,
      };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      linkDefaultsByMode: { black, white, hot } as object,
      linkDefaultWithdrawalFeeCents: withdrawalFeeCents,
    },
  });
  revalidatePath("/dashboard/indique");
  return { ok: true as const };
}

/**
 * Edita as taxas por modo de adquirente de UM indicado específico (override).
 * Mesma regra: nunca abaixo da taxa do indicador. Guarda em feesByMode do
 * indicado + saque direto, e aplica já o modo atual dele.
 */
export async function updateReferralFeesByMode(
  referredUserId: string,
  input: z.infer<typeof LinkModeDefaultsInput>,
) {
  const referrerId = await requireSessionUserId();
  const parsed = LinkModeDefaultsInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };

  const referred = await prisma.user.findFirst({
    where: { id: referredUserId, referredByUserId: referrerId },
    select: { id: true, pixOpsMode: true },
  });
  if (!referred)
    return { ok: false as const, error: "Usuário não está na sua rede." };

  const me = await prisma.user.findUnique({
    where: { id: referrerId },
    select: {
      feePercent: true,
      feeFixedCents: true,
      cardFeePercent: true,
      cardFeeFixedCents: true,
      withdrawalFeeCents: true,
    },
  });
  if (!me) return { ok: false as const, error: "Referenciador inválido." };

  const { black, white, hot, withdrawalFeeCents } = parsed.data;
  const checks: Array<[number, number, string]> = [
    [black.pixPct, me.feePercent, "Black PIX %"],
    [black.pixFix, me.feeFixedCents, "Black PIX fixa"],
    [white.pixPct, me.feePercent, "White PIX %"],
    [white.pixFix, me.feeFixedCents, "White PIX fixa"],
    [white.cardPct, me.cardFeePercent, "White Cartão %"],
    [white.cardFix, me.cardFeeFixedCents, "White Cartão fixa"],
    [hot.pixPct, me.feePercent, "Hot PIX %"],
    [hot.pixFix, me.feeFixedCents, "Hot PIX fixa"],
    [withdrawalFeeCents, me.withdrawalFeeCents, "Saque"],
  ];
  for (const [proposed, mine, label] of checks) {
    if (proposed < mine) {
      const isPct = label.endsWith("%");
      const mineStr = isPct ? `${mine}%` : `R$ ${(mine / 100).toFixed(2)}`;
      return {
        ok: false as const,
        error: `${label} não pode ser menor que a sua taxa (${mineStr}). Você ganha na diferença.`,
      };
    }
  }

  await prisma.user.update({
    where: { id: referredUserId },
    data: {
      feesByMode: { black, white, hot } as object,
      withdrawalFeeCents,
    },
  });
  // Aplica já as taxas do modo ATUAL do indicado (feesByMode tem precedência).
  try {
    const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
    await applyModeDefaultsToUser(referredUserId, referred.pixOpsMode ?? "white");
  } catch {
    /* não bloqueia o save */
  }
  revalidatePath("/dashboard/indique");
  return { ok: true as const };
}

/**
 * Edita as taxas por modo de VÁRIOS indicados de uma vez (ação em massa).
 * Mesma regra de piso (nunca abaixo da taxa do indicador). Aplica o mesmo
 * conjunto de taxas a todos os indicados informados que de fato pertencem à
 * rede do referrer. Aplica já o modo atual de cada um.
 */
export async function updateReferralFeesByModeBulk(
  referredUserIds: string[],
  input: z.infer<typeof LinkModeDefaultsInput>,
) {
  const referrerId = await requireSessionUserId();
  const parsed = LinkModeDefaultsInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos." };
  if (!Array.isArray(referredUserIds) || referredUserIds.length === 0) {
    return { ok: false as const, error: "Selecione ao menos um indicado." };
  }

  const me = await prisma.user.findUnique({
    where: { id: referrerId },
    select: {
      feePercent: true,
      feeFixedCents: true,
      cardFeePercent: true,
      cardFeeFixedCents: true,
      withdrawalFeeCents: true,
    },
  });
  if (!me) return { ok: false as const, error: "Referenciador inválido." };

  const { black, white, hot, withdrawalFeeCents } = parsed.data;
  const checks: Array<[number, number, string]> = [
    [black.pixPct, me.feePercent, "Black PIX %"],
    [black.pixFix, me.feeFixedCents, "Black PIX fixa"],
    [white.pixPct, me.feePercent, "White PIX %"],
    [white.pixFix, me.feeFixedCents, "White PIX fixa"],
    [white.cardPct, me.cardFeePercent, "White Cartão %"],
    [white.cardFix, me.cardFeeFixedCents, "White Cartão fixa"],
    [hot.pixPct, me.feePercent, "Hot PIX %"],
    [hot.pixFix, me.feeFixedCents, "Hot PIX fixa"],
    [withdrawalFeeCents, me.withdrawalFeeCents, "Saque"],
  ];
  for (const [proposed, mine, label] of checks) {
    if (proposed < mine) {
      const isPct = label.endsWith("%");
      const mineStr = isPct ? `${mine}%` : `R$ ${(mine / 100).toFixed(2)}`;
      return {
        ok: false as const,
        error: `${label} não pode ser menor que a sua taxa (${mineStr}). Você ganha na diferença.`,
      };
    }
  }

  // Só aplica nos indicados que REALMENTE são da rede deste referrer.
  const owned = await prisma.user.findMany({
    where: { id: { in: referredUserIds }, referredByUserId: referrerId },
    select: { id: true, pixOpsMode: true },
  });
  if (owned.length === 0) {
    return { ok: false as const, error: "Nenhum indicado válido na sua rede." };
  }

  await prisma.user.updateMany({
    where: {
      id: { in: owned.map((o) => o.id) },
      referredByUserId: referrerId,
    },
    data: {
      feesByMode: { black, white, hot } as object,
      withdrawalFeeCents,
    },
  });

  // Aplica já as taxas do modo ATUAL de cada indicado (feesByMode precede).
  try {
    const { applyModeDefaultsToUser } = await import("@/lib/mode-defaults");
    await Promise.all(
      owned.map((o) => applyModeDefaultsToUser(o.id, o.pixOpsMode ?? "white")),
    );
  } catch {
    /* não bloqueia o save */
  }
  revalidatePath("/dashboard/indique");
  return { ok: true as const, count: owned.length };
}

/**
 * Define o % de desvio aplicado nas transações de um indicado específico.
 *
 * GATING: só funciona se o referrer tiver User.referralDeviationEnabled=true
 * (admin acionou esse feature flag). Quando false, mesmo que o seller mande
 * payload manualmente, a action retorna erro.
 *
 * O desvio é processado em `lib/transactions.ts`: cada tx PAID do indicado
 * tem chance % de ser silenciosamente desviada — netCents vai pra balance
 * do referrer (que esse user) e a tx some das views do indicado.
 */
const DeviationInput = z.object({
  percent: z.coerce.number().min(0).max(100),
});

