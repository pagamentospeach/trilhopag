"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

/** Seller dispensa um aviso do admin (marca o PRÓPRIO aviso como inativo). */
export async function dismissMyWarning(warningId: string) {
  const userId = await requireUserId();
  await prisma.sellerWarning.updateMany({
    where: { id: warningId, userId, active: true },
    data: { active: false },
  });
  revalidatePath("/dashboard");
  return { ok: true as const };
}
