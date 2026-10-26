/**
 * Pluggou Cash provider — intermediador de pagamento (PIX in + out).
 * Docs: https://docs.pluggoucash.com/
 * Base: https://api.pluggoutech.com/api/
 *
 * Auth: dois headers customizados (NAO eh Basic nem Bearer):
 *   - X-Public-Key: chave publica
 *   - X-Secret-Key: chave secreta
 * Guardadas em Acquirer.publicKey / Acquirer.secretKeyEnc respectivamente.
 *
 * Endpoints:
 *   POST /transactions              cria cobranca PIX
 *   GET  /transactions/{id}         consulta status da cobranca
 *   POST /withdrawals               solicita saque
 *   GET  /withdrawals/{id}          consulta status do saque
 *   GET  /withdrawals/balance       consulta saldo/limite
 *
 * Formato:
 *   - Amount SEMPRE em CENTAVOS (integer).
 *   - buyer (nao "customer"): buyer_name, buyer_document (CPF/CNPJ),
 *     buyer_phone, buyer_email, buyer_city, buyer_state, buyer_zipcode,
 *     buyer_neighborhood, buyer_number, buyer_complement.
 *   - Resposta PIX: data.pix.emv (copia-e-cola).
 *
 * Webhook (unificado — 1 endpoint /api/webhooks/pluggou pra tudo):
 *   Body: { id (event uuid), event_type: "transaction"|"withdrawal", data: {...} }
 *   Headers: X-Webhook-Event-ID + X-Webhook-Code (bearer-style, do painel).
 *   NAO HA HMAC. O anti-forge eh feito com getStatus() por evento de dinheiro,
 *   mesmo padrao do SharkHub (cf. sharkhub.ts).
 *
 * Statuses:
 *   Cobranca: pending, paid, failed, canceled, refunded, chargeback
 *   Saque:    pending, approved, paid, failed, canceled, refunded
 *
 * Reaproveita TIPOS do SafePix (CreatePixOptions/SafePixChargeResult/
 * SafePixCreds/CreateWithdrawalOptions/etc) pra plugar direto no dispatcher
 * (HANDLERS) via getHandler("pluggou"), com override interno do postback_url.
 */
import type {
  CreatePixOptions,
  SafePixChargeResult,
  SafePixCreds,
  CreateWithdrawalOptions,
  SafePixWithdrawalResult,
  SafePixBalance,
  PixKeyType,
} from "./safepix";

const BASE_URL = "https://api.pluggoutech.com/api";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
}

function authHeaders(creds?: SafePixCreds): Record<string, string> {
  const pub = creds?.publicKey ?? process.env.PLUGGOU_PUBLIC_KEY;
  const sec = creds?.secretKey ?? process.env.PLUGGOU_SECRET_KEY;
  if (!pub || !sec) {
    throw new Error("PLUGGOU credentials missing (X-Public-Key/X-Secret-Key).");
  }
  return {
    "X-Public-Key": pub,
    "X-Secret-Key": sec,
    "Content-Type": "application/json",
  };
}

// ----------- PIX charge -----------

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  const postbackUrl = `${appUrl()}/api/webhooks/pluggou`;
  const buyerDoc = (opts.customer.document?.number ?? "").replace(/\D/g, "");
  const buyerName = opts.customer.name || "Cliente";
  const buyerPhone = (opts.customer.phone ?? "").replace(/\D/g, "");

  const body: Record<string, unknown> = {
    payment_method: "pix" as const,
    amount: opts.amountCents, // CENTAVOS
    buyer: {
      buyer_name: buyerName,
      buyer_document: buyerDoc,
      ...(buyerPhone ? { buyer_phone: buyerPhone } : {}),
      ...(opts.customer.email ? { buyer_email: opts.customer.email } : {}),
    },
    postback_url: postbackUrl,
    metadata:
      opts.metadata && Object.keys(opts.metadata).length > 0
        ? opts.metadata
        : { source: "trilhopag" },
  };

  // FANOUT-AWARE TIMEOUT (mesmo padrao do safepix/sharkhub): timeout interno
  // + signal externo pra cortar quando outra adquirente vence o Promise.any.
  const externalSignal = opts.signal;
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  const combined = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(`${BASE_URL}/transactions`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify(body),
    signal: combined,
  });

  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // body nao-JSON → trata como erro abaixo
  }
  if (!res.ok || (raw.success !== undefined && !raw.success)) {
    throw new Error(
      `Pluggou ${res.status}: ${
        (raw.message as string) ??
        JSON.stringify(raw.data ?? {}).slice(0, 200) ??
        text.slice(0, 200)
      }`,
    );
  }

  const data = (raw.data ?? {}) as Record<string, unknown>;
  const pix = (data.pix ?? {}) as Record<string, unknown>;
  const emv = String(pix.emv ?? "");
  if (!emv) {
    throw new Error(
      `Pluggou nao retornou EMV/QR (status HTTP=${res.status}, body=${text.slice(0, 200)})`,
    );
  }

  return {
    id: String(data.id ?? ""),
    status: "PENDING",
    qrCode: emv,
    expiresAt: null,
    raw,
  };
}

// ----------- PIX charge status -----------

export type PluggouTxStatus = {
  status: string;
  paidAt: string | null;
  raw: unknown;
};

export async function getPaymentStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<PluggouTxStatus> {
  const res = await fetch(`${BASE_URL}/transactions/${providerId}`, {
    method: "GET",
    headers: authHeaders(creds),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    throw new Error(
      `Pluggou getPaymentStatus ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const data = (raw.data ?? {}) as Record<string, unknown>;
  return {
    status: String(data.status ?? "UNKNOWN").toUpperCase(),
    paidAt: typeof data.paid_at === "string" ? data.paid_at : null,
    raw,
  };
}

// ----------- Withdrawal (transfer / PIX out) -----------

/** Mapa PixKeyType (SafePix vocabulario) → Pluggou vocabulario.
 *  Pluggou nao aceita "evp" — usa "random" no lugar. */
function toPluggouKeyType(kt: PixKeyType): string {
  if (kt === "evp") return "random";
  return kt; // cpf/cnpj/email/phone identicos
}

/**
 * 23/07/2026 (davi): "caiu isso pro seller: 493,72 / era pra ser 495,72"
 * — a Pluggou desconta R$ 2,00 (fee da transferencia) do amount que a gente
 * envia. Antes: enviavamos payoutCents cru (ex: 49572), Pluggou tirava R$ 2
 * e seller recebia 49372. Agora: inflacionamos o amount enviado por
 * PLUGGOU_TRANSFER_FEE_CENTS pra que APOS a deducao da Pluggou o seller
 * receba EXATAMENTE o payoutCents esperado.
 *
 * Impacto contabil: pagamos R$ 2 a mais por saque Pluggou (sai da nossa
 * margem de R$ 9,90 → sobra R$ 7,90 de lucro por saque Pluggou). Ja tem
 * `withdrawalCostFixedCents` no Acquirer, mas nao era usado antes de mandar
 * — so no calculo de lucro do dashboard.
 *
 * Nao aplico esse ajuste em SafePix/Caju/etc porque eles NAO desconta fee
 * no destino (seller ja recebe o amount que enviamos). So Pluggou.
 */
const PLUGGOU_TRANSFER_FEE_CENTS = 200;

export async function createWithdrawal(
  opts: CreateWithdrawalOptions,
  creds?: SafePixCreds,
): Promise<SafePixWithdrawalResult> {
  const payoutCents = Math.round(opts.amountReais * 100);
  // Adiciona o fee que a Pluggou vai descontar — assim o valor liquido que
  // cai pro seller casa com o que ele solicitou (menos so a nossa taxa).
  const amountCents = payoutCents + PLUGGOU_TRANSFER_FEE_CENTS;
  const body = {
    amount: amountCents,
    key_type: toPluggouKeyType(opts.pixKeyType),
    key_value: opts.pixKey,
    // NAO seta discount_fee — deixa Pluggou usar o default do painel.
    // (opts.metadata ignorado — Pluggou nao aceita metadata em withdrawal
    //  segundo a doc; se aceitar depois, adiciona aqui.)
  };

  const res = await fetch(`${BASE_URL}/withdrawals`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {}
  if (!res.ok || (raw.success !== undefined && !raw.success)) {
    throw new Error(
      `Pluggou withdrawal ${res.status}: ${
        (raw.message as string) ??
        JSON.stringify(raw.data ?? {}).slice(0, 200) ??
        text.slice(0, 200)
      }`,
    );
  }

  const data = (raw.data ?? {}) as Record<string, unknown>;
  return {
    id: String(data.id ?? ""),
    status: String(data.status ?? "PENDING").toUpperCase(),
    raw,
  };
}

// ----------- Withdrawal status -----------

export type PluggouWithdrawalStatus = {
  status: string;
  paidAt: string | null;
  raw: unknown;
};

export async function getWithdrawalStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<PluggouWithdrawalStatus> {
  const res = await fetch(`${BASE_URL}/withdrawals/${providerId}`, {
    method: "GET",
    headers: authHeaders(creds),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    throw new Error(
      `Pluggou getWithdrawalStatus ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const data = (raw.data ?? {}) as Record<string, unknown>;
  return {
    status: String(data.status ?? "UNKNOWN").toUpperCase(),
    paidAt: typeof data.paid_at === "string" ? data.paid_at : null,
    raw,
  };
}

// ----------- Balance -----------

export async function getBalance(
  creds?: SafePixCreds,
): Promise<SafePixBalance> {
  const res = await fetch(`${BASE_URL}/withdrawals/balance`, {
    method: "GET",
    headers: authHeaders(creds),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    throw new Error(`Pluggou getBalance ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (raw.data ?? {}) as Record<string, unknown>;
  const amountCents = Math.floor(Number(data.available_balance ?? 0));
  return {
    amountCents: Number.isFinite(amountCents) ? amountCents : 0,
    raw,
  };
}

// ----------- Status helpers (transaction) -----------

/** paid = pagamento confirmado. */
export function isPaidStatus(status: string): boolean {
  return status.toUpperCase().trim() === "PAID";
}
/** failed | canceled = terminou sem pagar. */
export function isFailedStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "FAILED" || s === "CANCELED" || s === "CANCELLED";
}
/** refunded = estornado. */
export function isRefundedStatus(status: string): boolean {
  return status.toUpperCase().trim() === "REFUNDED";
}
/** chargeback = disputado no PSP. */
export function isChargedbackStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "CHARGEBACK" || s === "CHARGEDBACK";
}

// ----------- Status helpers (withdrawal) -----------
// Semantica diferente da cobranca: paid/approved contam como "pagou";
// failed/canceled contam como falha; refunded devolve pra carteira.

export function isPaidStatusW(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "PAID" || s === "APPROVED";
}
export function isFailedStatusW(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "FAILED" || s === "CANCELED" || s === "CANCELLED";
}
export function isRefundedStatusW(status: string): boolean {
  return status.toUpperCase().trim() === "REFUNDED";
}
