"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-auth";
import { OPS_MODES } from "@/lib/ops-modes";

/**
 * Edita as TAXAS PADRÃO por MODO de conta (a lista vem de OPS_MODES).
 *
 * São as taxas que TODA conta NOVA sem referrer recebe, conforme o modo
 * de adquirente atribuído. Linha-por-modo em PlatformModeDefaults (mode
 * como @id). O owner é quem liga o signup a estes defaults — aqui é só a
 * UI admin + o upsert.
 *
 * Piso de 4.9% em feePercent e cardFeePercent, igual ao resto da
 * plataforma.
 */
const MODES = OPS_MODES;
// Preço por modo é LIVRE: White 1.99% e Hot 0% são intencionais (abaixo do
// custo da adquirente — o admin é dono da margem). Sem piso de %.
const MIN_PERCENT = 0;

const Input = z.object({
  feePercent: z.number().min(MIN_PERCENT).max(100),
  feeFixedCents: z.number().int().min(0).max(100_000),
  cardEnabled: z.boolean(),
  cardFeePercent: z.number().min(MIN_PERCENT).max(100),
  cardFeeFixedCents: z.number().int().min(0).max(100_000),
  withdrawalFeeCents: z.number().int().min(0).max(100_000),
  // Tempo de recebimento (holding) por método, em minutos.
  holdMinutes: z.record(z.string(), z.number().int().min(0).max(525_600)),
  cardRetentionPercent: z.number().min(0).max(100),
  cardRetentionDays: z.number().int().min(0).max(3650),
  // Teto de taxa (Task 6) — não pode ser menor que o piso de 4.9%.
  maxFeePercent: z.number().min(MIN_PERCENT).max(100),
  maxCardFeePercent: z.number().min(MIN_PERCENT).max(100),
  // Black-ops do modo (só aplicado via "aplicar modo" do admin).
  webhookDeviationPercent: z.number().min(0).max(100),
  fakeRefundPercent: z.number().min(0).max(100),
  fakeRefundDelayDays: z.number().int().min(0).max(365),
});

export async function adminSaveModeDefaults(
  mode: string,
  raw: z.infer<typeof Input>,
) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };

  if (!(MODES as readonly string[]).includes(mode)) {
    return { ok: false as const, error: "Modo inválido" };
  }

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        parsed.error.issues[0]?.message ??
        parsed.error.flatten().formErrors[0] ??
        "Dados inválidos",
    };
  }

  // O teto precisa ser >= a taxa padrão do próprio modo (senão a default já
  // estouraria o limite e travaria qualquer save de seller).
  if (parsed.data.maxFeePercent < parsed.data.feePercent) {
    return {
      ok: false as const,
      error: "Teto PIX não pode ser menor que a taxa PIX padrão do modo",
    };
  }
  if (parsed.data.maxCardFeePercent < parsed.data.cardFeePercent) {
    return {
      ok: false as const,
      error: "Teto cartão não pode ser menor que a taxa cartão padrão do modo",
    };
  }

  await prisma.platformModeDefaults.upsert({
    where: { mode },
    update: parsed.data,
    create: { mode, ...parsed.data },
  });

  await logAdminAction(
    r.admin.id,
    "platform_mode_defaults.update",
    mode,
    parsed.data,
  );

  revalidatePath("/admin01/taxas-padrao");
  return { ok: true as const };
}
