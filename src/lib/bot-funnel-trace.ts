/**
 * 22/07/2026 (davi fase 2): reconciliação do bloco `payment` modo LINK do
 * funil de bot Telegram. Quando o bot manda um botão inline URL apontando
 * pro checkout web (trilhopag.com/c/{slug}?utm_source=telegram_bot&...), o
 * cliente sai do Telegram e paga no browser. Sem trace, o gateway nao tem
 * como avisar o funil que o cliente pagou (branch "pagou" fica orfão).
 *
 * Solução: no create da transação, se utm_source === "telegram_bot" e o
 * campaign começa com "botfunnel|", extraímos botId (do campaign) + chatId
 * (do utm_content) e gravamos em `Transaction.botFunnelTrace = "botId|chatId"`.
 * Depois, quando a tx vira PAID, `advanceBotConversationOnPaid` (em
 * bot-funnel-runtime.ts) casa por pendingTxId OU por botFunnelTrace →
 * (botId, chatId) e continua o funil pelo branch "pagou".
 */

export function deriveBotFunnelTrace(
  utm?: {
    source?: string | null;
    campaign?: string | null;
    content?: string | null;
  } | null,
): string | null {
  if (!utm || !utm.source) return null;
  if (utm.source !== "telegram_bot") return null;
  const camp = utm.campaign ?? "";
  const parts = camp.split("|");
  if (parts[0] !== "botfunnel") return null;
  const botId = parts[1]?.trim();
  const chatId = utm.content?.trim();
  if (!botId || !chatId) return null;
  // Sanidade: chatId Telegram é numérico (positivo pra chat privado, negativo
  // pra grupo). Aceita qualquer string não-vazia pra ser tolerante a futuro.
  if (!/^[a-zA-Z0-9_@:.\-]{1,120}$/.test(botId)) return null;
  if (!/^-?\d{1,32}$/.test(chatId)) return null;
  return `${botId}|${chatId}`;
}
