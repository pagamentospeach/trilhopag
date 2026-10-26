"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-auth";

/**
 * Update das taxas padrão do gateway. Aplica em novos signups SEM
 * indicação. Indicados continuam herdando do referrer.
 *
 * Piso mínimo é validado no nível do User (4.9% + R$ 1,50 PIX). Aqui
 * permite admin setar qualquer valor — assume que ele sabe o que tá
 * fazendo (alguns sellers black operam abaixo do piso por acordo).
 */
const Input = z.object({
  feePercent: z.number().min(0).max(100),
  feeFixedCents: z.number().int().min(0).max(100000),
  cardFeePercent: z.number().min(0).max(100),
  cardFeeFixedCents: z.number().int().min(0).max(100000),
  boletoFeePercent: z.number().min(0).max(100),
  boletoFeeFixedCents: z.number().int().min(0).max(100000),
  applePayFeePercent: z.number().min(0).max(100),
  applePayFeeFixedCents: z.number().int().min(0).max(100000),
  googlePayFeePercent: z.number().min(0).max(100),
  googlePayFeeFixedCents: z.number().int().min(0).max(100000),
  withdrawalFeeCents: z.number().int().min(0).max(100000),
  /** HOT — taxa total flat por venda (centavos). Default 100 = R$ 1,00. */
  hotFeeFixedCents: z.number().int().min(0).max(100000),
});

export async function savePlatformDefaults(raw: z.infer<typeof Input>) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.flatten().formErrors[0] ?? "Dados inválidos",
    };
  }

  await prisma.platformDefaults.upsert({
    where: { id: "default" },
    update: { ...parsed.data, updatedById: r.admin.id },
    create: {
      id: "default",
      ...parsed.data,
      updatedById: r.admin.id,
    },
  });

  await logAdminAction(
    r.admin.id,
    "platform_defaults.update",
    "default",
    parsed.data,
  );

  revalidatePath("/admin01/taxas-padrao");
  return { ok: true as const };
}
