"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

/**
 * Salva o template da mensagem do botão de WhatsApp da aba de Vendas.
 * Placeholders suportados: {nome} {produto} {valor} {status}.
 * Vazio → volta pro template padrão (null).
 */
export async function saveWhatsappQuickTemplate(
  template: string,
): Promise<{ ok: true; template: string | null }> {
  const userId = await requireUserId();
  const clean = template.trim().slice(0, 1000);
  const value = clean.length > 0 ? clean : null;
  await prisma.user.update({
    where: { id: userId },
    data: { whatsappQuickTemplate: value },
  });
  revalidatePath("/dashboard/financeiro");
  return { ok: true, template: value };
}
