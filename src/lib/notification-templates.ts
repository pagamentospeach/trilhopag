/**
 * Templates de push notification — seller personaliza no /dashboard/perfil.
 *
 * Variables suportadas (interpoladas em {curly}):
 *   {amount}    R$ X,YZ formatado
 *   {customer}  nome do cliente
 *   {product}   nome do produto
 *   {offer}     slug da oferta/checkout (30/07/2026)
 *   {bot}       nome do bot que originou a venda (30/07/2026)
 *   {count}     contador (usado no spam generator)
 *   {emoji}     emoji escolhido pelo seller pro tipo de evento
 */

export type NotificationEvent = "pending" | "paid" | "withdrawal";

export type EventPrefs = {
  /** Template do titulo. Aceita variaveis. */
  title?: string;
  /** Template do corpo. Aceita variaveis. */
  body?: string;
  /** Emoji a ser usado nas variaveis {emoji} (e prefixo do titulo). */
  emoji?: string;
  /** Toca som ao chegar? Default true. */
  sound?: boolean;
  /** Vibra (mobile)? Default true. */
  vibrate?: boolean;
  /**
   * 30/07/2026 (davi 'por o nome do produto ou oferta ou bot na notificacao
   * para ver se onde a venda veio, mas so funciona se o cara ativar'): quando
   * true, appenda uma linha ao body com a origem da venda:
   *   "📍 Via 🤖 Bot X · 🛍️ Oferta Y · 📦 Produto Z"
   * Prioridade: bot (se presente) > oferta > produto. Opt-in (default false)
   * porque nem todo seller quer que essa info apareça no push.
   */
  showSource?: boolean;
};

export type NotificationPrefs = Partial<Record<NotificationEvent, EventPrefs>>;

/** Defaults por evento — usados quando seller nao customiza. */
export const DEFAULT_PREFS: Required<Record<NotificationEvent, Required<EventPrefs>>> = {
  pending: {
    title: "{emoji} PIX gerado",
    body: "{amount} aguardando pagamento de {customer}",
    emoji: "🕐",
    sound: true,
    vibrate: true,
    showSource: false,
  },
  paid: {
    title: "{emoji} +{amount}!",
    body: "Venda aprovada — {customer} pagou {product}",
    emoji: "💰",
    sound: true,
    vibrate: true,
    showSource: false,
  },
  withdrawal: {
    title: "{emoji} Saque pago",
    body: "{amount} foi enviado pra sua chave PIX",
    emoji: "🏦",
    sound: true,
    vibrate: true,
    showSource: false, // nao aplica a saques (nao tem produto/oferta/bot)
  },
};

/**
 * Resolve prefs efetivas pra um evento: merge do default com o que o seller
 * customizou. Vazio/null no DB = usa defaults completos.
 */
export function resolveEventPrefs(
  prefs: NotificationPrefs | null | undefined,
  event: NotificationEvent,
): Required<EventPrefs> {
  const def = DEFAULT_PREFS[event];
  const user = prefs?.[event] ?? {};
  return {
    title: user.title?.trim() || def.title,
    body: user.body?.trim() || def.body,
    emoji: user.emoji?.trim() || def.emoji,
    sound: user.sound ?? def.sound,
    vibrate: user.vibrate ?? def.vibrate,
    showSource: user.showSource ?? def.showSource,
  };
}

/**
 * 30/07/2026 (davi): monta a linha de "origem da venda" pra appendar ao body
 * quando o seller ativa `showSource`. Retorna string vazia se nao tem
 * nenhuma info util. Prioriza mostrar tudo que tiver, na ordem bot > oferta
 * > produto — mais especifico primeiro.
 *
 * Exemplo: { product: "Curso X", offer: "vip-2", bot: "MeuBot" } →
 *   "📍 🤖 MeuBot · 🛍️ vip-2 · 📦 Curso X"
 */
export function buildSourceLine(vars: {
  product?: string;
  offer?: string;
  bot?: string;
}): string {
  const parts: string[] = [];
  if (vars.bot && vars.bot.trim()) parts.push(`🤖 ${vars.bot.trim()}`);
  if (vars.offer && vars.offer.trim()) parts.push(`🛍️ ${vars.offer.trim()}`);
  if (vars.product && vars.product.trim())
    parts.push(`📦 ${vars.product.trim()}`);
  if (parts.length === 0) return "";
  return `📍 ${parts.join(" · ")}`;
}

/**
 * Interpola variaveis no template.
 * Exemplo: interpolate("R$ {amount}!", { amount: "100,00" }) → "R$ 100,00!"
 */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/** Formata cents → "R$ X,YZ" pra interpolacao. */
export function formatAmountCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * Validacao basica de payload do PATCH. Limita tamanhos pra evitar push
 * payload bloated (provedor pode rejeitar acima de 4KB).
 */
export function sanitizePrefs(input: unknown): NotificationPrefs {
  if (!input || typeof input !== "object") return {};
  const events: NotificationEvent[] = ["pending", "paid", "withdrawal"];
  const out: NotificationPrefs = {};
  for (const ev of events) {
    const raw = (input as Record<string, unknown>)[ev];
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const ep: EventPrefs = {};
    if (typeof r.title === "string") ep.title = r.title.slice(0, 80);
    if (typeof r.body === "string") ep.body = r.body.slice(0, 200);
    if (typeof r.emoji === "string") ep.emoji = r.emoji.slice(0, 8);
    if (typeof r.sound === "boolean") ep.sound = r.sound;
    if (typeof r.vibrate === "boolean") ep.vibrate = r.vibrate;
    if (typeof r.showSource === "boolean") ep.showSource = r.showSource;
    out[ev] = ep;
  }
  return out;
}
