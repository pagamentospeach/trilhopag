"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * 22/07/2026 (davi fase 3): mapeia comandos customizados do bot Telegram
 * (/comprar, /suporte, /cupom, etc). Cada comando abre o funil ativo a
 * partir de um nó específico OU do início (findStart).
 */

const CommandSchema = z.object({
  botId: z.string().min(1),
  command: z
    .string()
    .min(2)
    .max(32)
    .regex(/^\/[a-z0-9_]+$/i, "Formato: /alguma_coisa (só letras/números/underscore)"),
  startNodeId: z.string().nullable().optional(),
});

export async function createBotCommand(input: z.infer<typeof CommandSchema>) {
  const userId = await requireUserId();
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "inválido";
    return { ok: false as const, error: first };
  }
  const cmd = parsed.data.command.toLowerCase();
  if (cmd === "/start") {
    return { ok: false as const, error: "/start é reservado (sempre inicia o funil)" };
  }
  const bot = await prisma.saleBot.findFirst({
    where: { id: parsed.data.botId, userId, type: "telegram" },
    select: { id: true },
  });
  if (!bot) return { ok: false as const, error: "Bot não encontrado" };

  try {
    const c = await prisma.botCommand.create({
      data: {
        botId: bot.id,
        command: cmd,
        startNodeId: parsed.data.startNodeId ?? null,
        active: true,
      },
      select: { id: true },
    });
    revalidatePath(`/dashboard/bots/${bot.id}/comandos`);
    return { ok: true as const, id: c.id };
  } catch {
    return { ok: false as const, error: `Comando ${cmd} já existe pra esse bot` };
  }
}

export async function updateBotCommand(input: {
  id: string;
  command?: string;
  startNodeId?: string | null;
  active?: boolean;
}) {
  const userId = await requireUserId();
  // Manual join (BotCommand.bot não tem relation Prisma definida)
  const c = await prisma.botCommand.findUnique({
    where: { id: input.id },
    select: { id: true, botId: true },
  });
  if (!c) return { ok: false as const, error: "Não encontrado" };
  const b = await prisma.saleBot.findFirst({
    where: { id: c.botId, userId },
    select: { id: true },
  });
  if (!b) return { ok: false as const, error: "Sem permissão" };
  const data: Record<string, unknown> = {};
  if (input.command !== undefined) {
    const cmd = input.command.toLowerCase();
    if (!/^\/[a-z0-9_]{1,31}$/.test(cmd)) {
      return { ok: false as const, error: "Formato inválido" };
    }
    if (cmd === "/start") {
      return { ok: false as const, error: "/start é reservado" };
    }
    data.command = cmd;
  }
  if (input.startNodeId !== undefined) data.startNodeId = input.startNodeId;
  if (input.active !== undefined) data.active = input.active;

  const updated = await prisma.botCommand.update({ where: { id: input.id }, data, select: { botId: true } });
  revalidatePath(`/dashboard/bots/${updated.botId}/comandos`);
  return { ok: true as const };
}

export async function deleteBotCommand(id: string) {
  const userId = await requireUserId();
  const c = await prisma.botCommand.findUnique({
    where: { id },
    select: { id: true, botId: true },
  });
  if (!c) return { ok: false as const, error: "Não encontrado" };
  const b = await prisma.saleBot.findFirst({
    where: { id: c.botId, userId },
    select: { id: true },
  });
  if (!b) return { ok: false as const, error: "Sem permissão" };
  await prisma.botCommand.delete({ where: { id } });
  revalidatePath(`/dashboard/bots/${c.botId}/comandos`);
  return { ok: true as const };
}
