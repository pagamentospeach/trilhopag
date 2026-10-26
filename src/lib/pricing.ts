/**
 * Pricing dinamico — admin pode editar via /admin01/precos.
 *
 * Fonte da verdade: tabela `Pricing` (singleton id="default"). Quando
 * a linha nao existe, fall back aos defaults hardcoded do schema/code.
 *
 * Cache em-memoria de 30s pra evitar bater no DB em CADA compra de tema
 * (que pode ser muitas por minuto em horario de pico). Cache invalidado
 * quando admin salva nova configuracao via revalidateTag.
 */

import { prisma } from "./prisma";
import {
  THEME_PRICE_CENTS as HARDCODED_THEME_PRICE,
} from "./theme-prices";

const FALLBACK_MASS_CAMPAIGN_CENTS = 69700;
const FALLBACK_FREE_UPLOADS = 20;
const FALLBACK_EXTRA_UPLOAD_CENTS = 100;

export type PricingSnapshot = {
  defaultThemePriceCents: number;
  themeOverrides: Record<string, number>;
  massCampaignMonthlyCents: number;
  massCampaignFreeUploadsPerCycle: number;
  massCampaignExtraUploadCents: number;
};

let cache: { snapshot: PricingSnapshot; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** Limpa cache — chamar apos admin salvar. */
export function invalidatePricingCache() {
  cache = null;
}

/**
 * Lê pricing atual do DB (com cache 30s). Cria a row default se nao
 * existir. Em caso de erro, retorna os fallbacks hardcoded.
 */
export async function getPricing(): Promise<PricingSnapshot> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.snapshot;

  try {
    const row = await prisma.pricing.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
    const overrides =
      row.themeOverrides &&
      typeof row.themeOverrides === "object" &&
      !Array.isArray(row.themeOverrides)
        ? (row.themeOverrides as Record<string, number>)
        : {};
    const snapshot: PricingSnapshot = {
      defaultThemePriceCents: row.defaultThemePriceCents,
      themeOverrides: overrides,
      massCampaignMonthlyCents: row.massCampaignMonthlyCents,
      massCampaignFreeUploadsPerCycle: row.massCampaignFreeUploadsPerCycle,
      massCampaignExtraUploadCents: row.massCampaignExtraUploadCents,
    };
    cache = { snapshot, expiresAt: now + CACHE_TTL_MS };
    return snapshot;
  } catch (e) {
    console.error("[pricing] read failed, using fallbacks:", e);
    return {
      defaultThemePriceCents: HARDCODED_THEME_PRICE,
      themeOverrides: { blame: 10000 },
      massCampaignMonthlyCents: FALLBACK_MASS_CAMPAIGN_CENTS,
      massCampaignFreeUploadsPerCycle: FALLBACK_FREE_UPLOADS,
      massCampaignExtraUploadCents: FALLBACK_EXTRA_UPLOAD_CENTS,
    };
  }
}

/**
 * Preço de um tema específico — usa DB com fallback ao hardcoded.
 * Versão ASYNC pra usar em server actions/route handlers.
 */
export async function getThemePriceCentsAsync(themeKey: string): Promise<number> {
  const pricing = await getPricing();
  return pricing.themeOverrides[themeKey] ?? pricing.defaultThemePriceCents;
}

/** Preço mensal Mass Campaign — async. */
export async function getMassCampaignMonthlyCentsAsync(): Promise<number> {
  return (await getPricing()).massCampaignMonthlyCents;
}

/** Uploads gratis incluidos no plano — async. */
export async function getMassCampaignFreeUploadsAsync(): Promise<number> {
  return (await getPricing()).massCampaignFreeUploadsPerCycle;
}
