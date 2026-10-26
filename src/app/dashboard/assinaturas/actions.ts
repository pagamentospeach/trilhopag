"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * Cancelar assinatura pelo painel.
 *
 * Espelha exatamente o que /api/v1/subscriptions/[id]/cancel já fazia — mesmo
 * where com `userId`, mesma idempotência, mesmos campos. A única diferença é o
 * `cancelReason`, que aqui grava "dashboard" pra dar pra distinguir depois
 * quem cancelou pela API e quem cancelou no painel.
 *
 * NÃO existe "pausar". O prompt de revamp pede "pausar quando permitido", e o
 * model Subscription só tem active | past_due | canceled | completed. Criar um
 * estado "paused" mudaria o cron de recorrência (ele varre por
 * `status:"active"` e `nextBillingAt<=now`), então é backend novo, não botão.
 * O próprio prompt manda: "Não criar essa lógica se o backend não suportar".
 */
export async function cancelSubscription(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();

  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    return { ok: false, error: "Assinatura inválida." };
  }

  // `userId` no where: sem isso um seller cancelaria a assinatura de outro
  // mandando um id qualquer pra server action.
  const s = await prisma.subscription.findFirst({
    where: { id, userId },
    select: { id: true, status: true },
  });
  if (!s) return { ok: false, error: "Assinatura não encontrada." };

  // Idempotente, igual à API: cancelar o que já acabou não é erro.
  if (s.status === "canceled" || s.status === "completed") {
    return { ok: true };
  }

  await prisma.subscription.update({
    where: { id: s.id },
    data: {
      status: "canceled",
      canceledAt: new Date(),
      cancelReason: "dashboard",
    },
  });

  revalidatePath("/dashboard/assinaturas");
  return { ok: true };
}
