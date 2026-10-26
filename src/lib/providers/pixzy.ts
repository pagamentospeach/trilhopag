/**
 * Pixzy Pay provider — intermediador PIX (in + out).
 * Docs: https://docs.pixzypay.com/
 * Base: https://app.pixzypay.com/api
 *
 * Auth: Bearer token unico no header `Authorization: Bearer <token>`.
 * Guardado em Acquirer.secretKeyEnc (encriptado).
 *
 * Endpoints:
 *   POST  /transactions              cria cobranca PIX (min R$5)
 *   GET   /transactions/{id}         consulta status da cobranca
 *   POST  /withdrawals               solicita saque (min R$10)
 *   GET   /account                   nome do titular + saldo (centavos)
 *   (nao ha GET /withdrawals/{id} publico — status vem via webhook)
 *
 * Formato:
 *   - Amount SEMPRE em CENTAVOS (integer).
 *   - Client (nao "customer"): client_name, client_doc (CPF/CNPJ), client_email,
 *     client_phone. Endereco NAO eh aceito no create (soh vem no webhook).
 *   - Resposta PIX: data.br_code (copia-e-cola). QR code base64 nao vem no
 *     create, soh no GET /transactions/{id} (data.qr_code).
 *
 * Webhook (unificado — 1 endpoint /api/webhooks/pixzy pra tudo):
 *   Body transacao:
 *     { event: "transaction_paid"|"transaction_created"|"transaction_refunded"
 *              |"transaction_cancelled"|"transaction_chargeback",
 *       transaction: { id, external_id, amount, status, ... },
 *       client: {...}, products: [...], utms: {...} }
 *   Body saque:
 *     { event: "approved"|"rejected",
 *       withdrawal: { id, amount, status, pix_key, pix_key_type, ... } }
 *
 *   Pixzy NAO documenta HMAC nem allowlist de IP. Anti-forge eh feito
 *   RE-CONFIRMANDO via GET /transactions/{id} pra eventos de dinheiro,
 *   mesmo padrao do Pluggou/SharkHub/SharkBanking. Saque nao tem endpoint
 *   de consulta — confiamos no primeiro webhook + idempotency.
 *
 *   Retry Pixzy: ate 3x a cada 60s (documentado). Codigo esperado: 2xx.
 *
 * Statuses:
 *   Cobranca:  pending | paid | expired | failed | refunded | chargeback
 *   Saque:     pending | approved | rejected | done
 *
 * Rate limit: 120 req/min por token (documentado). Retorna 429 com
 * Retry-After em segundos.
 *
 * Reaproveita TIPOS do SafePix (CreatePixOptions/SafePixChargeResult/
 * SafePixCreds/etc) pra plugar direto no dispatcher (HANDLERS) via
 * getHandler("pixzy").
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

const BASE_URL = "https://app.pixzypay.com/api";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
}

/** Bearer auth. Token guardado em Acquirer.secretKeyEnc (encriptado).
 *  Pixzy usa 1 token soh — o publicKey nao eh usado. */
function authHeaders(creds?: SafePixCreds): Record<string, string> {
  const token = creds?.secretKey ?? process.env.PIXZY_API_TOKEN;
  if (!token) {
    throw new Error("PIXZY credentials missing (Bearer token).");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ----------- PIX charge -----------

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  const webhookUrl = `${appUrl()}/api/webhooks/pixzy`;
  const doc = (opts.customer.document?.number ?? "").replace(/\D/g, "");
  const name = (opts.customer.name || "Cliente").slice(0, 120);
  const phone = (opts.customer.phone ?? "").replace(/\D/g, "");

  // Pixzy exige minimo R$5 (500 centavos) — deixamos a validacao explodir
  // com mensagem clara pra facilitar debug.
  if (opts.amountCents < 500) {
    throw new Error(
      `Pixzy min amount 500 cents (R$5,00); received ${opts.amountCents}`,
    );
  }

  const body: Record<string, unknown> = {
    amount: opts.amountCents, // CENTAVOS
    client_name: name,
    client_email: opts.customer.email || `noemail-${Date.now()}@trilhopag.com`,
    client_doc: doc,
    ...(phone ? { client_phone: phone } : {}),
    webhook_url: webhookUrl,
    // Metadata vira ate 20 chaves — passamos transaction_id + fingerprint
    // (pra rastrear tx nossa a partir do webhook).
    metadata:
      opts.metadata && Object.keys(opts.metadata).length > 0
        ? opts.metadata
        : { source: "trilhopag" },
  };

  // FANOUT-AWARE TIMEOUT (mesmo padrao do safepix/pluggou/sharkhub):
  // timeout interno + signal externo pra cortar quando outra adquirente
  // vence o Promise.any.
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
    // body nao-JSON → trata como erro
  }
  if (!res.ok || (raw.status !== undefined && raw.status !== "success")) {
    // Erro 422: campo `errors` pode ser string OU objeto {field: [...]}
    const errRaw = raw.errors;
    const errStr =
      typeof errRaw === "string"
        ? errRaw
        : errRaw && typeof errRaw === "object"
          ? JSON.stringify(errRaw).slice(0, 300)
          : (raw.message as string) ?? text.slice(0, 200);
    throw new Error(`Pixzy ${res.status}: ${errStr}`);
  }

  const data = (raw.data ?? {}) as Record<string, unknown>;
  const brCode = String(data.br_code ?? "");
  if (!brCode) {
    throw new Error(
      `Pixzy nao retornou br_code/EMV (status HTTP=${res.status}, body=${text.slice(0, 200)})`,
    );
  }

  return {
    id: String(data.transaction_id ?? data.id ?? ""),
    status: "PENDING",
    qrCode: brCode,
    expiresAt: null, // Pixzy nao devolve expiresAt no create
    raw,
  };
}

// ----------- PIX charge status -----------

export type PixzyTxStatus = {
  status: string;
  paidAt: string | null;
  raw: unknown;
};

export async function getPaymentStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<PixzyTxStatus> {
  const res = await fetch(`${BASE_URL}/transactions/${encodeURIComponent(providerId)}`, {
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
      `Pixzy getPaymentStatus ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const data = (raw.data ?? {}) as Record<string, unknown>;
  return {
    status: String(data.status ?? "UNKNOWN").toUpperCase(),
    paidAt: typeof data.updated_at === "string" ? data.updated_at : null,
    raw,
  };
}

// ----------- Withdrawal (PIX out) -----------

/** Mapa PixKeyType (SafePix vocabulario) → Pixzy vocabulario.
 *  Pixzy aceita: cpf, cnpj, email, phone, random. Nao aceita "evp" — usa
 *  "random" no lugar (mesmo padrao do Pluggou). */
function toPixzyKeyType(kt: PixKeyType): string {
  if (kt === "evp") return "random";
  return kt;
}

/**
 * 23/07/2026 (davi): "no pixzy é 5 reais" — mesma correcao aplicada pra
 * Pluggou/SafePix. A Pixzy desconta R$ 5,00 (fee de transferencia) do
 * amount que a gente envia; sem compensacao o seller recebe R$ 5 menos
 * do que o payoutCents esperado.
 */
const PIXZY_TRANSFER_FEE_CENTS = 500;

export async function createWithdrawal(
  opts: CreateWithdrawalOptions,
  creds?: SafePixCreds,
): Promise<SafePixWithdrawalResult> {
  const webhookUrl = `${appUrl()}/api/webhooks/pixzy`;
  const payoutCents = Math.round(opts.amountReais * 100);
  // Inflaciona o amount pra compensar o fee que a Pixzy desconta.
  const amountCents = payoutCents + PIXZY_TRANSFER_FEE_CENTS;

  // Pixzy min saque R$10 (1000 centavos) — checa contra o payout (o que
  // seller pediu), nao contra o valor inflacionado.
  if (payoutCents < 1000) {
    throw new Error(
      `Pixzy min withdrawal 1000 cents (R$10,00); received ${payoutCents}`,
    );
  }

  const body = {
    amount: amountCents,
    pix_key: opts.pixKey,
    pix_key_type: toPixzyKeyType(opts.pixKeyType),
    webhook_url: webhookUrl,
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
  if (!res.ok) {
    // 422 de saque: `errors` eh SEMPRE objeto {field: [...]} (docs).
    const errRaw = raw.errors;
    const errStr =
      typeof errRaw === "object" && errRaw
        ? JSON.stringify(errRaw).slice(0, 300)
        : (raw.message as string) ?? text.slice(0, 200);
    throw new Error(`Pixzy withdrawal ${res.status}: ${errStr}`);
  }

  const data = (raw.data ?? {}) as Record<string, unknown>;
  return {
    id: String(data.id ?? ""),
    status: String(data.status ?? "PENDING").toUpperCase(),
    raw,
  };
}

// ----------- Withdrawal status -----------
// Pixzy NAO documenta GET /withdrawals/{id} publico. Retornamos o ultimo
// status conhecido do webhook (guardado em Withdrawal.providerPayload).
// Se o webhook nao chegou, retorna UNKNOWN (o cron de reconcile so vai
// esperar o webhook — nao ha polling ativo).

export type PixzyWithdrawalStatus = {
  status: string;
  paidAt: string | null;
  raw: unknown;
};

export async function getWithdrawalStatus(
  _providerId: string,
  _creds?: SafePixCreds,
): Promise<PixzyWithdrawalStatus> {
  // Sem endpoint publico. Retorna UNKNOWN — o webhook eh a fonte de
  // verdade. Mantemos a assinatura pra compatibilidade com o dispatcher.
  return {
    status: "UNKNOWN",
    paidAt: null,
    raw: { note: "Pixzy nao expoe GET /withdrawals/{id}. Aguardar webhook." },
  };
}

// ----------- Balance -----------
// GET /account retorna { name, balance }. balance em centavos.

export async function getBalance(
  creds?: SafePixCreds,
): Promise<SafePixBalance> {
  const res = await fetch(`${BASE_URL}/account`, {
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
    throw new Error(`Pixzy getBalance ${res.status}: ${text.slice(0, 200)}`);
  }
  const amountCents = Math.floor(Number(raw.balance ?? 0));
  return {
    amountCents: Number.isFinite(amountCents) ? amountCents : 0,
    raw,
  };
}

// ----------- Status helpers (transaction) -----------
// Pixzy usa lowercase nos webhooks (transaction.status = "paid" etc). Como
// getPaymentStatus normaliza pra uppercase, esses helpers aceitam ambos.

/** paid = pagamento confirmado. */
export function isPaidStatus(status: string): boolean {
  return status.toUpperCase().trim() === "PAID";
}
/** expired | failed | cancelled = terminou sem pagar. */
export function isFailedStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return (
    s === "FAILED" ||
    s === "EXPIRED" ||
    s === "CANCELED" ||
    s === "CANCELLED"
  );
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
// Semantica: approved/paid/done = "pagou"; rejected/failed = falha; nao ha
// refunded documentado (rejeitado ja devolve saldo automaticamente).

export function isPaidStatusW(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "PAID" || s === "APPROVED" || s === "DONE";
}
export function isFailedStatusW(status: string): boolean {
  const s = status.toUpperCase().trim();
  return (
    s === "REJECTED" ||
    s === "FAILED" ||
    s === "CANCELED" ||
    s === "CANCELLED"
  );
}
export function isRefundedStatusW(status: string): boolean {
  return status.toUpperCase().trim() === "REFUNDED";
}
