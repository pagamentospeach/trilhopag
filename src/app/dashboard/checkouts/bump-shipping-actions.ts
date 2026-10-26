"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * Actions pra OrderBumps e ShippingOptions de cada Checkout.
 * Cada checkout pode ter N bumps + N opções de frete (1-N).
 *
 * Todas as actions garantem que o checkout pertence ao user (auth check).
 */

async function assertOwnsCheckout(checkoutId: string) {
  const userId = await requireUserId();
  const checkout = await prisma.checkout.findFirst({
    where: { id: checkoutId, userId },
    select: { id: true },
  });
  if (!checkout) throw new Error("Checkout não encontrado.");
  return { userId, checkoutId };
}

// ============ ORDER BUMPS ============

const BumpInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().max(2000).optional().nullable(),
  priceCents: z.coerce.number().int().min(0).max(10_000_000),
  originalPriceCents: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  productId: z.string().trim().min(1).max(120).optional().nullable(),
});

export async function createOrderBump(
  checkoutId: string,
  input: z.infer<typeof BumpInput>,
) {
  await assertOwnsCheckout(checkoutId);
  const parsed = BumpInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Dados inválidos." };

  const count = await prisma.orderBump.count({ where: { checkoutId } });
  if (count >= 10) {
    return { ok: false as const, error: "Limite de 10 bumps por checkout." };
  }

  const bump = await prisma.orderBump.create({
    data: {
      checkoutId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      priceCents: parsed.data.priceCents,
      originalPriceCents: parsed.data.originalPriceCents ?? null,
      productId: parsed.data.productId ?? null,
      sortOrder: count,
      active: true,
    },
  });
  revalidatePath(`/dashboard/checkout-builder/${checkoutId}`);
  return { ok: true as const, bump };
}

export async function updateOrderBump(
  bumpId: string,
  input: z.infer<typeof BumpInput> & { active?: boolean },
) {
  const userId = await requireUserId();
  const existing = await prisma.orderBump.findFirst({
    where: { id: bumpId, checkout: { userId } },
    select: { id: true, checkoutId: true },
  });
  if (!existing) return { ok: false as const, error: "Bump não encontrado." };

  const parsed = BumpInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Dados inválidos." };

  await prisma.orderBump.update({
    where: { id: bumpId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      priceCents: parsed.data.priceCents,
      originalPriceCents: parsed.data.originalPriceCents ?? null,
      productId: parsed.data.productId ?? null,
      ...(typeof input.active === "boolean" ? { active: input.active } : {}),
    },
  });
  revalidatePath(`/dashboard/checkout-builder/${existing.checkoutId}`);
  return { ok: true as const };
}

export async function deleteOrderBump(bumpId: string) {
  const userId = await requireUserId();
  const existing = await prisma.orderBump.findFirst({
    where: { id: bumpId, checkout: { userId } },
    select: { id: true, checkoutId: true },
  });
  if (!existing) return { ok: false as const, error: "Bump não encontrado." };
  await prisma.orderBump.delete({ where: { id: bumpId } });
  revalidatePath(`/dashboard/checkout-builder/${existing.checkoutId}`);
  return { ok: true as const };
}

export async function reorderOrderBumps(
  checkoutId: string,
  orderedIds: string[],
) {
  await assertOwnsCheckout(checkoutId);
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.orderBump.update({
        where: { id },
        data: { sortOrder: i },
      }),
    ),
  );
  revalidatePath(`/dashboard/checkout-builder/${checkoutId}`);
  return { ok: true as const };
}

// ============ SHIPPING OPTIONS ============

const ShippingInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().max(2000).optional().nullable(),
  priceCents: z.coerce.number().int().min(0).max(10_000_000),
  estimatedTime: z.string().trim().max(80).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export async function createShippingOption(
  checkoutId: string,
  input: z.infer<typeof ShippingInput>,
) {
  await assertOwnsCheckout(checkoutId);
  const parsed = ShippingInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Dados inválidos." };

  const count = await prisma.shippingOption.count({ where: { checkoutId } });
  if (count >= 20) {
    return {
      ok: false as const,
      error: "Limite de 20 opções de frete por checkout.",
    };
  }

  // Se isDefault, desmarca os outros
  if (parsed.data.isDefault) {
    await prisma.shippingOption.updateMany({
      where: { checkoutId },
      data: { isDefault: false },
    });
  }

  const opt = await prisma.shippingOption.create({
    data: {
      checkoutId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      priceCents: parsed.data.priceCents,
      estimatedTime: parsed.data.estimatedTime ?? null,
      isDefault: parsed.data.isDefault ?? count === 0, // primeira vira default automaticamente
      sortOrder: count,
      active: true,
    },
  });
  revalidatePath(`/dashboard/checkout-builder/${checkoutId}`);
  return { ok: true as const, option: opt };
}

export async function updateShippingOption(
  optId: string,
  input: z.infer<typeof ShippingInput> & { active?: boolean },
) {
  const userId = await requireUserId();
  const existing = await prisma.shippingOption.findFirst({
    where: { id: optId, checkout: { userId } },
    select: { id: true, checkoutId: true },
  });
  if (!existing) return { ok: false as const, error: "Opção não encontrada." };

  const parsed = ShippingInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Dados inválidos." };

  // Se mudou pra default, desmarca os outros
  if (parsed.data.isDefault) {
    await prisma.shippingOption.updateMany({
      where: { checkoutId: existing.checkoutId, id: { not: optId } },
      data: { isDefault: false },
    });
  }

  await prisma.shippingOption.update({
    where: { id: optId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      priceCents: parsed.data.priceCents,
      estimatedTime: parsed.data.estimatedTime ?? null,
      isDefault: parsed.data.isDefault ?? false,
      ...(typeof input.active === "boolean" ? { active: input.active } : {}),
    },
  });
  revalidatePath(`/dashboard/checkout-builder/${existing.checkoutId}`);
  return { ok: true as const };
}

export async function deleteShippingOption(optId: string) {
  const userId = await requireUserId();
  const existing = await prisma.shippingOption.findFirst({
    where: { id: optId, checkout: { userId } },
    select: { id: true, checkoutId: true },
  });
  if (!existing) return { ok: false as const, error: "Opção não encontrada." };
  await prisma.shippingOption.delete({ where: { id: optId } });
  revalidatePath(`/dashboard/checkout-builder/${existing.checkoutId}`);
  return { ok: true as const };
}
