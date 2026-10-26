"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const Input = z.object({
  code: z.string().trim().toUpperCase().min(3).max(40),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().int().positive(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  active: z.coerce.boolean().optional(),
  productIds: z.array(z.string()).optional(),
});

export async function createCoupon(formData: FormData) {
  const userId = await requireUserId();
  const productIds = formData.getAll("productIds").map((v) => String(v));
  const parsed = Input.safeParse({
    code: formData.get("code"),
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue") || 0,
    maxUses: formData.get("maxUses") || null,
    expiresAt: formData.get("expiresAt") || null,
    active: formData.get("active") === "on",
    productIds,
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos." };
  }
  if (parsed.data.discountType === "percent" && parsed.data.discountValue > 100) {
    return { ok: false as const, error: "Desconto em % não pode passar de 100." };
  }
  const existing = await prisma.coupon.findUnique({
    where: { userId_code: { userId, code: parsed.data.code } },
  });
  if (existing) {
    return { ok: false as const, error: "Já existe um cupom com esse código." };
  }
  await prisma.coupon.create({
    data: {
      userId,
      code: parsed.data.code,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      maxUses: parsed.data.maxUses ?? null,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      active: parsed.data.active ?? true,
      productIds: parsed.data.productIds ?? [],
    },
  });
  revalidatePath("/dashboard/cupons");
  redirect("/dashboard/cupons");
}

export async function deleteCoupon(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.coupon.findFirst({ where: { id, userId } });
  if (!existing) return { ok: false as const, error: "Não encontrado." };
  await prisma.coupon.delete({ where: { id } });
  revalidatePath("/dashboard/cupons");
  return { ok: true as const };
}

export async function toggleCoupon(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.coupon.findFirst({ where: { id, userId } });
  if (!existing) return { ok: false as const, error: "Não encontrado." };
  await prisma.coupon.update({
    where: { id },
    data: { active: !existing.active },
  });
  revalidatePath("/dashboard/cupons");
  return { ok: true as const };
}
