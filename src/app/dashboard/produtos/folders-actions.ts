"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

const NameSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().optional(),
});

export async function createFolder(input: z.infer<typeof NameSchema>) {
  const userId = await requireUserId();
  const parsed = NameSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Nome inválido" };
  const maxOrder = await prisma.productFolder.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  const f = await prisma.productFolder.create({
    data: {
      userId,
      name: parsed.data.name,
      color: parsed.data.color ?? "#06b6d4",
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath("/dashboard/produtos");
  return { ok: true as const, id: f.id };
}

export async function renameFolder(id: string, name: string) {
  const userId = await requireUserId();
  if (!name.trim()) return { ok: false as const, error: "Nome inválido" };
  const f = await prisma.productFolder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!f) return { ok: false as const, error: "Pasta não encontrada" };
  await prisma.productFolder.update({ where: { id }, data: { name: name.trim() } });
  revalidatePath("/dashboard/produtos");
  return { ok: true as const };
}

export async function deleteFolder(id: string) {
  const userId = await requireUserId();
  const f = await prisma.productFolder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!f) return { ok: false as const, error: "Pasta não encontrada" };
  // Tira folderId de todos os produtos antes de deletar
  await prisma.product.updateMany({
    where: { folderId: id },
    data: { folderId: null },
  });
  await prisma.productFolder.delete({ where: { id } });
  revalidatePath("/dashboard/produtos");
  return { ok: true as const };
}

export async function moveProductToFolder(productId: string, folderId: string | null) {
  const userId = await requireUserId();
  const p = await prisma.product.findFirst({
    where: { id: productId, userId },
    select: { id: true },
  });
  if (!p) return { ok: false as const, error: "Produto não encontrado" };
  if (folderId) {
    const f = await prisma.productFolder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    });
    if (!f) return { ok: false as const, error: "Pasta não encontrada" };
  }
  await prisma.product.update({
    where: { id: productId },
    data: { folderId },
  });
  revalidatePath("/dashboard/produtos");
  return { ok: true as const };
}

export async function reorderProducts(productIds: string[]) {
  const userId = await requireUserId();
  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, userId },
    select: { id: true },
  });
  if (owned.length !== productIds.length) {
    return { ok: false as const, error: "Lista inválida" };
  }
  await prisma.$transaction(
    productIds.map((id, sortOrder) =>
      prisma.product.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  revalidatePath("/dashboard/produtos");
  return { ok: true as const };
}
