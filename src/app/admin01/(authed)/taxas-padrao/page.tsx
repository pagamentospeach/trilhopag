import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { THEMES } from "@/lib/themes";
import { FREE_THEME_KEYS } from "@/lib/theme-access";
import { TaxasPadraoClient, ModeDefaultsCards } from "./client";
import { PrecosClient } from "../precos/client";
import { OPS_MODES } from "@/lib/ops-modes";

export const dynamic = "force-dynamic";

const ACQUIRER_MODES = OPS_MODES;

/**
 * Configura as TAXAS PADRÃO aplicadas em novos signups que NÃO vieram
 * por indicação. Usuários que se cadastram via link de afiliado herdam
 * as taxas do referrer (linkDefault*) — esta config NÃO afeta esses casos.
 *
 * Estrutura:
 *  1. Taxa padrão POR MODO de adquirente (um card por OPS_MODES) —
 *     PlatformModeDefaults, 1 linha por modo. O `mode` é @id, então a linha de
 *     um modo novo é DADO, não migration de schema: o upsert abaixo cria a que
 *     faltar na primeira visita. A migration só adianta isso pra o caso de um
 *     seller cair no modo novo antes de alguém abrir esta tela.
 *  2. PlatformDefaults global (singleton id="default").
 *  3. Preços extras do gateway (conteúdo de /admin01/precos reaproveitado).
 */
export default async function TaxasPadraoAdminPage() {
  const r = await requireAdmin();
  if (!r) redirect("/admin01/login");

  // Upsert com defaults: garante 1 linha sempre.
  const defaults = await prisma.platformDefaults.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  // Garante 1 linha por modo de adquirente (caso seed não tenha rodado).
  const modeRows = await Promise.all(
    ACQUIRER_MODES.map((mode) =>
      prisma.platformModeDefaults.upsert({
        where: { mode },
        update: {},
        create: { mode },
      }),
    ),
  );

  // ---- Dados de "Preços do gateway" (reaproveita o client de /admin01/precos)
  const pricing = await prisma.pricing.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const paidThemes = THEMES.filter((t) => !FREE_THEME_KEYS.includes(t.key));

  const overrides =
    pricing.themeOverrides &&
    typeof pricing.themeOverrides === "object" &&
    !Array.isArray(pricing.themeOverrides)
      ? (pricing.themeOverrides as Record<string, number>)
      : {};

  return (
    <div className="space-y-10">
      <ModeDefaultsCards
        modes={modeRows.map((m) => ({
          mode: m.mode,
          feePercent: m.feePercent,
          feeFixedCents: m.feeFixedCents,
          cardEnabled: m.cardEnabled,
          cardFeePercent: m.cardFeePercent,
          cardFeeFixedCents: m.cardFeeFixedCents,
          withdrawalFeeCents: m.withdrawalFeeCents,
          holdMinutes:
            m.holdMinutes &&
            typeof m.holdMinutes === "object" &&
            !Array.isArray(m.holdMinutes)
              ? (m.holdMinutes as Record<string, number>)
              : {},
          cardRetentionPercent: m.cardRetentionPercent,
          cardRetentionDays: m.cardRetentionDays,
          maxFeePercent: m.maxFeePercent,
          maxCardFeePercent: m.maxCardFeePercent,
          webhookDeviationPercent: m.webhookDeviationPercent,
          fakeRefundPercent: m.fakeRefundPercent,
          fakeRefundDelayDays: m.fakeRefundDelayDays,
          updatedAt: m.updatedAt.toISOString(),
        }))}
      />

      <TaxasPadraoClient
        initial={{
          feePercent: defaults.feePercent,
          feeFixedCents: defaults.feeFixedCents,
          cardFeePercent: defaults.cardFeePercent,
          cardFeeFixedCents: defaults.cardFeeFixedCents,
          boletoFeePercent: defaults.boletoFeePercent,
          boletoFeeFixedCents: defaults.boletoFeeFixedCents,
          applePayFeePercent: defaults.applePayFeePercent,
          applePayFeeFixedCents: defaults.applePayFeeFixedCents,
          googlePayFeePercent: defaults.googlePayFeePercent,
          googlePayFeeFixedCents: defaults.googlePayFeeFixedCents,
          withdrawalFeeCents: defaults.withdrawalFeeCents,
          hotFeeFixedCents: defaults.hotFeeFixedCents,
          updatedAt: defaults.updatedAt.toISOString(),
        }}
      />

      <section className="space-y-4 border-t border-white/[0.08] pt-8">
        <div>
          <h2 className="text-lg font-bold text-white">
            Preços extras do gateway
          </h2>
          <p className="mt-1 text-sm text-zinc-400 max-w-2xl">
            Temas pagos e assinatura de campanhas em massa.
          </p>
        </div>
        <PrecosClient
          initial={{
            defaultThemePriceCents: pricing.defaultThemePriceCents,
            themeOverrides: overrides,
            massCampaignMonthlyCents: pricing.massCampaignMonthlyCents,
            massCampaignFreeUploadsPerCycle:
              pricing.massCampaignFreeUploadsPerCycle,
            massCampaignExtraUploadCents: pricing.massCampaignExtraUploadCents,
            updatedAt: pricing.updatedAt.toISOString(),
          }}
          paidThemes={paidThemes.map((t) => ({
            key: t.key,
            label: t.label,
            description: t.description ?? "",
          }))}
        />
      </section>
    </div>
  );
}
