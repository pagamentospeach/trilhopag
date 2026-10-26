/**
 * AbacatePay provider — API v2 (migrado jun/2026).
 * Docs: https://docs.abacatepay.com  ·  Base: https://api.abacatepay.com/v2
 * Auth: header `Authorization: Bearer <api_key>` (abc_prod_… v2)
 *
 * PIX (QR inline — "transparente"):
 *   POST /transparents/create
 *     body { method:"PIX", data:{ amount(centavos), expiresIn(segundos),
 *            description, externalId, customer:{ name, cellphone, email, taxId },
 *            metadata } }
 *     → { success, data:{ id, brCode (copia-e-cola EMV), brCodeBase64,
 *                status, amount, expiresAt }, error }
 *   GET  /transparents/check?id=<id>
 *     → { success, data:{ id, status, expiresAt }, error }
 *
 * CARTÃO: na v2 é checkout HOSPEDADO via POST /checkouts/create, que exige
 * produtos pré-cadastrados (items:[{id,quantity}]). Como o gateway cobra valores
 * DINÂMICOS, createCardBilling cria um produto avulso on-the-fly com o preço
 * exato (POST /products/create) e então gera o checkout — retorna a URL hospedada
 * pra onde o cliente é redirecionado pra pagar no cartão. Habilitado só pra
 * adquirente white (Acquirer.supportsCard=true em "abacatepay"). Apple/Google Pay
 * a AbacatePay não oferece.
 *
 * A API responde `{ success, data, error }` — erro vem em `error` (string) com
 * `data:null`, então checamos `res.ok` + `error`.
 *
 * Status possíveis: PENDING | PAID | EXPIRED | CANCELLED | REFUNDED.
 *
 * Reaproveita os TIPOS do safepix (CreatePixOptions / SafePixChargeResult /
 * SafePixCreds) pra plugar DIRETO no dispatcher (HANDLERS) sem adapter — a
 * `secretKey` das creds carrega a API key da AbacatePay v2 (publicKey é ignorada).
 */
import type {
  CreatePixOptions,
  SafePixChargeResult,
  SafePixCreds,
} from "./safepix";

const BASE_URL = "https://api.abacatepay.com/v2";

function apiKeyFrom(creds?: SafePixCreds): string {
  // A AbacatePay tem UMA chave (Bearer). Guardamos ela como secretKey da
  // Acquirer (encriptada); publicKey não é usada. Fallback no env (legacy/1 conta).
  const key = creds?.secretKey || process.env.ABACATEPAY_API_KEY;
  if (!key) throw new Error("AbacatePay API key missing.");
  return key;
}

function authHeaders(creds?: SafePixCreds) {
  return {
    Authorization: `Bearer ${apiKeyFrom(creds)}`,
    "Content-Type": "application/json",
  };
}

// ----------- PIX charge -----------

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  const body = {
    // v2: método no topo + payload aninhado em `data`.
    method: "PIX" as const,
    data: {
      // amount em CENTAVOS (igual ao nosso amountCents).
      amount: opts.amountCents,
      // expiração em SEGUNDOS — 1h é folgado pra um checkout PIX.
      expiresIn: 3600,
      description: (opts.items[0]?.title ?? "Pagamento").slice(0, 140),
      // referência da nossa tx (aparece no painel e ajuda a casar webhook).
      ...(opts.metadata?.transaction_id
        ? { externalId: opts.metadata.transaction_id }
        : {}),
      customer: {
        name: opts.customer.name || "Cliente",
        email: opts.customer.email,
        ...(opts.customer.phone ? { cellphone: opts.customer.phone } : {}),
        ...(opts.customer.document?.number
          ? { taxId: opts.customer.document.number }
          : {}),
      },
      ...(opts.metadata ? { metadata: opts.metadata } : {}),
    },
  };

  // FANOUT-AWARE TIMEOUT (jun/2026): timeout 5s + signal externo (cancel quando
  // outra adquirente já venceu o Promise.any). Antes 12s→7s→5s — segurava o
  // checkout demais quando a AbacatePay travava.
  const timeoutSignal = AbortSignal.timeout(5000);
  const combined = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;
  const res = await fetch(`${BASE_URL}/transparents/create`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify(body),
    signal: combined,
  });

  const raw = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown> | null;
    error?: unknown;
  };
  if (!res.ok || raw?.error) {
    throw new Error(
      `AbacatePay ${res.status}: ${JSON.stringify(raw?.error ?? raw)}`,
    );
  }

  const data = (raw.data ?? raw) as Record<string, unknown>;
  const brCode = String(data.brCode ?? "");
  if (!brCode) {
    throw new Error("AbacatePay não retornou brCode (copia-e-cola PIX).");
  }
  return {
    id: String(data.id ?? ""),
    status: String(data.status ?? "PENDING").toUpperCase(),
    qrCode: brCode,
    expiresAt: (data.expiresAt as string) ?? null,
    raw,
  };
}

// ----------- PIX status (anti-forge / recovery) -----------

export async function getPaymentStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<{ status: string; raw: unknown }> {
  const res = await fetch(
    `${BASE_URL}/transparents/check?id=${encodeURIComponent(providerId)}`,
    { headers: authHeaders(creds), signal: AbortSignal.timeout(12000) },
  );
  const text = await res.text();
  let raw: { data?: { status?: string }; error?: unknown } = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // body não-JSON → trata como erro genérico abaixo
  }
  if (!res.ok || raw?.error) {
    throw new Error(
      `AbacatePay check ${res.status}: ${
        raw?.error ? JSON.stringify(raw.error) : text.slice(0, 120) || "empty"
      }`,
    );
  }
  return {
    status: String(raw.data?.status ?? "UNKNOWN").toUpperCase(),
    raw,
  };
}

// ----------- Cartão (billing hospedado) -----------

export type AbacateCardBillingResult = {
  id: string;
  url: string;
  status: string;
  raw: unknown;
};

export async function createCardBilling(
  opts: {
    amountCents: number;
    description: string;
    externalRef: string;
    returnUrl: string;
    completionUrl: string;
    customer: { name: string; email: string; phone?: string; taxId?: string };
  },
  creds?: SafePixCreds,
): Promise<AbacateCardBillingResult> {
  // v2: cartão = checkout HOSPEDADO. O /checkouts/create só aceita produtos
  // pré-cadastrados (items:[{id,quantity}]), então criamos um produto avulso
  // on-the-fly com o preço EXATO da cobrança e geramos o checkout. O cliente
  // preenche os dados do cartão na página hospedada da AbacatePay (a URL).
  const productExternalId = `tp_${(opts.externalRef || "card").slice(0, 40)}_${Date.now()}`;
  const prodRes = await fetch(`${BASE_URL}/products/create`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify({
      externalId: productExternalId,
      name: (opts.description || "Pagamento").slice(0, 120),
      price: opts.amountCents,
      currency: "BRL",
    }),
    signal: AbortSignal.timeout(12000),
  });
  const prodRaw = (await prodRes.json().catch(() => ({}))) as {
    data?: { id?: string } | null;
    error?: unknown;
  };
  if (!prodRes.ok || prodRaw?.error || !prodRaw?.data?.id) {
    throw new Error(
      `AbacatePay product ${prodRes.status}: ${JSON.stringify(prodRaw?.error ?? prodRaw)}`,
    );
  }
  const productId = String(prodRaw.data.id);

  const res = await fetch(`${BASE_URL}/checkouts/create`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify({
      items: [{ id: productId, quantity: 1 }],
      methods: ["CARD"],
      returnUrl: opts.returnUrl,
      completionUrl: opts.completionUrl,
      ...(opts.externalRef ? { externalId: opts.externalRef } : {}),
    }),
    signal: AbortSignal.timeout(12000),
  });
  const raw = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown> | null;
    error?: unknown;
  };
  if (!res.ok || raw?.error) {
    throw new Error(
      `AbacatePay checkout ${res.status}: ${JSON.stringify(raw?.error ?? raw)}`,
    );
  }
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const checkoutUrl = String(data.url ?? "");
  if (!checkoutUrl) {
    throw new Error("AbacatePay checkout não retornou url de pagamento.");
  }
  return {
    id: String(data.id ?? ""),
    url: checkoutUrl,
    status: String(data.status ?? "PENDING").toUpperCase(),
    raw,
  };
}

// ----------- Webhook event → status + helpers -----------

/**
 * Mapeia o nome do evento do webhook pra um status quando o payload não traz
 * `data.status`. Eventos AbacatePay (doc jun/2026):
 *   PIX inline (pixQrCode/transparente): transparent.completed | .refunded | .disputed
 *   Checkout hospedado:                   checkout.completed   | .refunded | .disputed
 *   Assinatura:                           subscription.completed | .cancelled | .renewed
 *   Saque/transferência:                  payout.* | transfer.*
 * Regra: *.completed → PAID, *.refunded → REFUNDED, *.cancel/fail/expired → EXPIRED.
 * disputed NÃO é mapeado (não rebaixa uma tx já PAGA — disputa é tratada à parte).
 */
export function eventToStatus(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("refund")) return "REFUNDED";
  if (e.includes("paid") || e.includes("completed")) return "PAID";
  if (
    e.includes("cancel") ||
    e.includes("fail") ||
    e.includes("expired")
  ) {
    return "EXPIRED";
  }
  return "";
}

const PAID_STATUSES = new Set([
  "PAID",
  "APPROVED",
  "COMPLETED",
  "CONFIRMED",
  "SETTLED",
]);
const FAILED_STATUSES = new Set([
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "FAILED",
  "REFUSED",
  "DECLINED",
]);

/**
 * DISPUTA / MED PIX. A AbacatePay dispara `*.disputed` (e pode mandar
 * data.status com algum destes) quando abre uma disputa / MED PIX no
 * recebimento. Tratamos como CHARGEBACK na Trilho (debita o seller +
 * taxa via markTransactionChargedback) pra a perda CONSTAR pro player e no
 * admin — antes caía no vazio (nenhum branch processava).
 */
const DISPUTED_STATUSES = new Set([
  "DISPUTED",
  "DISPUTE",
  "IN_DISPUTE",
  "CHARGEBACK",
  "PRECHARGEBACK",
  "IN_PROTEST",
  "PROTESTED",
  "MED",
]);

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.has(status.toUpperCase().trim());
}
export function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.has(status.toUpperCase().trim());
}
export function isRefundedStatus(status: string): boolean {
  return status.toUpperCase().trim() === "REFUNDED";
}
export function isDisputedStatus(status: string): boolean {
  return DISPUTED_STATUSES.has(status.toUpperCase().trim());
}
/** True se o NOME do evento indica disputa (ex.: "transparent.disputed"). */
export function isDisputeEvent(event: string): boolean {
  return event.toLowerCase().includes("disput");
}
