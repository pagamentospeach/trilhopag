/**
 * Helpers de recorrência (Subscription).
 */
import { prisma } from "./prisma";

/** Serializa uma Subscription pro shape JSON da API pública (snake_case). */
export function serializeSubscription(s: {
  id: string;
  productId: string;
  customerEmail: string;
  customerName: string | null;
  customerCpf: string | null;
  customerPhone: string | null;
  interval: string;
  amountCents: number;
  status: string;
  billingsCount: number;
  failedAttempts: number;
  nextBillingAt: Date;
  initialTransactionId: string | null;
  lastTransactionId: string | null;
  canceledAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: s.id,
    object: "subscription",
    product_id: s.productId,
    customer: {
      email: s.customerEmail,
      name: s.customerName,
      cpf: s.customerCpf,
      phone: s.customerPhone,
    },
    interval: s.interval,
    interval_label: intervalLabel(s.interval),
    amount_cents: s.amountCents,
    status: s.status,
    billings_count: s.billingsCount,
    failed_attempts: s.failedAttempts,
    next_billing_at: s.nextBillingAt.toISOString(),
    initial_transaction_id: s.initialTransactionId,
    last_transaction_id: s.lastTransactionId,
    canceled_at: s.canceledAt?.toISOString() ?? null,
    created_at: s.createdAt.toISOString(),
  };
}

export type RecurrenceInterval = "weekly" | "monthly" | "quarterly" | "yearly";

export const RECURRENCE_INTERVAL_LABEL: Record<RecurrenceInterval, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};

const NAMED_INTERVALS = ["weekly", "monthly", "quarterly", "yearly"] as const;
/** Custom: "days:N" (1..365). Permite o seller escolher QUALQUER cadência
 *  via API (ex: "days:15", "days:45"). */
const CUSTOM_DAYS_RE = /^days:(\d{1,3})$/;

/** Quantos dias um intervalo customizado "days:N" representa (ou null). */
export function customIntervalDays(interval: string): number | null {
  const m = interval.match(CUSTOM_DAYS_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 365 ? n : null;
}

/** Valida um intervalo: 1 dos 4 nomeados OU "days:N" (1..365). */
export function isValidInterval(interval: string): boolean {
  if ((NAMED_INTERVALS as readonly string[]).includes(interval)) return true;
  return customIntervalDays(interval) !== null;
}

/** Label legível pra qualquer intervalo (nomeado ou custom). */
export function intervalLabel(interval: string): string {
  if (interval in RECURRENCE_INTERVAL_LABEL) {
    return RECURRENCE_INTERVAL_LABEL[interval as RecurrenceInterval];
  }
  const days = customIntervalDays(interval);
  return days ? `A cada ${days} dia${days > 1 ? "s" : ""}` : interval;
}

/**
 * Calcula a próxima data de cobrança a partir de uma base.
 *
 * @param base data de início (ex: Date.now())
 * @param interval intervalo: "weekly"|"monthly"|"quarterly"|"yearly" OU "days:N"
 * @param trialDays dias de trial antes da PRIMEIRA cobrança recorrente
 *                  (só aplicado uma vez — quando billingsCount === 1)
 * @param firstBilling se true, soma trialDays além do interval
 */
export function nextBillingDate(
  base: Date,
  interval: string,
  trialDays?: number | null,
  firstBilling = false,
): Date {
  const d = new Date(base);
  if (firstBilling && trialDays && trialDays > 0) {
    d.setDate(d.getDate() + trialDays);
    return d;
  }
  const customDays = customIntervalDays(interval);
  if (customDays !== null) {
    d.setDate(d.getDate() + customDays);
    return d;
  }
  switch (interval) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      // Fallback defensivo: mensal (não deveria chegar aqui — validado antes)
      d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/**
 * Cria uma Subscription a partir de uma transação inicial PAGA.
 *
 * Decide o intervalo nessa ordem:
 *  1. `recurrence_override` no providerPayload (vem da API quando seller
 *     manda subscription block — funciona mesmo se produto nao tem
 *     recurrenceEnabled)
 *  2. Product.recurrenceEnabled + recurrenceInterval (modo default)
 *
 * Idempotente — se já existe Subscription pra essa transactionId,
 * retorna a existente sem criar nova.
 */
export async function createSubscriptionFromTransaction(
  transactionId: string,
): Promise<{ ok: true; subscriptionId: string } | { ok: false; reason: string }> {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      productId: true,
      status: true,
      amountCents: true,
      customerEmail: true,
      customerName: true,
      customerCpf: true,
      customerPhone: true,
      providerPayload: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      product: {
        select: {
          recurrenceEnabled: true,
          recurrenceInterval: true,
          recurrenceTrialDays: true,
        },
      },
    },
  });
  if (!tx) return { ok: false, reason: "tx_not_found" };
  if (tx.status !== "PAID") return { ok: false, reason: "tx_not_paid" };
  // Gate defensivo (06/07): tx desviada NUNCA vira subscription. Se
  // virasse, o cron de renovacao criaria segundo PIX vinculado a essa
  // conta e o seller veria a renovacao aparecer no painel dele —
  // denunciava o desvio. O caller fireSellerSidePaidDispatches ja filtra,
  // mas gate aqui pra qualquer callsite futuro (admin.markPaid retro, etc).
  if (
    (tx as { divertedToAcquirer?: boolean }).divertedToAcquirer ||
    (tx as { divertedToReferrer?: boolean }).divertedToReferrer
  ) {
    return { ok: false, reason: "tx_diverted" };
  }

  // Override via API > Product default
  const payload = tx.providerPayload as Record<string, unknown> | null;
  const override = payload?.recurrence_override as
    | { interval?: string; trial_days?: number | null; max_billings?: number | null }
    | undefined;

  const interval =
    override?.interval ?? tx.product.recurrenceInterval ?? null;
  const trialDays = override?.trial_days ?? tx.product.recurrenceTrialDays ?? null;

  // Se nem override nem product habilitou recorrencia, sai
  if (!override && !tx.product.recurrenceEnabled) {
    return { ok: false, reason: "product_not_recurring" };
  }
  if (!interval) return { ok: false, reason: "no_interval" };
  // Aceita os 4 nomeados OU custom "days:N" (1..365).
  if (!isValidInterval(interval)) {
    return { ok: false, reason: "invalid_interval" };
  }

  // Idempotência: já existe sub pra essa tx?
  const existing = await prisma.subscription.findFirst({
    where: { initialTransactionId: transactionId },
    select: { id: true },
  });
  if (existing) return { ok: true, subscriptionId: existing.id };

  const now = new Date();
  const nextBilling = nextBillingDate(now, interval, trialDays, true);

  const sub = await prisma.subscription.create({
    data: {
      userId: tx.userId,
      productId: tx.productId,
      customerEmail: tx.customerEmail,
      customerName: tx.customerName,
      customerCpf: tx.customerCpf,
      customerPhone: tx.customerPhone,
      interval,
      amountCents: tx.amountCents,
      status: "active",
      billingsCount: 1,
      nextBillingAt: nextBilling,
      currentPeriodStart: now,
      initialTransactionId: tx.id,
      lastTransactionId: tx.id,
    },
  });
  return { ok: true, subscriptionId: sub.id };
}
