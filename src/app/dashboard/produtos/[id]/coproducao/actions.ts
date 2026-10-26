"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const Input = z.object({
  email: z.string().email(),
  name: z.string().trim().max(60).optional().nullable(),
  splitPercent: z.coerce.number().min(0.01).max(100),
});

export async function addCoproducer(productId: string, formData: FormData) {
  const userId = await requireUserId();
  const product = await prisma.product.findFirst({
    where: { id: productId, userId },
    select: { id: true },
  });
  if (!product) return { ok: false as const, error: "Produto não encontrado." };

  const parsed = Input.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || null,
    splitPercent: formData.get("splitPercent") || 0,
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Dados inválidos." };
  }

  // Total split cannot exceed 100%
  const existing = await prisma.coproducer.findMany({
    where: { productId, active: true },
  });
  const sum = existing.reduce((s, c) => s + c.splitPercent, 0);
  if (sum + parsed.data.splitPercent > 100) {
    return {
      ok: false as const,
      error: `Soma dos splits ultrapassa 100% (atual: ${sum}%, tentando adicionar: ${parsed.data.splitPercent}%).`,
    };
  }

  await prisma.coproducer.create({
    data: {
      productId,
      email: parsed.data.email,
      name: parsed.data.name || null,
      splitPercent: parsed.data.splitPercent,
    },
  });
  revalidatePath(`/dashboard/produtos/${productId}/coproducao`);
  return { ok: true as const };
}

export async function removeCoproducer(coproducerId: string) {
  const userId = await requireUserId();
  const c = await prisma.coproducer.findFirst({
    where: { id: coproducerId, product: { userId } },
    select: { id: true, productId: true },
  });
  if (!c) return { ok: false as const, error: "Não encontrado." };
  await prisma.coproducer.delete({ where: { id: coproducerId } });
  revalidatePath(`/dashboard/produtos/${c.productId}/coproducao`);
  return { ok: true as const };
}
