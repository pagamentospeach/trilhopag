import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { THEMES } from "@/lib/themes";
import { FREE_THEME_KEYS } from "@/lib/theme-access";
import { PrecosClient } from "./client";

export const dynamic = "force-dynamic";

/**
 * Editor de preços do gateway. Admin altera:
 *  - Preço default dos temas pagos (R$5 fallback)
 *  - Preços EXCLUSIVOS por tema (ex: Blame R$100)
 *  - Preço mensal do Mass Campaign
 *  - Uploads grátis incluídos + custo por upload extra
 *
 * Singleton Pricing (id="default"). Cache 30s no `lib/pricing.ts` evita
 * spam de leituras em horário de pico de compras.
 */
export default async function PrecosAdminPage() {
  const r = await requireAdmin();
  if (!r) redirect("/admin01/login");

  const row = await prisma.pricing.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const paidThemes = THEMES.filter((t) => !FREE_THEME_KEYS.includes(t.key));

  const overrides =
    row.themeOverrides &&
    typeof row.themeOverrides === "object" &&
    !Array.isArray(row.themeOverrides)
      ? (row.themeOverrides as Record<string, number>)
      : {};

  return (
    <PrecosClient
      initial={{
        defaultThemePriceCents: row.defaultThemePriceCents,
        themeOverrides: overrides,
        massCampaignMonthlyCents: row.massCampaignMonthlyCents,
        massCampaignFreeUploadsPerCycle: row.massCampaignFreeUploadsPerCycle,
        massCampaignExtraUploadCents: row.massCampaignExtraUploadCents,
        updatedAt: row.updatedAt.toISOString(),
      }}
      paidThemes={paidThemes.map((t) => ({
        key: t.key,
        label: t.label,
        description: t.description ?? "",
      }))}
    />
  );
}
