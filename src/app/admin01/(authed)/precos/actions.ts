"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-auth";
import { invalidatePricingCache } from "@/lib/pricing";

const Input = z.object({
  defaultThemePriceCents: z.number().int().min(0).max(100_000_00),
  themeOverrides: z.record(
    z.string().min(1).max(40),
    z.number().int().min(0).max(100_000_00),
  ),
  massCampaignMonthlyCents: z.number().int().min(0).max(100_000_00),
  massCampaignFreeUploadsPerCycle: z.number().int().min(0).max(1000),
  massCampaignExtraUploadCents: z.number().int().min(0).max(100_000_00),
});

export async function savePricing(raw: z.infer<typeof Input>) {
  const r = await requireAdminWrite();
  if (!r) return { ok: false as const, error: "Não autorizado" };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.flatten().formErrors[0] ?? "Dados inválidos",
    };
  }

  await prisma.pricing.upsert({
    where: { id: "default" },
    update: {
      defaultThemePriceCents: parsed.data.defaultThemePriceCents,
      themeOverrides: parsed.data.themeOverrides as never,
      massCampaignMonthlyCents: parsed.data.massCampaignMonthlyCents,
      massCampaignFreeUploadsPerCycle:
        parsed.data.massCampaignFreeUploadsPerCycle,
      massCampaignExtraUploadCents: parsed.data.massCampaignExtraUploadCents,
      updatedById: r.admin.id,
    },
    create: {
      id: "default",
      defaultThemePriceCents: parsed.data.defaultThemePriceCents,
      themeOverrides: parsed.data.themeOverrides as never,
      massCampaignMonthlyCents: parsed.data.massCampaignMonthlyCents,
      massCampaignFreeUploadsPerCycle:
        parsed.data.massCampaignFreeUploadsPerCycle,
      massCampaignExtraUploadCents: parsed.data.massCampaignExtraUploadCents,
      updatedById: r.admin.id,
    },
  });

  // Limpa cache server-side pra que mudanca seja imediata em compras
  invalidatePricingCache();

  await logAdminAction(r.admin.id, "pricing.update", "default", parsed.data);

  revalidatePath("/admin01/precos");
  revalidatePath("/dashboard/aparencia");
  return { ok: true as const };
}
