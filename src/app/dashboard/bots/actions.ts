"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { setTelegramWebhook } from "@/lib/bot-health";

/**
 * 21/07/2026 (davi): removida a feature de "bot notificador de venda" (template
 * de mensagem, parseMode, imageUrl, gatilhos de venda paga/pendente/refund/
 * chargeback). Motivo (dados do banco): 0.7% de cobertura em 5000+ vendas,
 * 66% de failure rate no Telegram, 0/16 do Discord jamais funcionou.
 * Redundante com /dashboard/vendas + push web nativo. Aqui sobra apenas o
 * bot INTERATIVO do Telegram — o que roda o funil de conversa (opt-in via
 * `funnelRuntimeEnabled`).
 *
 * Colunas do banco (messageTemplate/parseMode/embedColor/imageUrl/
 * thumbnailUrl/triggerSale*) ficam por retrocompat — só não são mais setadas
 * nem lidas pela UI/runtime.
 */

export async function createSaleBot(input: {
  type: "discord" | "telegram";
  category?: string;
  name: string;
}) {
  const userId = await requireUserId();
  if (!input.name?.trim()) return { ok: false as const, error: "Nome inválido" };
  if (input.type !== "discord" && input.type !== "telegram") {
    return { ok: false as const, error: "Tipo inválido" };
  }
  // Categoria default "interactive": novo bot já nasce pronto pro funil de
  // conversa (única modalidade suportada hoje).
  const category = input.category ?? "interactive";

  const b = await prisma.saleBot.create({
    data: {
      userId,
      type: input.type,
      category,
      name: input.name.trim(),
      // messageTemplate era NOT NULL no schema — precisa passar algo. String
      // vazia é aceita e nunca é lida.
      messageTemplate: "",
    },
  });
  revalidatePath("/dashboard/bots");
  return { ok: true as const, id: b.id };
}

/** Registra o webhook do Telegram pra bot interativo */
export async function registerTelegramWebhook(botId: string) {
  const userId = await requireUserId();
  const bot = await prisma.saleBot.findFirst({
    where: { id: botId, userId },
  });
  if (!bot) return { ok: false as const, error: "Bot não encontrado" };
  if (bot.type !== "telegram" || !bot.botToken) {
    return { ok: false as const, error: "Token do Telegram faltando — preencha antes de registrar" };
  }
  // 30/07/2026: o payload do setWebhook (URL + secret_token + allowed_updates)
  // agora mora em src/lib/bot-health.ts, junto do monitor 24/7 que confere se
  // o webhook continua de pé. Antes a string da URL era montada aqui E lá —
  // e bastava divergirem pra o monitor achar que TODO webhook está errado e
  // ficar re-registrando em loop.
  const r = await setTelegramWebhook(bot.botToken, botId);
  if (!r.ok) {
    return { ok: false as const, error: r.error ?? "Falha ao registrar webhook" };
  }
  return { ok: true as const };
}

const UpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  botToken: z.string().nullable().optional(),
  chatId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  // Liga/desliga a EXECUCAO do funil do bot (default false — bot fica inerte
  // até o seller ligar). Antes so podia mexer no board do funil.
  funnelRuntimeEnabled: z.boolean().optional(),
});

export async function updateSaleBot(input: z.infer<typeof UpdateSchema>) {
  const userId = await requireUserId();
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const { id, ...data } = parsed.data;
  const owned = await prisma.saleBot.findFirst({
    where: { id, userId },
    select: { id: true, type: true, botToken: true },
  });
  if (!owned) return { ok: false as const, error: "Bot não encontrado" };
  await prisma.saleBot.update({ where: { id }, data });
  revalidatePath("/dashboard/bots");
  revalidatePath(`/dashboard/bots/${id}`);

  // AUTO-REGISTRO DO WEBHOOK (05/07/2026): quando o seller salva o token do
  // Telegram (ou troca), a gente precisa avisar o Telegram pra que ele mande
  // os updates (/start, /comprar, callback do funil) pra nossa URL. Antes
  // isso era manual e nunca era feito na pratica — nenhuma UI chamava
  // registerTelegramWebhook. Resultado: cliente mandava /start e nada
  // acontecia. Agora eh transparente: mudou token → registra imediatamente.
  // Retorna warning se falhar, mas nao bloqueia o save (seller pode retentar
  // no botao manual).
  let webhookWarning: string | null = null;
  const newToken = data.botToken !== undefined ? data.botToken : owned.botToken;
  const tokenChanged =
    owned.type === "telegram" &&
    !!newToken &&
    newToken !== owned.botToken;
  if (tokenChanged) {
    const r = await registerTelegramWebhook(id);
    if (!r.ok) {
      webhookWarning = `Bot salvo, mas o webhook do Telegram não foi registrado: ${r.error}. Clique em "Registrar webhook" pra tentar de novo.`;
    }
  }
  return { ok: true as const, webhookWarning };
}

export async function deleteSaleBot(id: string) {
  const userId = await requireUserId();
  const owned = await prisma.saleBot.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) return { ok: false as const, error: "Bot não encontrado" };
  await prisma.saleBot.delete({ where: { id } });
  revalidatePath("/dashboard/bots");
  return { ok: true as const };
}
