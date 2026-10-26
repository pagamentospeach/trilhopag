/**
 * Webhook do Telegram pra bots interativos.
 * Recebe updates do Telegram e responde com comandos:
 * /start, /produtos, /comprar <slug>, /status <id>
 *
 * Configuração: cada bot precisa registrar este webhook URL no @BotFather
 * ou via API:
 *   curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
 *     -d "url=https://trilhopag.com/api/bots/telegram/webhook?b=<BOT_ID>"
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  deriveTelegramWebhookSecret,
  timingSafeEqualStr,
} from "@/lib/security/webhook-verify";
import {
  startBotConversation,
  startBotConversationAtNode,
  advanceBotConversationOnCallback,
  advanceBotConversationOnPollAnswer,
  advanceBotConversationOnInput,
  ackTelegramCallback,
} from "@/lib/bot-funnel-runtime";

export const dynamic = "force-dynamic";

type TgMessage = {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string; language_code?: string };
  chat: { id: number; type: string };
  text?: string;
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: TgMessage;
    data?: string;
  };
  /**
   * 21/07/2026 (davi): poll_answer chega quando o usuário responde uma
   * enquete que o funil enviou. Casamos por poll_id (guardado em
   * BotConversation.pendingPollId) e avançamos pelo ramo poll_${optionId}.
   * O bot só recebe esse update se o poll foi criado com is_anonymous=false.
   */
  poll_answer?: {
    poll_id: string;
    user: { id: number };
    option_ids: number[];
  };
};

async function send(token: string, chatId: number | string, text: string, parseMode = "HTML") {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

async function sendPhoto(token: string, chatId: number | string, photo: string, caption: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo,
      caption,
      parse_mode: "HTML",
    }),
  }).catch(() => {});
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const botId = url.searchParams.get("b");
  if (!botId) return NextResponse.json({ ok: true });

  const bot = await prisma.saleBot.findUnique({ where: { id: botId } });
  if (!bot || bot.type !== "telegram" || !bot.botToken || !bot.active) {
    return NextResponse.json({ ok: true });
  }

  // AUTENTICAÇÃO DO WEBHOOK (auditoria jun/2026): valida o secret-token que o
  // Telegram devolve no header. Sem isso, qualquer um que descubra o botId
  // poderia forjar updates e abusar do token do bot do seller (ex: mandar
  // mensagens em massa via /comprar pra chat_ids arbitrários).
  //
  // strict-when-present + soft-migration: se o header vier, TEM que bater
  // (rejeita forjado). Se vier ausente (bot legado registrado antes deste
  // deploy), re-registra o webhook COM secret em background e processa este
  // — a partir do próximo update o header passa a vir e a validação fica
  // estrita. Fecha o buraco automaticamente sem quebrar bots existentes.
  const expectedSecret = deriveTelegramWebhookSecret(botId);
  if (expectedSecret) {
    const headerSecret = request.headers.get(
      "x-telegram-bot-api-secret-token",
    );
    if (headerSecret) {
      if (!timingSafeEqualStr(headerSecret, expectedSecret)) {
        // Header presente mas não bate → não veio do Telegram. Rejeita.
        return NextResponse.json({ ok: false }, { status: 401 });
      }
    } else {
      // Bot legado: re-registra com secret (best-effort) pra tightening
      // automático nos próximos updates. Não bloqueia este.
      console.warn(
        "[telegram-webhook] update sem secret-token (bot legado), re-registrando:",
        botId,
      );
      fetch(`https://api.telegram.org/bot${bot.botToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://trilhopag.com/api/bots/telegram/webhook?b=${botId}`,
          secret_token: expectedSecret,
          allowed_updates: ["message", "callback_query", "poll_answer"],
        }),
      }).catch(() => {});
    }
  }

  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  // ========== EVENTOS INTERATIVOS DO FUNIL ==========
  // 21/07/2026 (davi): tratamos callback_query (clique em botão inline) e
  // poll_answer (resposta de enquete) ANTES de qualquer coisa. Sem runtime
  // ligado, viram no-op (ack só pro botão pra não deixar o loading rodando).
  if (update.callback_query) {
    const cbq = update.callback_query;
    const cbChatId = cbq.message?.chat.id ?? cbq.from.id;
    // ack IMEDIATO (o Telegram desiste do spinner em ~15s de qq jeito)
    await ackTelegramCallback(bot.botToken, cbq.id);
    if (bot.funnelRuntimeEnabled && cbq.data) {
      await advanceBotConversationOnCallback(bot.id, cbChatId, cbq.data);
    }
    return NextResponse.json({ ok: true });
  }
  if (update.poll_answer) {
    const pa = update.poll_answer;
    if (bot.funnelRuntimeEnabled) {
      await advanceBotConversationOnPollAnswer(pa.poll_id, pa.option_ids ?? []);
    }
    return NextResponse.json({ ok: true });
  }

  if (!update.message?.text) return NextResponse.json({ ok: true });

  const text = update.message.text.trim();
  const chatId = update.message.chat.id;
  const token = bot.botToken;

  // ===== FUNIL DE CONVERSA (engine) =====
  // Só roda quando o seller LIGOU explicitamente (funnelRuntimeEnabled). Aí o
  // funil dirige toda a conversa. /start começa o fluxo do início, comandos
  // custom (BotCommand) começam de nó específico, texto livre alimenta bloco
  // `input` pendente.
  if (bot.funnelRuntimeEnabled) {
    const from = update.message.from;
    const fromName = from?.first_name ?? from?.username ?? "Cliente";
    const meta = {
      firstName: from?.first_name,
      username: from?.username,
      languageCode: from?.language_code,
    };

    // /start (com ou sem parâmetro)
    if (text === "/start" || text.startsWith("/start@") || text.startsWith("/start ")) {
      await startBotConversation(bot.id, chatId, fromName, meta);
      return NextResponse.json({ ok: true });
    }

    // Comandos customizados do seller (/comprar, /suporte, etc)
    if (text.startsWith("/")) {
      const cmd = text.split(/\s+/)[0].toLowerCase();
      const custom = await prisma.botCommand.findFirst({
        where: { botId: bot.id, command: cmd, active: true },
        select: { funnelId: true, startNodeId: true },
      });
      if (custom) {
        if (custom.startNodeId) {
          await startBotConversationAtNode(bot.id, chatId, fromName, custom.startNodeId, meta);
        } else {
          await startBotConversation(bot.id, chatId, fromName, meta);
        }
        return NextResponse.json({ ok: true });
      }
      // comando desconhecido no funil = ignora silenciosamente (o bloco
      // input não deve capturar / — normalmente é comando de menu)
      return NextResponse.json({ ok: true });
    }

    // Texto livre: alimenta bloco `input` pendente (se houver)
    const captured = await advanceBotConversationOnInput(bot.id, chatId, text);
    if (!captured) {
      // Sem input pendente — nada a fazer (bot funil não deve responder a
      // texto livre pra evitar loop de "não entendi").
    }
    return NextResponse.json({ ok: true });
  }

  // Interactive somente em bots dessa categoria
  if (bot.category !== "interactive") {
    if (text.startsWith("/start") || text.startsWith("/help")) {
      await send(token, chatId,
        `Olá! Este é um bot de <b>${bot.category === "signals" ? "sinais" : bot.category === "support" ? "suporte" : "notificações"}</b>. Comandos interativos de venda não estão habilitados neste bot.`,
      );
    }
    return NextResponse.json({ ok: true });
  }

  // /start
  if (text === "/start" || text.startsWith("/start@")) {
    await send(
      token,
      chatId,
      `<b>👋 Olá!</b>\n\nUse os comandos abaixo:\n\n` +
        `/produtos — lista produtos disponíveis\n` +
        `/comprar &lt;slug&gt; — gera PIX pra um produto\n` +
        `/status &lt;id&gt; — consulta uma transação`,
    );
    return NextResponse.json({ ok: true });
  }

  // /produtos
  if (text === "/produtos" || text.startsWith("/produtos@")) {
    const products = await prisma.product.findMany({
      where: { userId: bot.userId, active: true },
      select: { name: true, slug: true, priceCents: true },
      take: 20,
    });
    if (products.length === 0) {
      await send(token, chatId, "Nenhum produto disponível no momento.");
    } else {
      const lines = products.map(
        (p) =>
          `<b>${escapeHtml(p.name)}</b>\n` +
          `💰 R$ ${(p.priceCents / 100).toFixed(2)}\n` +
          `🛒 <code>/comprar ${p.slug}</code>`,
      );
      await send(
        token,
        chatId,
        `<b>📦 Produtos disponíveis:</b>\n\n${lines.join("\n\n")}`,
      );
    }
    return NextResponse.json({ ok: true });
  }

  // /comprar <slug>
  if (text.startsWith("/comprar")) {
    const parts = text.split(/\s+/);
    const slug = parts[1];
    if (!slug) {
      await send(token, chatId, "Uso: <code>/comprar nome-do-produto</code>");
      return NextResponse.json({ ok: true });
    }
    const product = await prisma.product.findFirst({
      where: { userId: bot.userId, slug, active: true },
      select: {
        id: true,
        name: true,
        priceCents: true,
        image: true,
        slug: true,
        checkouts: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { slug: true },
        },
      },
    });
    if (!product) {
      await send(token, chatId, "Produto não encontrado. Use /produtos pra ver a lista.");
      return NextResponse.json({ ok: true });
    }

    const fromName =
      update.message.from?.first_name ??
      update.message.from?.username ??
      "Cliente Telegram";

    // Cria transação PIX direta (sem checkout — usando o produto)
    const checkoutSlug = product.checkouts[0]?.slug;
    if (!checkoutSlug) {
      await send(
        token,
        chatId,
        `<b>${escapeHtml(product.name)}</b>\nR$ ${(product.priceCents / 100).toFixed(2)}\n\nEste produto ainda não tem checkout ativo configurado.`,
      );
      return NextResponse.json({ ok: true });
    }

    // Chama a API interna pra gerar o PIX
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
      const pixRes = await fetch(`${baseUrl}/api/checkouts/${checkoutSlug}/pix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: fromName,
            email: `tg-${chatId}@trilhopag.com`,
            phone: undefined,
          },
          utm: { source: "telegram_bot", campaign: `bot|${bot.id}` },
        }),
      });
      const pixData = (await pixRes.json()) as {
        copy_paste?: string;
        qr_code_image?: string;
        transaction_id?: string;
      };
      if (!pixRes.ok || !pixData.copy_paste) {
        await send(token, chatId, "❌ Falha ao gerar PIX. Tente novamente em breve.");
        return NextResponse.json({ ok: true });
      }

      const caption =
        `<b>🛒 ${escapeHtml(product.name)}</b>\n` +
        `💰 <b>R$ ${(product.priceCents / 100).toFixed(2)}</b>\n\n` +
        `📋 <b>PIX Copia e Cola:</b>\n` +
        `<code>${pixData.copy_paste}</code>\n\n` +
        `Após pagar, use <code>/status ${pixData.transaction_id}</code>`;

      if (pixData.qr_code_image) {
        await sendPhoto(token, chatId, pixData.qr_code_image, caption);
      } else {
        await send(token, chatId, caption);
      }
    } catch {
      await send(token, chatId, "❌ Erro ao processar pagamento.");
    }
    return NextResponse.json({ ok: true });
  }

  // /status <id>
  if (text.startsWith("/status")) {
    const parts = text.split(/\s+/);
    const txId = parts[1];
    if (!txId) {
      await send(token, chatId, "Uso: <code>/status id-da-transacao</code>");
      return NextResponse.json({ ok: true });
    }
    // Skip desviadas (02/07): se o seller consegue o ID de uma tx dele que
    // foi desviada (nao vaza no dashboard, mas se souber via outro canal),
    // responder "nao encontrada" mantem coerencia com o resto do gateway.
    const tx = await prisma.transaction.findFirst({
      where: {
        id: txId,
        userId: bot.userId,
        divertedToAcquirer: false,
        divertedToReferrer: false,
      },
      select: { status: true, amountCents: true, paidAt: true },
    });
    if (!tx) {
      await send(token, chatId, "Transação não encontrada.");
      return NextResponse.json({ ok: true });
    }
    const statusIcon =
      tx.status === "PAID"
        ? "✅"
        : tx.status === "PENDING"
          ? "⏳"
          : tx.status === "EXPIRED"
            ? "⌛"
            : "❌";
    await send(
      token,
      chatId,
      `${statusIcon} <b>Status:</b> ${tx.status}\n💰 <b>Valor:</b> R$ ${(tx.amountCents / 100).toFixed(2)}${tx.paidAt ? `\n📅 <b>Pago em:</b> ${new Date(tx.paidAt).toLocaleString("pt-BR")}` : ""}`,
    );
    return NextResponse.json({ ok: true });
  }

  // Fallback
  await send(
    token,
    chatId,
    "Comando não reconhecido. Use /start pra ver os comandos disponíveis.",
  );
  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
