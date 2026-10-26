/**
 * Canal de vendas no Telegram — 01/08/2026 (davi).
 *
 * "teria como adicionar uma função pra adicionar um canal que nesse canal iria
 * mostrar quando saísse vendas? (um separado!)"
 *
 * Dispara uma mensagem no canal a cada venda APROVADA. Plugado no
 * `markTransactionPaid` junto com os outros despachantes (webhook do seller,
 * pixels, utmify, push) — fire-and-forget, NUNCA afeta o crédito do saldo.
 *
 * Por que não reusei o `SaleBot`: o notificador dele foi removido em
 * 21/07/2026 (0.7% de cobertura, 66% de falha) e o que sobrou ali é o bot
 * INTERATIVO do funil. Ressuscitar aquilo traria de volta a confusão que foi
 * tirada. Este é separado, como o davi pediu.
 *
 * Lição do notificador antigo: ele falhava 66% das vezes e ninguém ficava
 * sabendo. Por isso aqui TODO envio grava totalSent/totalFailed/lastError —
 * a UI mostra quando o canal está mudo.
 */
import { prisma } from "./prisma";

const TG_TIMEOUT_MS = 8000;

/** Escapa pro parse_mode HTML do Telegram (só estes 3 importam). */
function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/** "1d 13h 29m 23s" — igual ao print que o davi mandou. */
function humanDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

const METHOD_LABEL: Record<string, string> = {
  PIX: "pix",
  CREDIT_CARD: "cartão de crédito",
  DEBIT_CARD: "cartão de débito",
  BOLETO: "boleto",
};

type ChannelRow = {
  id: string;
  botToken: string;
  chatId: string;
  showCustomer: boolean;
  showTotals: boolean;
};

/** POST no sendMessage do Telegram. Nunca throws — retorna o erro. */
async function tgSendMessage(
  token: string,
  chatId: string,
  html: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TG_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!res.ok || !json?.ok) {
      // description do Telegram é o que interessa ("chat not found", "bot is
      // not a member of the channel chat", "bot was blocked" etc).
      return {
        ok: false,
        error: json?.description ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "erro de rede",
    };
  } finally {
    clearTimeout(timer);
  }
}

export type SaleForChannel = {
  id: string;
  userId: string;
  amountCents: number;
  netCents: number;
  currency: string;
  method: string;
  provider: string;
  providerId: string | null;
  customerName: string | null;
  customerEmail: string;
  customerIp: string | null;
  utmCampaign: string | null;
  utmSource: string | null;
  createdAt: Date;
  paidAt: Date | null;
  productName: string;
  offerSlug?: string | null;
};

/** Monta a mensagem HTML no formato do print. */
export function buildSaleMessage(
  sale: SaleForChannel,
  opts: { showCustomer: boolean; showTotals: boolean },
  totals?: { campaignCountToday: number; campaignRevenueTodayCents: number },
): string {
  const paidAt = sale.paidAt ?? new Date();
  const conversion = humanDuration(paidAt.getTime() - sale.createdAt.getTime());
  const campaign = sale.utmCampaign?.trim() || "Orgânico/Direto";

  const L: string[] = [];
  L.push("✅ <b>Pagamento Aprovado!</b>");
  L.push("");
  L.push(`📦 Produto: <b>${esc(sale.productName)}</b>`);
  if (sale.offerSlug) L.push(`🔗 Oferta: <code>${esc(sale.offerSlug)}</code>`);
  L.push(`💰 Valor: <b>${brl(sale.amountCents)}</b>`);
  L.push(`💵 Líquido: ${brl(sale.netCents)}`);
  L.push(`⏱ Tempo de conversão: ${conversion}`);
  L.push("");

  if (opts.showCustomer) {
    L.push(`👤 Cliente: <b>${esc(sale.customerName ?? "—")}</b>`);
    L.push(`📧 Email: ${esc(sale.customerEmail)}`);
    if (sale.customerIp) L.push(`🌐 IP: <code>${esc(sale.customerIp)}</code>`);
    L.push("");
  }

  L.push(`🔑 ID interno: <code>${esc(sale.id)}</code>`);
  if (sale.providerId) {
    L.push(`🏷 ID gateway: <code>${esc(sale.providerId)}</code>`);
  }
  L.push(`💱 Moeda: ${esc(sale.currency)}`);
  L.push(`💳 Método: ${esc(METHOD_LABEL[sale.method] ?? sale.method)}`);
  L.push(`🏦 Adquirente: ${esc(sale.provider)}`);
  L.push("");
  L.push(`📣 Campanha: <b>${esc(campaign)}</b>`);
  if (sale.utmSource) L.push(`🔍 Origem: ${esc(sale.utmSource)}`);

  if (opts.showTotals && totals) {
    L.push(`📊 Vendas desta campanha hoje: <b>${totals.campaignCountToday}</b>`);
    L.push(
      `💹 Faturamento desta campanha hoje: <b>${brl(totals.campaignRevenueTodayCents)}</b>`,
    );
  }

  return L.join("\n");
}

/** Início do dia no fuso de Brasília (mesma convenção do resto do app). */
function startOfBrtDayLocal(): Date {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  brt.setUTCHours(0, 0, 0, 0);
  return new Date(brt.getTime() + 3 * 60 * 60 * 1000);
}

/**
 * Manda a venda pros canais ativos do seller. Best-effort: qualquer erro é
 * engolido e contabilizado, nunca sobe pro caller (senão uma falha de rede do
 * Telegram derrubaria o fluxo de crédito da venda).
 */
export async function dispatchSaleToChannels(
  sale: SaleForChannel,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: sale.userId },
      select: { pixOpsMode: true },
    });
    const mode = user?.pixOpsMode ?? "black";

    const channels = await prisma.salesChannel.findMany({
      where: { userId: sale.userId, active: true },
      select: {
        id: true,
        botToken: true,
        chatId: true,
        showCustomer: true,
        showTotals: true,
        modes: true,
      },
    });
    // Filtro por modo: lista vazia = todos os modos.
    const eligible = channels.filter(
      (c) => c.modes.length === 0 || c.modes.includes(mode),
    );
    if (eligible.length === 0) return;

    // Agregados do dia só se ALGUM canal pedir (evita query à toa).
    let totals: { campaignCountToday: number; campaignRevenueTodayCents: number } | undefined;
    if (eligible.some((c) => c.showTotals)) {
      const agg = await prisma.transaction.aggregate({
        where: {
          userId: sale.userId,
          status: "PAID",
          paidAt: { gte: startOfBrtDayLocal() },
          utmCampaign: sale.utmCampaign ?? null,
          divertedToAcquirer: false,
          divertedToReferrer: false,
        },
        _sum: { amountCents: true },
        _count: { _all: true },
      });
      totals = {
        campaignCountToday: agg._count._all,
        campaignRevenueTodayCents: agg._sum.amountCents ?? 0,
      };
    }

    await Promise.allSettled(
      eligible.map(async (ch: ChannelRow) => {
        const html = buildSaleMessage(
          sale,
          { showCustomer: ch.showCustomer, showTotals: ch.showTotals },
          totals,
        );
        const r = await tgSendMessage(ch.botToken, ch.chatId, html);
        await prisma.salesChannel
          .update({
            where: { id: ch.id },
            data: r.ok
              ? { totalSent: { increment: 1 }, lastSentAt: new Date(), lastError: null }
              : { totalFailed: { increment: 1 }, lastError: r.error.slice(0, 300) },
          })
          .catch(() => {});
        if (!r.ok) {
          console.error(`[sales-channel] ${ch.id} falhou:`, r.error);
        }
      }),
    );
  } catch (e) {
    console.error("[sales-channel] dispatch falhou:", e);
  }
}

/** Envio de teste — usado pelo botão "Testar" da UI. Retorna o erro real. */
export async function sendTestMessage(
  botToken: string,
  chatId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const html = buildSaleMessage(
    {
      id: "teste_0000000000",
      userId: "",
      amountCents: 9990,
      netCents: 9391,
      currency: "BRL",
      method: "PIX",
      provider: "safepix",
      providerId: "758c1d4f-485a-49e7-ac8c-53857d585728",
      customerName: "José Luis",
      customerEmail: "cliente@exemplo.com",
      customerIp: "189.120.79.158",
      utmCampaign: "PROMOÇÃO DE HOJE",
      utmSource: "organico",
      createdAt: new Date(Date.now() - 90 * 60 * 1000),
      paidAt: new Date(),
      productName: "Plano Normal",
      offerSlug: "plano-normal",
    },
    { showCustomer: true, showTotals: true },
    { campaignCountToday: 1, campaignRevenueTodayCents: 9990 },
  );
  return tgSendMessage(
    botToken,
    chatId,
    `🧪 <i>Mensagem de teste — é assim que suas vendas vão aparecer aqui.</i>\n\n${html}`,
  );
}
