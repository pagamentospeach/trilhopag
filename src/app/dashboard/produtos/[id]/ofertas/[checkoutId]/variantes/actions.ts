"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { parseBRLToCents } from "@/lib/money";
import { checkOnAction } from "@/lib/achievements";

const VariantInput = z.object({
  label: z.string().trim().min(1, "Nome obrigatório").max(60),
  headline: z.string().trim().max(120).optional().nullable(),
  ctaText: z.string().trim().max(60).optional().nullable(),
  priceOverride: z.string().optional().nullable(),
  weight: z.coerce.number().int().min(1).max(100),
  active: z.coerce.boolean().optional(),
});

async function checkoutGuard(checkoutId: string) {
  const userId = await requireUserId();
  const c = await prisma.checkout.findFirst({
    where: { id: checkoutId, userId },
    select: { id: true },
  });
  if (!c) throw new Error("Checkout não encontrado.");
  return userId;
}

export async function createVariant(checkoutId: string, formData: FormData) {
  const userId = await checkoutGuard(checkoutId);
  const parsed = VariantInput.safeParse({
    label: formData.get("label"),
    headline: formData.get("headline") || null,
    ctaText: formData.get("ctaText") || null,
    priceOverride: formData.get("priceOverride") || null,
    weight: formData.get("weight") || 50,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const priceCents =
    parsed.data.priceOverride && parsed.data.priceOverride.length > 0
      ? parseBRLToCents(parsed.data.priceOverride)
      : null;

  await prisma.checkoutVariant.create({
    data: {
      checkoutId,
      label: parsed.data.label,
      headline: parsed.data.headline || null,
      ctaText: parsed.data.ctaText || null,
      priceCentsOverride: priceCents && priceCents > 0 ? priceCents : null,
      weight: parsed.data.weight,
      active: parsed.data.active ?? true,
    },
  });
  await checkOnAction(userId, "ab_variant_created");
  revalidatePath(`/dashboard/produtos`);
  return { ok: true as const };
}

export async function updateVariant(variantId: string, formData: FormData) {
  const userId = await requireUserId();
  const v = await prisma.checkoutVariant.findFirst({
    where: { id: variantId, checkout: { userId } },
    select: { id: true, checkoutId: true },
  });
  if (!v) return { ok: false as const, error: "Variante não encontrada." };

  const parsed = VariantInput.safeParse({
    label: formData.get("label"),
    headline: formData.get("headline") || null,
    ctaText: formData.get("ctaText") || null,
    priceOverride: formData.get("priceOverride") || null,
    weight: formData.get("weight") || 50,
    active: formData.get("active") === "on",
  });
  if (!parsed.success)
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };

  const priceCents =
    parsed.data.priceOverride && parsed.data.priceOverride.length > 0
      ? parseBRLToCents(parsed.data.priceOverride)
      : null;

  await prisma.checkoutVariant.update({
    where: { id: variantId },
    data: {
      label: parsed.data.label,
      headline: parsed.data.headline || null,
      ctaText: parsed.data.ctaText || null,
      priceCentsOverride: priceCents && priceCents > 0 ? priceCents : null,
      weight: parsed.data.weight,
      active: parsed.data.active ?? true,
    },
  });
  revalidatePath(`/dashboard/checkouts/${v.checkoutId}/variantes`);
  return { ok: true as const };
}

export async function deleteVariant(variantId: string) {
  const userId = await requireUserId();
  const v = await prisma.checkoutVariant.findFirst({
    where: { id: variantId, checkout: { userId } },
    select: { id: true, checkoutId: true },
  });
  if (!v) return { ok: false as const, error: "Variante não encontrada." };
  await prisma.checkoutVariant.delete({ where: { id: variantId } });
  revalidatePath(`/dashboard/checkouts/${v.checkoutId}/variantes`);
  return { ok: true as const };
}
