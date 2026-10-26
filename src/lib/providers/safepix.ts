/**
 * SafePix provider.
 * Docs: https://safepix.readme.io/reference/introdução
 * Endpoints:
 *   POST /v1/payment-transaction/create          (cria cobranças Pix/cartão/boleto)
 *   POST /v1/wallet-transaction/create/withdrawal (saque/transferência Pix)
 *   GET  /v1/dashboard/balance                    (saldo)
 *   POST postback                                  (webhook)
 * Auth: Basic base64(public_key:secret_key)
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

const BASE_URL = "https://api.safepix.pro/v1";

/**
 * Proxy de IP FIXO usado SÓ nos SAQUES/transferências (a SafePix exige que o IP
 * de origem esteja na allowlist pra "saques externos"; o Vercel rotaciona o IP
 * de saída, então sem isso vira gato-e-rato). Charges (cobranças) e saldo NÃO
 * passam pelo proxy — continuam diretos. Configurável via env SAFEPIX_PROXY_URL
 * (ex: http://user:pass@host:porta). SEM a env → conexão direta (comportamento
 * antigo, zero mudança). O ProxyAgent é cacheado no módulo (pool de conexões).
 */
let _withdrawProxy: ProxyAgent | null | undefined;
function withdrawDispatcher(): ProxyAgent | undefined {
  if (_withdrawProxy === undefined) {
    const url = process.env.SAFEPIX_PROXY_URL;
    if (url) {
      try {
        _withdrawProxy = new ProxyAgent(url);
      } catch {
        _withdrawProxy = null;
      }
    } else {
      _withdrawProxy = null;
    }
  }
  return _withdrawProxy ?? undefined;
}

/**
 * Credenciais da SafePix. Quando passadas explicitamente (creds) usa elas;
 * senão cai no env (legacy, suporta 1 conta global).
 */
export type SafePixCreds = {
  publicKey: string;
  secretKey: string;
};

function authHeader(creds?: SafePixCreds) {
  const pub = creds?.publicKey ?? process.env.SAFEPIX_PUBLIC_KEY;
  const sec = creds?.secretKey ?? process.env.SAFEPIX_SECRET_KEY;
  if (!pub || !sec) {
    throw new Error("SAFEPIX credentials missing.");
  }
  const token = Buffer.from(`${pub}:${sec}`).toString("base64");
  return `Basic ${token}`;
}

// ----------- Pix charge -----------

export type SafePixCustomer = {
  name: string;
  email: string;
  document: { number: string; type: "cpf" | "cnpj" };
  phone?: string;
  /**
   * Endereco do cliente. Opcional. Alguns providers (ex: Caju/WOOVI 2 com
   * Pix Automatico) EXIGEM address completo — se ausente, o provider gera
   * placeholder valido pra nao bloquear geracao do PIX.
   */
  address?: {
    zipcode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
};

export type SafePixItem = {
  title: string;
  unit_price: number;
  quantity: number;
  tangible: boolean;
  external_ref?: string;
};

export type CreatePixOptions = {
  amountCents: number;
  postbackUrl: string;
  customer: SafePixCustomer;
  items: SafePixItem[];
  metadata?: Record<string, string>;
  ip?: string;
  /**
   * AbortSignal externo (do dispatcher) pra cancelar a chamada quando outra
   * adquirente do FANOUT paralelo já venceu. Cada provider faz
   * `AbortSignal.any([signal, AbortSignal.timeout(X)])` pra combinar com seu
   * timeout interno. Quando ausente, comportamento legado (só timeout próprio).
   */
  signal?: AbortSignal;
  /**
   * Timeout interno do fetch em ms. Default 5000 (tuned pro FANOUT do checkout,
   * onde só importa a adquirente MAIS RÁPIDA da corrida). Caminhos que precisam
   * que CADA conta responda — ex: admin gerar PIX / atualizar nominais — passam
   * um valor maior (ex: 25000), porque contas SafePix mais lentas levam ~8s e
   * com 5s davam "aborted due to timeout".
   */
  timeoutMs?: number;
};

export type SafePixChargeResult = {
  id: string;
  status: string;
  qrCode: string;
  expiresAt: string | null;
  raw: unknown;
};

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  // SafePix EXIGE um metadata NÃO-VAZIO (jun/2026 a API passou a rejeitar
  // `{}` com 400 "O json metadata é obrigatório.", quebrando todo PIX sem
  // metadata — ex: Cobranças). Garante sempre ao menos uma chave.
  const metadata =
    opts.metadata && Object.keys(opts.metadata).length > 0
      ? opts.metadata
      : { source: "trilhopag" };

  const body = {
    amount: opts.amountCents,
    payment_method: "pix" as const,
    postback_url: opts.postbackUrl,
    customer: opts.customer,
    items: opts.items,
    metadata,
    ...(opts.ip ? { ip: opts.ip } : {}),
  };

  // FANOUT-AWARE TIMEOUT (jun/2026): timeout default 5s + signal externo do
  // dispatcher pra cancelar quando OUTRA adquirente já venceu o Promise.any. Sem
  // segurar carga no PSP perdedor. 5s é folga sobre o ~1s típico e corta rápido
  // um PSP travado — o fanout paralelo cobre o resto. Caminhos non-fanout (admin
  // gerar PIX / nominais) passam timeoutMs maior porque PRECISAM de cada conta.
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  const combined = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;
  const res = await fetch(`${BASE_URL}/payment-transaction/create`, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: combined,
  });

  const raw = await res.json();
  if (!res.ok || !raw.success) {
    throw new Error(
      `SafePix ${res.status}: ${JSON.stringify(raw.error_messages ?? raw)}`,
    );
  }

  const data = raw.data;
  return {
    id: data.id,
    status: String(data.status ?? "PENDING").toUpperCase(),
    qrCode: data.pix?.qr_code ?? "",
    expiresAt: data.pix?.expiration_date ?? null,
    raw,
  };
}

// ----------- Get payment status (recovery) -----------

/**
 * Busca o status atual de uma cobrança Pix pela API SafePix. Usado pelo
 * script de recovery (recover-stuck-safepix-txs.ts) pra polar transactions
 * stuck PENDING e confirmar se foram ou nao pagas no lado SafePix.
 */
export async function getPaymentStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<{ status: string; raw: unknown }> {
  const res = await fetch(
    `${BASE_URL}/payment-transaction/${encodeURIComponent(providerId)}`,
    {
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  // SafePix retorna body vazio em 401/404. Parse condicional pra evitar
  // "Unexpected end of JSON input".
  const text = await res.text();
  let raw: { success?: boolean; data?: { status?: string }; error_messages?: unknown } = {};
  try {
    if (text.trim().length > 0) {
      raw = JSON.parse(text);
    }
  } catch {
    // body nao-JSON; trata como erro generico
  }
  if (!res.ok || raw.success === false) {
    throw new Error(
      `SafePix getPaymentStatus ${res.status}: ${
        raw.error_messages
          ? JSON.stringify(raw.error_messages)
          : text.slice(0, 100) || "empty body"
      }`,
    );
  }
  return {
    status: String(raw.data?.status ?? "UNKNOWN").toUpperCase(),
    raw,
  };
}

/**
 * Busca o status de uma TRANSFERÊNCIA (saque) pela API SafePix. Usado pelo cron
 * reconcile-withdrawals pra resolver saques AUTO travados em PROCESSING quando o
 * webhook safepix-transfer não chegou. Endpoint:
 *   GET /v1/wallet-transaction/{id}
 * SafePix devolve body vazio em 401/404 (id de outra conta / inexistente) — por
 * isso o reconcile usa as creds da conta que ENVIOU (providerAccount) e trata
 * qualquer erro como "não confirmado" (não mexe no saque).
 */
export async function getWithdrawalStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<{ status: string; raw: unknown }> {
  const dispatcher = withdrawDispatcher();
  const res = await undiciFetch(
    `${BASE_URL}/wallet-transaction/${encodeURIComponent(providerId)}`,
    {
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
      ...(dispatcher ? { dispatcher } : {}),
    },
  );
  const text = await res.text();
  let raw: {
    success?: boolean;
    data?: { status?: string };
    status?: string;
    error_messages?: unknown;
  } = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // body não-JSON; trata como erro genérico
  }
  if (!res.ok || raw.success === false) {
    throw new Error(
      `SafePix getWithdrawalStatus ${res.status}: ${
        raw.error_messages
          ? JSON.stringify(raw.error_messages)
          : text.slice(0, 100) || "empty body"
      }`,
    );
  }
  return {
    status: String(raw.data?.status ?? raw.status ?? "UNKNOWN").toUpperCase(),
    raw,
  };
}

// ----------- Balance -----------

export type SafePixBalance = { amountCents: number; raw: unknown };

export async function getBalance(creds?: SafePixCreds): Promise<SafePixBalance> {
  // Timeout 12s + 1 retry: a SafePix as vezes da um soluço (CloudFlare/queda
  // momentanea) que abortava a 1a tentativa e "grudava" o erro no painel admin.
  // Uma 2a tentativa rapida resolve a esmagadora maioria desses casos.
  const auth = authHeader(creds);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/dashboard/balance`, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(12000),
      });
      const raw = await res.json();
      if (!res.ok || !raw.success) {
        throw new Error(`SafePix balance ${res.status}: ${JSON.stringify(raw)}`);
      }
      return { amountCents: Number(raw.data?.amount ?? 0), raw };
    } catch (e) {
      lastErr = e;
      // Timeout/rede → tenta de novo (uma vez). Erro de credencial/HTTP nao
      // se resolve com retry: relança na hora.
      if (attempt < 2 && isTransientFetchError(e)) continue;
      break;
    }
  }
  throw normalizeFetchError(lastErr, "SafePix saldo");
}

/** True pra erros que valem retry: timeout do AbortSignal ou falha de rede. */
export function isTransientFetchError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "TimeoutError") return true;
  if (e instanceof Error) {
    const n = e.name;
    const m = e.message.toLowerCase();
    return (
      n === "TimeoutError" ||
      n === "AbortError" ||
      m.includes("timeout") ||
      m.includes("aborted") ||
      m.includes("fetch failed") ||
      m.includes("network") ||
      m.includes("econnreset") ||
      m.includes("etimedout")
    );
  }
  return false;
}

/** Converte o erro cru ("The operation was aborted due to timeout") numa
 *  mensagem curta e legivel pro painel admin. */
export function normalizeFetchError(e: unknown, ctx: string): Error {
  if (
    (e instanceof DOMException && e.name === "TimeoutError") ||
    (e instanceof Error &&
      (e.name === "TimeoutError" ||
        e.message.toLowerCase().includes("aborted due to timeout")))
  ) {
    return new Error(`${ctx}: timeout (12s) — adquirente lenta/instavel`);
  }
  if (e instanceof Error) return new Error(`${ctx}: ${e.message}`);
  return new Error(`${ctx}: erro desconhecido`);
}

// ----------- Withdrawal (transfer) -----------

export type PixKeyType = "cpf" | "cnpj" | "evp" | "phone" | "email";

export type CreateWithdrawalOptions = {
  amountReais: number;
  pixKey: string;
  pixKeyType: PixKeyType;
  postbackUrl: string;
  metadata?: Record<string, string>;
};

export type SafePixWithdrawalResult = {
  id: string;
  status: string;
  raw: unknown;
};

/**
 * 23/07/2026 (davi): "na safe pix é 2,50" — mesma correcao aplicada pra
 * Pluggou. A SafePix desconta R$ 2,50 (fee de transferencia) do amount
 * que a gente envia; sem essa compensacao o seller recebe R$ 2,50 menos
 * do que o payoutCents esperado.
 */
const SAFEPIX_TRANSFER_FEE_REAIS = 2.5;

export async function createWithdrawal(
  opts: CreateWithdrawalOptions,
  creds?: SafePixCreds,
): Promise<SafePixWithdrawalResult> {
  // Inflaciona o amount pra que APOS a deducao do fee SafePix o seller
  // receba EXATAMENTE o payoutCents esperado.
  const inflatedAmount = opts.amountReais + SAFEPIX_TRANSFER_FEE_REAIS;
  const body = {
    pix_key: opts.pixKey,
    pix_type: opts.pixKeyType,
    amount: inflatedAmount,
    postback_url: opts.postbackUrl,
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
  };

  const dispatcher = withdrawDispatcher();
  const res = await undiciFetch(`${BASE_URL}/wallet-transaction/create/withdrawal`, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
    ...(dispatcher ? { dispatcher } : {}),
  });

  const raw = (await res.json()) as {
    success?: boolean;
    data?: Record<string, unknown>;
    error_messages?: unknown;
    [k: string]: unknown;
  };
  if (!res.ok || !raw.success) {
    throw new Error(
      `SafePix withdrawal ${res.status}: ${JSON.stringify(raw.error_messages ?? raw)}`,
    );
  }

  const data = (raw.data ?? raw) as Record<string, unknown>;
  return {
    id: String(data.id ?? data.Id ?? ""),
    status: String(data.status ?? data.Status ?? "PENDING").toUpperCase(),
    raw,
  };
}

// ----------- Status helpers -----------

// Status de "pago/concluído". Cobranças usam APPROVED/PAID; SAQUES (transfer)
// podem reportar a conclusão com outra palavra (COMPLETED/DONE/etc) — por isso
// a lista é abrangente. Só termos inequívocos de sucesso (NÃO inclui PROCESSING).
const PAID_STATUSES = new Set([
  "APPROVED",
  "PAID",
  "AUTHORIZED",
  "COMPLETED",
  "COMPLETE",
  "DONE",
  "SUCCESS",
  "SUCCEEDED",
  "SETTLED",
  "CONFIRMED",
  "FINISHED",
  "TRANSFERRED",
  "PAID_OUT",
]);
const FAILED_STATUSES = new Set([
  "FAILED",
  "FAILURE",
  "CANCELED",
  "CANCELLED",
  "DECLINED",
  "REJECTED",
  "ERROR",
  "RETURNED",
  "REVERSED",
]);

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.has(status.toUpperCase().trim());
}
export function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.has(status.toUpperCase().trim());
}
export function isRefundedStatus(status: string): boolean {
  return status.toUpperCase() === "REFUNDED";
}
