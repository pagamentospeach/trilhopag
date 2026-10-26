/**
 * Stripe provider — usado pra cobrança internacional (gringa) + wallets
 * (Apple Pay, Google Pay).
 *
 * Docs:
 *   - PaymentIntent: https://docs.stripe.com/api/payment_intents
 *   - Apple Pay: https://docs.stripe.com/apple-pay
 *   - Google Pay: https://docs.stripe.com/google-pay
 *
 * IMPORTANTE: Apple Pay requer domain verification no Dashboard Stripe.
 * Google Pay precisa de merchant ID e Apple Pay precisa de certificado.
 * Esses passos são MANUAIS pelo Dashboard antes de processar.
 */

import Stripe from "stripe";

export type StripeCreds = {
  /** Publishable key (pk_live_... / pk_test_...) */
  publishableKey: string;
  /** Secret key (sk_live_... / sk_test_...) */
  secretKey: string;
  /** Webhook signing secret (whsec_...) — opcional, mas necessário pra webhooks */
  webhookSecret?: string;
};

/**
 * Payment methods que o Stripe aceita no nosso fluxo. Cada um requer
 * configuração específica no Dashboard antes de processar.
 */
export type StripePaymentMethod =
  | "card"
  | "apple_pay" // via card + wallet
  | "google_pay"; // via card + wallet

export type StripeCustomer = {
  name: string;
  email: string;
  /** ISO country code (BR, PT, US, etc) — afeta payment methods disponíveis */
  country?: string;
  phone?: string;
};

export type CreateStripePaymentOptions = {
  amountCents: number;
  /** ISO 4217 (BRL, USD, EUR) */
  currency: string;
  customer: StripeCustomer;
  paymentMethod: StripePaymentMethod;
  /** Descrição que aparece no extrato do cliente */
  statementDescriptor?: string;
  description?: string;
  metadata?: Record<string, string>;
  /** URL pra redirect pós-3DS (cartão) */
  returnUrl: string;
};

export type StripePaymentResult = {
  /** Stripe PaymentIntent ID (pi_...) */
  id: string;
  /** Client secret pra confirmar no frontend (pi_xxx_secret_yyy) */
  clientSecret: string;
  status: Stripe.PaymentIntent.Status;
  raw: Stripe.PaymentIntent;
};

function getClient(creds: StripeCreds): Stripe {
  return new Stripe(creds.secretKey, {
    apiVersion: "2026-04-22.dahlia",
    timeout: 15_000,
    // Retry automatico (backoff exponencial do proprio SDK) em timeout/5xx —
    // evita que um soluço momentaneo da Stripe gruda erro no painel de saldos.
    maxNetworkRetries: 2,
  });
}

/**
 * Saldo da conta Stripe — soma "available" (sacavel agora) + "pending"
 * (em processamento, vira available em alguns dias).
 *
 * Retorna em cents da moeda nativa da conta (geralmente USD ou BRL).
 * Se a conta tem multiplas moedas, soma usando a primeira como base
 * — chamador pode mostrar separado se quiser.
 */
export type StripeBalance = {
  availableCents: number;
  pendingCents: number;
  currency: string;
};

export async function getStripeBalance(creds: StripeCreds): Promise<StripeBalance> {
  const stripe = getClient(creds);
  const bal = await stripe.balance.retrieve();
  // available/pending sao arrays por moeda; pegamos o primeiro
  const av = bal.available[0];
  const pe = bal.pending[0];
  return {
    availableCents: av?.amount ?? 0,
    pendingCents: pe?.amount ?? 0,
    currency: (av?.currency ?? pe?.currency ?? "usd").toUpperCase(),
  };
}

/**
 * Mapeia o método interno → tipo Stripe aceito por PaymentIntent.
 *
 * "card" cobre card normal + Apple Pay + Google Pay (são wallets sobre card).
 */
function toMethodTypes(_m: StripePaymentMethod): string[] {
  // card / apple_pay / google_pay são todos wallets sobre "card".
  return ["card"];
}

export async function createStripePayment(
  opts: CreateStripePaymentOptions,
  creds: StripeCreds,
): Promise<StripePaymentResult> {
  const stripe = getClient(creds);

  const intent = await stripe.paymentIntents.create({
    amount: opts.amountCents,
    currency: opts.currency.toLowerCase(),
    payment_method_types: toMethodTypes(opts.paymentMethod),
    receipt_email: opts.customer.email,
    statement_descriptor_suffix: opts.statementDescriptor?.slice(0, 22),
    description: opts.description?.slice(0, 350),
    metadata: opts.metadata ?? {},
  });

  return {
    id: intent.id,
    clientSecret: intent.client_secret ?? "",
    status: intent.status,
    raw: intent,
  };
}

/**
 * Consulta status de um PaymentIntent (pra reconciliação manual ou após
 * webhook). Retorna o status atual.
 */
export async function getStripePaymentStatus(
  paymentIntentId: string,
  creds: StripeCreds,
): Promise<{ id: string; status: Stripe.PaymentIntent.Status; raw: Stripe.PaymentIntent }> {
  const stripe = getClient(creds);
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return { id: intent.id, status: intent.status, raw: intent };
}

/**
 * Valida assinatura de webhook do Stripe e parsa o evento.
 * Throwa se assinatura inválida (resposta 400 no caller).
 */
export function parseStripeWebhook(
  rawBody: string,
  signature: string,
  creds: StripeCreds,
): Stripe.Event {
  if (!creds.webhookSecret) {
    throw new Error("Stripe webhook secret não configurado.");
  }
  // Lib usa o mesmo objeto Stripe pra construir o evento.
  const stripe = getClient(creds);
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    creds.webhookSecret,
  );
}
