"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * Marcar notificação como lida.
 *
 * O `userId` no where não é formalidade: sem ele, um id colado na chamada
 * marcaria como lida a notificação de outro seller. Não vaza conteúdo (a
 * action não devolve nada), mas deixaria o sino do outro mentindo sobre o que
 * ele já viu.
 */
export async function marcarLida(id: string) {
  const userId = await requireUserId();
  await prisma.sellerNotification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** Marcar todas como lidas. */
export async function marcarTodasLidas() {
  const userId = await requireUserId();
  await prisma.sellerNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard");
  return { ok: true as const };
}
