"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { sendTestMessage } from "@/lib/sales-channel";
import { OPS_MODES } from "@/lib/ops-modes";

const PATH = "/dashboard/integracoes/canal-vendas";
const MAX_CHANNELS = 10;

const schema = z.object({
  name: z.string().trim().min(1, "Dê um nome pro canal.").max(60),
  // Token do @BotFather: "<id numérico>:<35 chars>"
  botToken: z
    .string()
    .trim()
    .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, "Token do bot inválido. Copie do @BotFather."),
  // -100... (canal/supergrupo) ou @nomedocanal
  chatId: z
    .string()
    .trim()
    .regex(/^(-?\d{5,}|@[A-Za-z][A-Za-z0-9_]{4,})$/, "chat_id inválido. Use -100... ou @nomedocanal."),
  modes: z.array(z.enum(OPS_MODES)).default([]),
  showCustomer: z.boolean().default(true),
  showTotals: z.boolean().default(true),
});

export type ChannelInput = z.input<typeof schema>;

export async function createSalesChannel(input: ChannelInput) {
  const userId = await requireUserId();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const count = await prisma.salesChannel.count({ where: { userId } });
  if (count >= MAX_CHANNELS) {
    return { ok: false as const, error: `Limite de ${MAX_CHANNELS} canais atingido.` };
  }
  // Valida ANTES de salvar: sem isso o seller cria o canal, acha que está
  // funcionando e só descobre que o bot não é admin quando perde uma venda.
  const test = await sendTestMessage(parsed.data.botToken, parsed.data.chatId);
  if (!test.ok) {
    return {
      ok: false as const,
      error: `Telegram recusou: ${test.error}. Confirme que o bot é ADMIN do canal.`,
    };
  }
  await prisma.salesChannel.create({ data: { userId, ...parsed.data } });
  revalidatePath(PATH);
  return { ok: true as const };
}

export async function updateSalesChannel(id: string, input: ChannelInput) {
  const userId = await requireUserId();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  // updateMany com userId no where = não dá pra editar canal de outro seller.
  const r = await prisma.salesChannel.updateMany({
    where: { id, userId },
    data: parsed.data,
  });
  if (r.count === 0) return { ok: false as const, error: "Canal não encontrado." };
  revalidatePath(PATH);
  return { ok: true as const };
}

export async function toggleSalesChannel(id: string, active: boolean) {
  const userId = await requireUserId();
  const r = await prisma.salesChannel.updateMany({
    where: { id, userId },
    data: { active },
  });
  if (r.count === 0) return { ok: false as const, error: "Canal não encontrado." };
  revalidatePath(PATH);
  return { ok: true as const };
}

export async function deleteSalesChannel(id: string) {
  const userId = await requireUserId();
  const r = await prisma.salesChannel.deleteMany({ where: { id, userId } });
  if (r.count === 0) return { ok: false as const, error: "Canal não encontrado." };
  revalidatePath(PATH);
  return { ok: true as const };
}

export async function testSalesChannel(id: string) {
  const userId = await requireUserId();
  const ch = await prisma.salesChannel.findFirst({
    where: { id, userId },
    select: { botToken: true, chatId: true },
  });
  if (!ch) return { ok: false as const, error: "Canal não encontrado." };
  const r = await sendTestMessage(ch.botToken, ch.chatId);
  await prisma.salesChannel
    .update({
      where: { id },
      data: r.ok
        ? { lastSentAt: new Date(), lastError: null }
        : { lastError: r.error.slice(0, 300) },
    })
    .catch(() => {});
  revalidatePath(PATH);
  return r.ok
    ? { ok: true as const }
    : { ok: false as const, error: `Telegram recusou: ${r.error}` };
}
