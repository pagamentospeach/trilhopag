/**
 * Shark Banking provider (white-label "Shield Tecnologia").
 * Docs: https://app.sharkbanking.com.br/docs/intro/first-steps
 * Base: https://api.sharkbanking.com.br/v1
 * Auth: header `Authorization: Basic base64(publicKey:secretKey)` (igual SafePix).
 *
 * Endpoints usados:
 *   POST /v1/transactions          → cria cobrança (PIX/cartão). amount em CENTAVOS.
 *   GET  /v1/transactions/{id}      → status da cobrança (anti-forge / recovery).
 *   GET  /v1/balance/available      → saldo disponível (cents).
 *   POST /v1/transfers              → saque/transferência PIX (saque externo: wk_).
 *
 * Resposta de criação (confirmada em teste real, id 44442576):
 *   { id (NUMBER), status:"waiting_payment", secureId,
 *     pix:{ qrcode (EMV copia-e-cola, lowercase), expirationDate }, ... }
 *
 * Status enum: waiting_payment | pending | paid | approved | refused |
 *   in_protest | refunded | cancelled | chargeback.
 *   PAID={paid,approved} · REFUNDED={refunded,chargeback} ·
 *   FAILED/EXPIRED={refused,cancelled} · PENDING={waiting_payment,pending,in_protest}.
 *
 * Reaproveita os TIPOS do SafePix (CreatePixOptions / SafePixChargeResult /
 * SafePixCreds) pra plugar no dispatcher (HANDLERS) — mas SOBRESCREVE o
 * postbackUrl pro nosso /api/webhooks/sharkbanking (o pix route hardcoda o URL
 * do SafePix). Sem assinatura de webhook documentada → o handler de webhook
 * RE-CONFIRMA o status via GET /transactions/{id} antes de creditar (anti-forge).
 */
import type {
  CreatePixOptions,
  SafePixChargeResult,
  SafePixCreds,
} from "./safepix";
import { isTransientFetchError, normalizeFetchError } from "./safepix";

const BASE_URL = "https://api.sharkbanking.com.br/v1";

function authHeader(creds?: SafePixCreds) {
  const pub = creds?.publicKey ?? process.env.SHARKBANKING_PUBLIC_KEY;
  const sec = creds?.secretKey ?? process.env.SHARKBANKING_SECRET_KEY;
  if (!pub || !sec) {
    throw new Error("SHARKBANKING credentials missing.");
  }
  const token = Buffer.from(`${pub}:${sec}`).toString("base64");
  return `Basic ${token}`;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
}

// ----------- PIX charge -----------

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  // O pix route hardcoda postbackUrl pro SafePix. A Shark precisa apontar pro
  // NOSSO /api/webhooks/sharkbanking — sobrescreve aqui.
  const postbackUrl = `${appUrl()}/api/webhooks/sharkbanking`;

  const docNumber = (opts.customer.document?.number ?? "").replace(/\D/g, "");
  const docType =
    (opts.customer.document?.type ?? "cpf") === "cnpj" ? "cnpj" : "cpf";

  const body = {
    amount: opts.amountCents, // CENTAVOS
    paymentMethod: "pix" as const,
    postbackUrl,
    ...(opts.metadata?.transaction_id
      ? { externalRef: opts.metadata.transaction_id }
      : {}),
    ...(opts.ip ? { ip: opts.ip } : {}),
    customer: {
      name: opts.customer.name || "Cliente",
      email: opts.customer.email,
      ...(opts.customer.phone ? { phone: opts.customer.phone } : {}),
      document: { type: docType, number: docNumber },
    },
    items: opts.items.map((it) => ({
      title: it.title,
      unitPrice: it.unit_price,
      quantity: it.quantity,
      tangible: it.tangible,
    })),
    metadata: JSON.stringify(opts.metadata ?? { source: "trilhopag" }),
  };

  // FANOUT-AWARE TIMEOUT (jun/2026): 5s + signal externo do dispatcher pra
  // cancelar quando OUTRA adquirente já venceu Promise.any.
  const timeoutSignal = AbortSignal.timeout(5000);
  const combined = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;
  const res = await fetch(`${BASE_URL}/transactions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: combined,
  });

  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // body não-JSON → trata como erro abaixo
  }
  if (!res.ok) {
    throw new Error(
      `SharkBanking ${res.status}: ${
        (raw.message as string) ?? text.slice(0, 200) ?? "erro"
      }`,
    );
  }

  // A resposta vem no topo (id/status/pix) ou aninhada em `data`.
  const data = (raw.data && typeof raw.data === "object" ? raw.data : raw) as
    Record<string, unknown>;
  const pix = (data.pix ?? {}) as Record<string, unknown>;
  const qrCode = String(pix.qrcode ?? pix.qrCode ?? "");
  if (!qrCode) {
    throw new Error("SharkBanking não retornou pix.qrcode (copia-e-cola).");
  }
  return {
    id: String(data.id ?? ""),
    status: String(data.status ?? "waiting_payment").toUpperCase(),
    qrCode,
    expiresAt:
      (pix.expirationDate as string) ?? (data.expiresAt as string) ?? null,
    raw,
  };
}

// ----------- PIX status (anti-forge / recovery) -----------

export async function getPaymentStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<{ status: string; raw: unknown }> {
  const res = await fetch(
    `${BASE_URL}/transactions/${encodeURIComponent(providerId)}`,
    {
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  const text = await res.text();
  let raw: { data?: { status?: string }; status?: string; message?: unknown } =
    {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // body não-JSON → erro genérico
  }
  if (!res.ok) {
    throw new Error(
      `SharkBanking getPaymentStatus ${res.status}: ${
        raw.message ? JSON.stringify(raw.message) : text.slice(0, 120) || "empty"
      }`,
    );
  }
  return {
    status: String(raw.data?.status ?? raw.status ?? "UNKNOWN").toUpperCase(),
    raw,
  };
}

// ----------- Balance -----------

export type SharkBalance = { amountCents: number; raw: unknown };

export async function getBalance(creds?: SafePixCreds): Promise<SharkBalance> {
  // Timeout 12s + 1 retry (mesmo motivo do SafePix): soluço momentaneo abortava
  // a chamada e o erro grudava no painel. 2a tentativa rapida resolve.
  const auth = authHeader(creds);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/balance/available`, {
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(12000),
      });
      const text = await res.text();
      let raw: {
        amount?: number;
        data?: { amount?: number };
        message?: unknown;
      } = {};
      try {
        if (text.trim().length > 0) raw = JSON.parse(text);
      } catch {
        // erro genérico abaixo
      }
      if (!res.ok) {
        throw new Error(
          `SharkBanking balance ${res.status}: ${
            raw.message
              ? JSON.stringify(raw.message)
              : text.slice(0, 120) || "empty"
          }`,
        );
      }
      return {
        amountCents: Number(raw.amount ?? raw.data?.amount ?? 0),
        raw,
      };
    } catch (e) {
      lastErr = e;
      if (attempt < 2 && isTransientFetchError(e)) continue;
      break;
    }
  }
  throw normalizeFetchError(lastErr, "Shark saldo");
}

// ----------- Status helpers -----------

const PAID_STATUSES = new Set([
  "PAID",
  "APPROVED",
  "COMPLETED",
  "CONFIRMED",
  "SETTLED",
]);
const FAILED_STATUSES = new Set([
  "REFUSED",
  "CANCELLED",
  "CANCELED",
  "FAILED",
  "EXPIRED",
  "DECLINED",
]);
const REFUNDED_STATUSES = new Set(["REFUNDED", "CHARGEBACK"]);

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.has(status.toUpperCase().trim());
}
export function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.has(status.toUpperCase().trim());
}
export function isRefundedStatus(status: string): boolean {
  return REFUNDED_STATUSES.has(status.toUpperCase().trim());
}
