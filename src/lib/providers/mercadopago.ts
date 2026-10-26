/**
 * Mercado Pago provider — adquirente alternativa pra Brasil/LatAm, com
 * suporte forte a cartão, Apple Pay (Brick), Google Pay (Brick) e PIX.
 *
 * Docs:
 *   - SDK: https://github.com/mercadopago/sdk-nodejs
 *   - Payments API: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
 *   - Checkout Bricks: https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/landing
 *
 * Auth: usa Access Token diretamente (server-side).
 * Public Key vai pro frontend (Brick init).
 */

import { MercadoPagoConfig, Payment } from "mercadopago";

export type MercadoPagoCreds = {
  /** APP_USR-... (frontend) */
  publicKey: string;
  /** APP_USR-... access token (server) */
  accessToken: string;
  /** Pra OAuth marketplace (opcional) */
  clientId?: string;
  clientSecret?: string;
};

export type MPCustomer = {
  name: string;
  email: string;
  /** CPF/CNPJ — só Brasil */
  document?: string;
  documentType?: "CPF" | "CNPJ";
};

/**
 * Métodos suportados pelo MP. Apple Pay/Google Pay são processados como
 * payment_method_id="apple_pay" / "google_pay" mas só funcionam via Bricks
 * no frontend (precisa do token gerado pelo SDK JS).
 */
export type MPPaymentMethod = "credit_card" | "debit_card" | "pix" | "apple_pay" | "google_pay";

export type CreateMPPaymentOptions = {
  amountCents: number;
  customer: MPCustomer;
  paymentMethod: MPPaymentMethod;
  /**
   * Token gerado pelo SDK JS no frontend (cardForm / cardToken / wallet).
   * Obrigatório pra credit_card/debit_card/apple_pay/google_pay.
   * NÃO se aplica a pix.
   */
  cardToken?: string;
  /** Número de parcelas (cartão). Default 1. */
  installments?: number;
  description?: string;
  externalReference?: string;
  metadata?: Record<string, string>;
  /** URL pra notificar (webhook) */
  notificationUrl?: string;
  /**
   * AbortSignal externo (do dispatcher) — quando outra adquirente do fanout
   * paralelo já venceu, racing contra Promise.race aborta esta chamada
   * SEM esperar o SDK do MP. O SDK não suporta AbortSignal nativamente; ele
   * roda até completar, mas a resposta é descartada.
   */
  signal?: AbortSignal;
};

export type MPPaymentResult = {
  /** Payment ID (número) */
  id: string;
  status:
    | "pending"
    | "approved"
    | "authorized"
    | "in_process"
    | "in_mediation"
    | "rejected"
    | "cancelled"
    | "refunded"
    | "charged_back"
    | string;
  statusDetail: string;
  /** Pra PIX, contém qr_code + qr_code_base64 + ticket_url */
  pix?: {
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl?: string;
    expiresAt?: string | null;
  };
  raw: unknown;
};

function getClient(creds: MercadoPagoCreds): Payment {
  const cfg = new MercadoPagoConfig({
    accessToken: creds.accessToken,
    // FANOUT-AWARE (jun/2026): timeout interno do SDK reduzido pra 7s (era 15s).
    // Combina com Promise.race externo pra abortar quando outra adquirente vence.
    options: { timeout: 7_000 },
  });
  return new Payment(cfg);
}

/**
 * Race uma promise contra um AbortSignal externo (do dispatcher). Quando o
 * signal aborta (outra adquirente venceu), rejeita IMEDIATAMENTE com AbortError
 * — a Promise original continua rodando até completar (o SDK do MP não suporta
 * cancelamento), mas sua resposta é descartada (sem leak crítico — é uma req
 * HTTP curta que termina sozinha).
 */
function raceWithSignal<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) {
    return Promise.reject(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function toMPPaymentMethodId(m: MPPaymentMethod): string {
  if (m === "credit_card") return "visa"; // será substituído pelo token na request
  if (m === "debit_card") return "debvisa";
  if (m === "pix") return "pix";
  return m;
}

export async function createMPPayment(
  opts: CreateMPPaymentOptions,
  creds: MercadoPagoCreds,
): Promise<MPPaymentResult> {
  const payment = getClient(creds);

  // Mercado Pago aceita amounts em decimal (R$ 12,50 = 12.50), não cents.
  const amount = opts.amountCents / 100;

  // Body comum
  const body: Record<string, unknown> = {
    transaction_amount: amount,
    description: opts.description?.slice(0, 256),
    external_reference: opts.externalReference,
    payer: {
      email: opts.customer.email,
      first_name: opts.customer.name.split(" ")[0] || "Cliente",
      last_name: opts.customer.name.split(" ").slice(1).join(" ") || "Anônimo",
      identification: opts.customer.document
        ? {
            type: opts.customer.documentType ?? "CPF",
            number: opts.customer.document.replace(/\D/g, ""),
          }
        : undefined,
    },
    metadata: opts.metadata ?? {},
    notification_url: opts.notificationUrl,
  };

  if (opts.paymentMethod === "pix") {
    body.payment_method_id = "pix";
    // PIX no MP costuma exigir data_of_expiration — 30min default
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    body.date_of_expiration = expiresAt
      .toISOString()
      .replace(/\.\d{3}Z$/, ".000-03:00");
  } else {
    if (!opts.cardToken) {
      throw new Error(
        `Mercado Pago: cardToken obrigatório pra método ${opts.paymentMethod}.`,
      );
    }
    body.token = opts.cardToken;
    body.installments = opts.installments ?? 1;
    body.payment_method_id = toMPPaymentMethodId(opts.paymentMethod);
  }

  // Idempotency key obrigatória pra MP (evita duplicação em retries)
  const idempotencyKey = `${opts.externalReference ?? Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  let result;
  try {
    result = await raceWithSignal(
      payment.create({
        body,
        requestOptions: { idempotencyKey },
      }),
      opts.signal,
    );
  } catch (e) {
    // SDK do MP joga MercadoPagoError que tem .cause com detalhes do response.
    // Re-throw com info útil pra debugging (acaba em providerPayload.acquirer_attempts).
    const err = e as { message?: string; cause?: unknown; status?: number };
    const cause = err.cause as
      | Array<{ description?: string; code?: string | number }>
      | { error?: string; message?: string }
      | undefined;

    let detail = "";
    if (Array.isArray(cause)) {
      detail = cause
        .map((c) => `${c.code ?? "?"}: ${c.description ?? "?"}`)
        .join("; ");
    } else if (cause && typeof cause === "object") {
      detail = (cause as { message?: string }).message ?? JSON.stringify(cause).slice(0, 200);
    }

    const status = err.status ? `[${err.status}] ` : "";
    const msg = err.message ?? "MP error";
    console.error("[mp create payment failed]", { status, msg, detail, body });
    throw new Error(`Mercado Pago ${status}${msg}${detail ? " — " + detail : ""}`);
  }

  let pix: MPPaymentResult["pix"] | undefined;
  if (opts.paymentMethod === "pix" && result.point_of_interaction?.transaction_data) {
    const td = result.point_of_interaction.transaction_data;
    pix = {
      qrCode: td.qr_code ?? "",
      qrCodeBase64: td.qr_code_base64 ?? "",
      ticketUrl: td.ticket_url ?? undefined,
      expiresAt: result.date_of_expiration ?? null,
    };
  }

  return {
    id: String(result.id),
    status: result.status ?? "pending",
    statusDetail: result.status_detail ?? "",
    pix,
    raw: result,
  };
}

/** Consulta status de um Payment (pra reconciliação). */
export async function getMPPaymentStatus(
  paymentId: string,
  creds: MercadoPagoCreds,
): Promise<{ id: string; status: string; raw: unknown }> {
  const payment = getClient(creds);
  const result = await payment.get({ id: paymentId });
  return {
    id: String(result.id),
    status: result.status ?? "unknown",
    raw: result,
  };
}
