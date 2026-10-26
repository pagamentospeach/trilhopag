"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { checkOnAction } from "@/lib/achievements";
import {
  generateWebhookSecret,
  redeliverWebhook,
  sendTestWebhook,
} from "@/lib/webhooks";
import { WEBHOOK_EVENT_KEYS } from "@/lib/webhook-events";

// 08/08/2026: era uma cópia à mão que faltavam 3 eventos reais e sobrava 1 que
// não existe. Agora vem do catálogo (lib/webhook-events.ts). Nota sobre
// legado: eventos salvos que não estão mais no catálogo (o
// `transaction.failed`, que nunca foi disparado) simplesmente não sobrevivem
// ao próximo save — a leitura abaixo parte do catálogo, não do que veio no
// formulário, então não há erro de validação pra quem editar um webhook
// antigo.
const ALLOWED_EVENTS = WEBHOOK_EVENT_KEYS;

const WebhookInput = z.object({
  url: z.string().url("URL inválida"),
  events: z.array(z.string()).optional(),
  active: z.coerce.boolean().optional(),
});

export async function createWebhook(formData: FormData) {
  const userId = await requireUserId();
  const events = ALLOWED_EVENTS.filter((e) => formData.get(`event_${e}`) === "on");
  const parsed = WebhookInput.safeParse({
    url: formData.get("url"),
    events,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const secret = generateWebhookSecret();
  await prisma.webhook.create({
    data: {
      userId,
      url: parsed.data.url,
      events: parsed.data.events ?? [],
      secret,
      active: parsed.data.active ?? true,
    },
  });

  await checkOnAction(userId, "integration_configured");
  revalidatePath("/dashboard/integracoes/webhooks");
  redirect("/dashboard/integracoes/webhooks");
}

export async function updateWebhook(id: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.webhook.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "Webhook não encontrado." };

  const events = ALLOWED_EVENTS.filter((e) => formData.get(`event_${e}`) === "on");
  const parsed = WebhookInput.safeParse({
    url: formData.get("url"),
    events,
    active: formData.get("active") === "on",
  });
  if (!parsed.success)
    return {
      ok: false as const,
      error: "Validação falhou.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };

  await prisma.webhook.update({
    where: { id },
    data: {
      url: parsed.data.url,
      events: parsed.data.events ?? [],
      active: parsed.data.active ?? true,
    },
  });

  revalidatePath("/dashboard/integracoes/webhooks");
  redirect("/dashboard/integracoes/webhooks");
}

export async function deleteWebhook(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.webhook.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "Webhook não encontrado." };
  await prisma.webhook.delete({ where: { id } });
  revalidatePath("/dashboard/integracoes/webhooks");
  return { ok: true as const };
}


/**
 * Disparar um evento de teste para o endpoint (seção 13).
 *
 * ⚠️ A checagem de dono é o que segura tudo aqui. `sendTestWebhook` faz um
 * POST pra uma URL que o SELLER cadastrou — sem confirmar que o webhook é
 * dele, qualquer conta logada mandaria requisição assinada pro endpoint de
 * outra. O `safeFetch` lá dentro já bloqueia IP interno (SSRF), mas não sabe
 * de quem é o webhook; quem sabe é este `where`.
 */
export async function testWebhook(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId();
  const w = await prisma.webhook.findFirst({
    where: { id, userId },
    select: { id: true, active: true },
  });
  if (!w) return { ok: false, error: "Webhook não encontrado." };
  if (!w.active) {
    return {
      ok: false,
      error: "Este webhook está desativado. Ative antes de testar.",
    };
  }

  await sendTestWebhook(w.id);
  revalidatePath(`/dashboard/integracoes/webhooks/${id}`);
  return { ok: true };
}

/** Reenviar uma entrega específica. Mesma checagem de dono, via relação. */
export async function resendDelivery(
  deliveryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId();
  const d = await prisma.webhookDelivery.findFirst({
    // O `userId` viaja pela relação: garante que a entrega pertence a um
    // webhook DESTE seller, sem precisar do id do webhook na chamada.
    where: { id: deliveryId, webhook: { userId } },
    select: { id: true, webhookId: true },
  });
  if (!d) return { ok: false, error: "Entrega não encontrada." };

  const r = await redeliverWebhook(d.id);
  revalidatePath(`/dashboard/integracoes/webhooks/${d.webhookId}`);
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.status === null
          ? "Não foi possível alcançar o endpoint. Confira a URL."
          : `O endpoint respondeu ${r.status}.`,
    };
  }
  return { ok: true };
}
