/**
 * CATÁLOGO DE EVENTOS DE WEBHOOK — fonte única.
 *
 * ⚠️ Módulo NEUTRO (sem "use client"/"use server", sem imports). É o que
 * permite o tipo, a server action e o formulário lerem a MESMA lista.
 *
 * 08/08/2026 — o que estava quebrado antes disto existir:
 *
 * A lista vivia em três lugares que discordavam entre si.
 *   - `WebhookEvent` (lib/webhooks.ts) declarava 9 eventos.
 *   - `ALLOWED_EVENTS` (dashboard/integracoes/webhooks/actions.ts) tinha 6.
 *   - `EVENTS` (components/dashboard/webhook-form.tsx) repetia os mesmos 6.
 *
 * Dois defeitos saíram daí:
 *
 * 1. TRÊS EVENTOS ÓRFÃOS. `transaction.receipt_uploaded`, `withdrawal.paid` e
 *    `withdrawal.failed` eram disparados de verdade pelo backend
 *    (lib/withdrawals.ts:429,496,531,585) mas não apareciam no formulário. O
 *    filtro de entrega é `events.length === 0 || events.includes(event)`, ou
 *    seja: enquanto o seller nunca tinha mexido, o array vazio entregava tudo.
 *    Bastava ele SALVAR o formulário uma vez — marcando o que quisesse — pra
 *    esses três pararem de chegar pra sempre, sem nenhum jeito de religar pela
 *    interface. Um seller que integrou saque por webhook via a integração
 *    morrer no dia em que mexeu numa configuração sem relação.
 *
 * 2. UM EVENTO FANTASMA. `transaction.failed` estava no tipo, no formulário e
 *    na documentação pública (/docs), e NENHUM `dispatchEvent` o emite. O
 *    desenvolvedor do outro lado escrevia o handler e esperava para sempre.
 *    Saiu daqui: a seção 13 do prompt de revamp é explícita — "NÃO invente
 *    eventos se eles não existirem na API real".
 *
 * REGRA PRA MEXER AQUI: um evento só entra nesta lista quando existir um
 * `dispatchEvent(..., "<nome>")` de verdade no código. A lista descreve o que
 * o sistema faz, não o que a gente gostaria que ele fizesse.
 */

export const WEBHOOK_EVENTS = [
  {
    key: "transaction.created",
    label: "Transação criada",
    group: "Transações",
  },
  { key: "transaction.paid", label: "Transação paga", group: "Transações" },
  {
    key: "transaction.expired",
    label: "Transação expirada",
    group: "Transações",
  },
  {
    key: "transaction.refunded",
    label: "Transação reembolsada",
    group: "Transações",
  },
  { key: "transaction.chargeback", label: "Chargeback", group: "Transações" },
  {
    key: "transaction.receipt_uploaded",
    label: "Comprovante enviado",
    group: "Transações",
  },
  { key: "withdrawal.paid", label: "Saque pago", group: "Saques" },
  {
    key: "withdrawal.failed",
    label: "Saque recusado ou falhou",
    group: "Saques",
  },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["key"];

/** Só as chaves, na ordem do catálogo. */
export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENTS.map((e) => e.key) as readonly WebhookEvent[];

/** Grupos na ordem em que devem aparecer no formulário. */
export const WEBHOOK_EVENT_GROUPS = ["Transações", "Saques"] as const;

export function isWebhookEvent(v: string): v is WebhookEvent {
  return (WEBHOOK_EVENT_KEYS as readonly string[]).includes(v);
}
