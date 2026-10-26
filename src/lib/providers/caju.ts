/**
 * Caju provider — intermediador que agrupa multiplas adquirentes reais
 * (Woovi, Pagar.me, Valana, etc) atras de UMA API + SUB-KEYS.
 *
 * Docs: fornecidas pelo suporte da Caju (10/07/2026, david).
 * Base: https://cajuback-scvk.onrender.com
 *
 * Auth (2 modos suportados):
 *   A) API_KEY PRINCIPAL (usa a "adquirente ativa" do painel da Caju):
 *      - key comeca com "caju_apikey_"
 *      - `api_key` vai no BODY do POST /create-pix
 *
 *   B) SUB-KEY (usa a rota interna vinculada aquela sub-key — permite
 *      multiplas NOMINAIS, cada uma processada por uma adquirente diferente):
 *      - key comeca com "subkey_"
 *      - Authorization: Bearer <sub-key> no header do POST /api/subapi
 *      - Body simplificado (sem api_key)
 *
 * Auto-deteccao: olhamos o prefix da `secretKey` da Acquirer no Trilho.
 * Isso permite cadastrar N sub-keys como N Acquirer separadas (com codes
 * "caju-woovi", "caju-pagarme", "caju-valana", etc.) e ainda funcionar
 * quando so tem 1 conta com api_key principal.
 *
 * Endpoints:
 *   POST /create-pix                   cria PIX (api_key no body)
 *   POST /create-pix3                  rota alternativa (mesmo formato)
 *   POST /api/subapi                   cria PIX via sub-key (Bearer)
 *   GET  /api/vendas/{txid}/status     consulta status (x-api-key MASTER)
 *
 * 01/08/2026 (davi, "conecta aqui denovo a caju com o gateway"): a Caju
 * finalmente entregou endpoint de status FUNCIONAL. Testado ao vivo:
 *
 *   GET /api/vendas/{txid}/status  +  header x-api-key: caju_apikey_...
 *     → 200 {"txid":"...","status":"waiting_payment"}          ✅
 *
 *   O antigo /api/bravive-payment-status/{txid} continua quebrado, e de um
 *   jeito traicoeiro: devolve HTTP **200** com corpo {"message":"Payment not
 *   found","code":"NOT_FOUND"}. Como o codigo checava so `res.ok`, o erro
 *   passava batido e getPaymentStatus retornava status "UNKNOWN" pra tudo.
 *
 *   PEGADINHA: a consulta de status SO funciona com a api_key MASTER. A
 *   sub-key devolve 404 "Venda nao encontrada para esse txid" MESMO pra
 *   venda criada por ela propria. Por isso lemos CAJU_API_KEY do env e nao
 *   a secretKey da Acquirer (que na pratica e sempre uma sub-key).
 *
 * Webhook:
 *   POST trilhopag.com/api/webhooks/caju  (URL configurada no painel da Caju)
 *   O user configurou esse URL manualmente na Caju — a Caju vai bater ai
 *   quando o PIX for pago. Anti-forge: re-consulta getPaymentStatus (voltou
 *   a existir agora que o endpoint funciona), com fail-open se a consulta
 *   cair — ver comentario no route handler.
 *
 * Formato:
 *   - amount SEMPRE em centavos (integer).
 *   - customer.cellphone: DDD + numero (so digitos, ex: "11999999999").
 *   - customer.taxId: CPF/CNPJ so digitos.
 *   - resposta: { pix_code, txid, qr_code_base64? }
 *
 * Reaproveita TIPOS do SafePix (CreatePixOptions, SafePixChargeResult,
 * SafePixCreds) — plugado direto no dispatcher via getHandler("caju*").
 */
import type {
  CreatePixOptions,
  SafePixChargeResult,
  SafePixCreds,
} from "./safepix";
import { randomCPF } from "../fake-customer";

const BASE_URL = "https://cajuback-scvk.onrender.com";

function detectAuthMode(secretKey: string): "subkey" | "apikey" {
  return secretKey.startsWith("subkey_") ? "subkey" : "apikey";
}

/**
 * Address placeholder valido — usado quando o cliente nao mandou endereco
 * e a sub-key exige (ex: WOOVI 2 = Pix Automatico Woovi). Sao Paulo/SP
 * porque eh o CEP mais reconhecido, evita falhas de validacao regional.
 */
function fallbackAddress() {
  return {
    zipcode: "04556300",
    street: "Rua Exemplo",
    number: "123",
    neighborhood: "Vila Ex",
    city: "São Paulo",
    state: "SP",
    complement: "",
  };
}

/**
 * Monta o address pro body Caju usando o que o customer mandou +
 * fallback pra campos vazios. Garante que TODOS os campos exigidos pela
 * WOOVI 2 (zipcode, street, number, neighborhood, city, state) estao
 * preenchidos.
 */
function buildAddress(customerAddress?: {
  zipcode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}) {
  const fb = fallbackAddress();
  const digits = (v?: string) => (v ?? "").replace(/\D/g, "");
  return {
    zipcode: digits(customerAddress?.zipcode) || fb.zipcode,
    street: (customerAddress?.street ?? "").trim() || fb.street,
    number: (customerAddress?.number ?? "").trim() || fb.number,
    neighborhood:
      (customerAddress?.neighborhood ?? "").trim() || fb.neighborhood,
    city: (customerAddress?.city ?? "").trim() || fb.city,
    state: (customerAddress?.state ?? "").trim() || fb.state,
    complement: (customerAddress?.complement ?? "").trim(),
  };
}

function extractErrorMsg(body: Record<string, unknown>): string {
  const detalhesMsg = (body.detalhes as Record<string, unknown> | undefined)
    ?.message;
  return String(body.error ?? body.message ?? detalhesMsg ?? "").toLowerCase();
}

/**
 * Detalhes internos que a Caju/pagar.me coloca em `detalhes.error` ou
 * `detalhes.errors` (plural). Ex: "Amount exceeds single transaction limit",
 * "O campo amount deve ser pelo menos 500". `body.error` sozinho fica sempre
 * "Erro ao criar pagamento" — a razão real vive aqui.
 *
 * 18/07/2026 (davi: bug do sssclaudecode reclamando que nao gera com pagarme):
 * isTransientError olhava só `body.error` e classificava "Erro ao criar
 * pagamento" como transiente. Fazia 3 retries num erro determinístico
 * de limite de valor. Agora inspecionamos os detalhes pra classificar direito.
 */
function extractDetalhesMsg(body: Record<string, unknown>): string {
  const detalhes = body.detalhes as Record<string, unknown> | undefined;
  if (!detalhes) return "";
  return String(
    detalhes.error ?? detalhes.errors ?? detalhes.message ?? "",
  ).toLowerCase();
}

/**
 * Erros DETERMINÍSTICOS de limite de valor da conta PSP (pagar.me/etc). NÃO
 * faz sentido retry — o valor é o mesmo. Ex do dia 18/07/2026: seller
 * sssclaudecode com sub-key pagar.me limitada a R$5-200/tx tentando gerar
 * R$247. Retornava 422 com "Amount exceeds single transaction limit"
 * no detalhes. Precisa cair pra próxima adquirente do fanout, não perder
 * ~700ms retentando em vão.
 */
function isAmountLimitError(body: Record<string, unknown>): boolean {
  const detalhes = extractDetalhesMsg(body);
  return (
    detalhes.includes("amount exceeds") ||
    detalhes.includes("exceeds single transaction limit") ||
    detalhes.includes("deve ser pelo menos") ||
    detalhes.includes("valor mínimo") ||
    detalhes.includes("valor maximo") ||
    detalhes.includes("valor máximo")
  );
}

/**
 * Erros que indicam VALIDACAO estrita de dados do cliente (CPF em blacklist,
 * telefone invalido, etc). Retry com CPF fake pode ajudar. Ex: VALANA
 * rejeita CPFs matematicamente validos que estao em blacklist interna.
 */
function isCustomerValidationError(body: Record<string, unknown>, status: number): boolean {
  if (status < 400 || status >= 500) return false;
  const msg = extractErrorMsg(body);
  const detalhes = extractDetalhesMsg(body);
  return (
    msg.includes("invalid cpf") ||
    msg.includes("cpf inv") ||
    msg.includes("invalid document") ||
    msg.includes("invalid phone") ||
    msg.includes("invalid email") ||
    detalhes.includes("invalid cpf") ||
    detalhes.includes("cpf inv") ||
    detalhes.includes("invalid document")
  );
}

/**
 * Erros TRANSIENTES (rede interna Caju, backend do PSP fora do ar, timeout
 * do downstream). Retry SEM mudar nada resolve. VALANA notadamente devolve
 * "Erro ao criar pagamento Velana" com "SecureProxy-D" ~15-20% do tempo.
 *
 * IMPORTANTE (18/07/2026): checa AmountLimit ANTES pra evitar falso positivo
 * — "Erro ao criar pagamento" é a chave genérica que a Caju devolve pra
 * QUALQUER erro (limite, blacklist, etc). Sem esse check adicional, todos
 * viravam "transiente" e comíamos 3 retries em vão.
 */
function isTransientError(body: Record<string, unknown>, status: number): boolean {
  if (status >= 500) return true;
  // Guard: erros determinísticos NUNCA são transientes.
  if (isAmountLimitError(body)) return false;
  const msg = extractErrorMsg(body);
  return (
    msg.includes("erro ao criar pagamento") ||
    msg.includes("secureproxy") ||
    msg.includes("timeout") ||
    msg.includes("temporar") ||
    msg.includes("upstream")
  );
}

// ----------- PIX charge -----------

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  const secretKey = creds?.secretKey ?? process.env.CAJU_API_KEY;
  if (!secretKey) {
    throw new Error(
      "Caju credentials missing (api_key ou sub-key em Acquirer.secretKeyEnc ou CAJU_API_KEY).",
    );
  }

  const mode = detectAuthMode(secretKey);

  // Normaliza dados do cliente pro formato Caju.
  const taxId = (opts.customer.document?.number ?? "").replace(/\D/g, "");
  const cellphone = (opts.customer.phone ?? "").replace(/\D/g, "");
  const name = opts.customer.name || "Cliente";
  const email = opts.customer.email || "cliente@trilhopag.com";

  // Description = titulo do 1o item (Caju exige description curta).
  const description =
    (opts.items?.[0]?.title ?? "Pagamento").slice(0, 100).trim() ||
    "Pagamento";

  /**
   * Helper que monta o body pra uma tentativa. Aceita override do taxId
   * pro retry com CPF fake em caso de "invalid cpf".
   *
   * NOTA (10/07/2026): sempre inclui `address` no body — algumas sub-keys
   * (WOOVI 2 = Pix Automatico Woovi) EXIGEM address. As outras ignoram.
   * Melhor mandar sempre que provar erro em runtime.
   */
  function buildBody(taxIdOverride?: string): Record<string, unknown> {
    const effectiveTaxId = taxIdOverride ?? taxId;
    const customer = {
      name,
      email,
      cellphone,
      taxId: effectiveTaxId,
      address: buildAddress(opts.customer.address),
    };
    if (mode === "subkey") {
      // Sempre inclui description CURTA (max 25 chars) — a WOOVI 2 (Pix
      // Automatico) usa description como "comentário" e rejeita se passar
      // de 30 chars. Sem description, Caju gera default longo e falha.
      return {
        amount: opts.amountCents,
        description: description.slice(0, 25),
        customer,
      };
    }
    return {
      amount: opts.amountCents,
      description,
      api_key: secretKey,
      customer,
    };
  }

  const url =
    mode === "subkey" ? `${BASE_URL}/api/subapi` : `${BASE_URL}/create-pix`;
  const headers: Record<string, string> =
    mode === "subkey"
      ? {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        }
      : { "Content-Type": "application/json" };

  // FANOUT-AWARE TIMEOUT (mesmo padrao do safepix/pluggou/sharkhub):
  // timeout interno + signal externo pra cortar quando outra adquirente
  // vence o Promise.any. Caju roda em Render — cold start pode chegar
  // a 15s, entao damos 8s por default (fanout mata em 2-3s de qualquer
  // forma se outra vencer).
  const externalSignal = opts.signal;
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  const combined = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;

  async function attempt(bodyObj: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyObj),
      signal: combined,
    });
    const text = await res.text();
    let raw: Record<string, unknown> = {};
    try {
      if (text.trim().length > 0) raw = JSON.parse(text);
    } catch {
      // body nao-JSON
    }
    return { ok: res.ok, status: res.status, text, raw };
  }

  // 1a tentativa com dados originais.
  let r = await attempt(buildBody());

  // Retry #1: erro TRANSIENTE (~500 / SecureProxy / upstream). Mesmo dados,
  // 200ms de backoff. VALANA e o principal caso — falha ~15-20% e volta na
  // 2a tentativa.
  if (!r.ok && isTransientError(r.raw, r.status)) {
    console.warn(
      `[caju] transient error ("${extractErrorMsg(r.raw).slice(0, 80)}") — retry #1`,
    );
    await new Promise((res) => setTimeout(res, 200));
    r = await attempt(buildBody());
  }

  // Retry #2: erro de VALIDACAO de cliente (invalid cpf/document/phone/email).
  // Tenta com CPF fake random. Algumas sub-keys (VALANA) rejeitam CPFs em
  // blacklist mesmo matematicamente validos.
  if (!r.ok && isCustomerValidationError(r.raw, r.status)) {
    console.warn(
      `[caju] validation error ("${extractErrorMsg(r.raw).slice(0, 80)}") — retentando com CPF fake`,
    );
    r = await attempt(buildBody(randomCPF()));
  }

  // Retry #3: se transiente denovo, uma ultima tentativa apos 500ms.
  if (!r.ok && isTransientError(r.raw, r.status)) {
    console.warn(`[caju] transient error again — retry #3 (last)`);
    await new Promise((res) => setTimeout(res, 500));
    r = await attempt(buildBody());
  }

  if (!r.ok) {
    // Extrai o motivo REAL (detalhes.error / detalhes.errors) — sem isso a
    // mensagem fica sempre "Erro ao criar pagamento" genérica e o admin
    // não consegue debugar. 18/07/2026 (davi).
    const detalhes = extractDetalhesMsg(r.raw);
    const generic =
      (r.raw.error as string) ??
      (r.raw.message as string) ??
      r.text.slice(0, 200) ??
      `HTTP ${r.status}`;
    const msg = detalhes ? `${generic} — ${detalhes}` : generic;
    throw new Error(`Caju ${r.status}: ${msg}`);
  }

  const pixCode = String(r.raw.pix_code ?? "");
  const txid = String(r.raw.txid ?? r.raw.id ?? "");
  if (!pixCode || !txid) {
    throw new Error(
      `Caju resposta incompleta (pix_code=${!!pixCode}, txid=${!!txid}), body=${r.text.slice(0, 200)}`,
    );
  }

  return {
    id: txid,
    status: "PENDING",
    qrCode: pixCode,
    // Caju nao devolve expires_at — deixamos null e o Trilho usa o default
    // (3600s a partir da criacao).
    expiresAt: null,
    raw: r.raw,
  };
}

// ----------- PIX charge status -----------

export type CajuTxStatus = {
  /** Status normalizado em UPPERCASE (APPROVED | PENDING | REFUSED | ...) */
  status: string;
  paidAt: string | null;
  raw: unknown;
};

/**
 * Consulta status do PIX.
 *   GET /api/vendas/{txid}/status   header  x-api-key: <api_key MASTER>
 *   → { txid, status: "waiting_payment" | "paid" | "MED" }
 *
 * A key usada aqui é SEMPRE a master (CAJU_API_KEY). Sub-key nao enxerga
 * a venda no endpoint de status — nem a que ela mesma criou (testado
 * 01/08/2026). `creds` so entra como fallback quando alguem cadastrou a
 * master direto na Acquirer.
 *
 * Lanca se nao houver master key configurada — o chamador decide se isso
 * e fatal ou se deve seguir sem confirmacao (ver webhook).
 */
export async function getPaymentStatus(
  providerId: string,
  creds?: SafePixCreds,
): Promise<CajuTxStatus> {
  const credKey = creds?.secretKey ?? "";
  const masterKey =
    process.env.CAJU_API_KEY ??
    (credKey.startsWith("caju_apikey_") ? credKey : "");

  if (!masterKey) {
    throw new Error(
      "Caju getPaymentStatus: CAJU_API_KEY (api_key master) nao configurada — " +
        "sub-key nao consegue consultar status.",
    );
  }

  const res = await fetch(
    `${BASE_URL}/api/vendas/${encodeURIComponent(providerId)}/status`,
    {
      method: "GET",
      headers: { "x-api-key": masterKey },
      signal: AbortSignal.timeout(10000),
    },
  );

  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // body nao-JSON
  }

  if (!res.ok) {
    throw new Error(
      `Caju getPaymentStatus ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  // GUARD (01/08/2026): o endpoint ANTIGO devolvia HTTP 200 com corpo de
  // erro ({"message":"Payment not found","code":"NOT_FOUND"}), entao `res.ok`
  // sozinho nao prova nada. Exige `status` presente e ausencia de `error`,
  // senao vira "UNKNOWN" silencioso e o anti-forge do webhook passa a
  // aprovar/rejeitar no escuro.
  const hasError =
    typeof raw.error === "string" || typeof raw.message === "string";
  const statusRaw = typeof raw.status === "string" ? raw.status : "";
  if (!statusRaw || hasError) {
    throw new Error(
      `Caju getPaymentStatus: resposta sem status (body=${text.slice(0, 200)})`,
    );
  }

  return {
    status: statusRaw.toUpperCase().trim(),
    paidAt: typeof raw.paid_at === "string" ? raw.paid_at : null,
    raw,
  };
}

// ----------- Status helpers -----------
// Caju usa vocabulario proprio: APPROVED (pagou), PENDING (aguardando),
// REFUSED (recusado/falhou). Nao ha REFUNDED/CHARGEBACK documentado —
// deixamos as helpers preparadas caso apareca no futuro.

/**
 * Vocabulario da Caju — ha DOIS, e aceitamos os dois:
 *
 *   WEBHOOK (10/07/2026):
 *     paid   → pagamento confirmado
 *     med    → Mecanismo Especial de Devolucao PIX (chargeback)
 *     refund → estornado
 *
 *   ENDPOINT DE STATUS (01/08/2026, agora funcional):
 *     waiting_payment → aguardando (PENDING)
 *     paid            → pago
 *     MED             → chargeback
 *
 * O vocabulario antigo do endpoint quebrado (APPROVED/PENDING/REFUSED)
 * continua aceito por seguranca — nao custa nada e evita regressao se a
 * Caju voltar a devolver ele em alguma rota.
 */

/** paid | APPROVED = pagamento confirmado. */
export function isPaidStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "APPROVED" || s === "PAID";
}
/** refused | expired | canceled = terminou sem pagar. */
export function isFailedStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return (
    s === "REFUSED" ||
    s === "FAILED" ||
    s === "CANCELED" ||
    s === "CANCELLED" ||
    s === "EXPIRED"
  );
}
/** refund | REFUNDED = estornado. */
export function isRefundedStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "REFUND" || s === "REFUNDED";
}
/** med = MED PIX (chargeback). */
export function isChargedbackStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "MED" || s === "CHARGEBACK" || s === "CHARGEDBACK";
}
/**
 * waiting_payment | PENDING = ainda aguardando o cliente pagar.
 *
 * Existe pra o anti-forge do webhook poder distinguir "a Caju diz que NAO
 * pagou" (contradicao explicita → rejeita) de "nao sei o que a Caju diz"
 * (consulta falhou → fail-open). Sem isso os dois casos viram o mesmo
 * `!isPaidStatus(...)` e a gente rejeita webhook legitimo por erro de rede.
 */
export function isPendingStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return (
    s === "WAITING_PAYMENT" ||
    s === "PENDING" ||
    s === "WAITING" ||
    s === "AGUARDANDO"
  );
}

/* ============ PIX OUT (WITHDRAWAL / TRANSFER) ============ */

import type { PixKeyType, SafePixWithdrawalResult } from "./safepix";
import { TOTP, Secret } from "otpauth";

/** Mapa PixKeyType (Trilho/SafePix) → destinationAliasType (Caju/Woovi). */
function toCajuKeyType(kt: PixKeyType): string {
  const map: Record<string, string> = {
    cpf: "CPF",
    cnpj: "CNPJ",
    email: "EMAIL",
    phone: "PHONE",
    evp: "RANDOM",
  };
  return map[kt] ?? "RANDOM";
}

/**
 * Extra creds pra pix-out: PIN + TOTP secret, guardados no
 * Acquirer.metadataEnc encriptado como JSON.
 * Formato: { "pin": "1234", "totp_secret": "BASE32SECRET" }
 */
export type CajuPixOutMetadata = {
  pin: string;
  totp_secret: string;
};

/**
 * Gera o codigo TOTP atual a partir do secret base32 (janela padrao 30s,
 * digits=6, algorithm=SHA1) — mesmo padrao usado pelo admin-auth.
 */
function generateTotp(secretBase32: string): string {
  const totp = new TOTP({
    issuer: "Caju",
    label: "PixOut",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

export type CajuWithdrawalOptions = {
  amountReais: number;
  pixKey: string;
  pixKeyType: PixKeyType;
  comment?: string;
  /** Se true, cria e AUTO-APROVA na Woovi na mesma chamada. Default true
   *  pra saque instantaneo (Trilho ja auditou saldo antes). */
  autoApprove?: boolean;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/**
 * Cria + aprova Pix Out via Caju (endpoint /api/woovi-pixout).
 * Requer creds.secretKey (api_key ou sub-key) + metadataEnc no acquirer
 * decodado pra { pin, totp_secret }.
 *
 * Retorna no mesmo shape do SafePix (SafePixWithdrawalResult) pra plugar
 * direto no auto-withdrawal dispatcher.
 */
export async function createWithdrawal(
  opts: CajuWithdrawalOptions,
  creds: { secretKey: string; pin: string; totpSecret: string },
): Promise<SafePixWithdrawalResult> {
  const amountCents = Math.round(opts.amountReais * 100);
  if (amountCents <= 0) {
    throw new Error("Caju pix-out: amount invalid");
  }
  if (!creds.pin || !creds.totpSecret) {
    throw new Error(
      "Caju pix-out: PIN ou TOTP secret nao configurados no Acquirer.metadataEnc",
    );
  }

  const body = {
    api_key: creds.secretKey,
    pin: Number(creds.pin), // API espera int
    token_2fa: generateTotp(creds.totpSecret),
    amount: amountCents,
    destinationAlias: opts.pixKey.replace(/\s+/g, ""),
    destinationAliasType: toCajuKeyType(opts.pixKeyType),
    comment: (opts.comment ?? "Saque Trilho").slice(0, 60),
    auto_approve: opts.autoApprove ?? true,
  };

  const externalSignal = opts.signal;
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 20000);
  const combined = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(`${BASE_URL}/api/woovi-pixout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: combined,
  });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {}

  if (!res.ok || raw.ok === false) {
    const msg =
      (raw.error as string) ??
      (raw.message as string) ??
      text.slice(0, 200) ??
      `HTTP ${res.status}`;
    throw new Error(`Caju pix-out ${res.status}: ${msg}`);
  }

  // Woovi retorna correlationID como txid do saque + payment.status.
  const correlationID = String(raw.correlationID ?? "");
  const woovi = (raw.woovi as Record<string, unknown> | undefined) ?? {};
  const payment = (woovi.payment as Record<string, unknown> | undefined) ?? {};
  const status = String(payment.status ?? "PENDING").toUpperCase();

  if (!correlationID) {
    throw new Error(
      `Caju pix-out sem correlationID (body=${text.slice(0, 200)})`,
    );
  }

  return {
    id: correlationID,
    status,
    raw,
  };
}

/**
 * Status helpers pra Pix Out (Woovi vocabulario).
 * Vou definir depois quando webhook chegar. Por ora, best-guess:
 *   TRANSFERIDO / PAID / APPROVED / COMPLETED → paid
 *   FAILED / REJECTED / REFUSED → failed
 *   PENDING / PROCESSING / AGUARDANDO → pending
 */
export function isPaidStatusW(status: string): boolean {
  const s = status.toUpperCase().trim();
  return (
    s === "TRANSFERIDO" ||
    s === "PAID" ||
    s === "APPROVED" ||
    s === "COMPLETED" ||
    s === "CONFIRMED"
  );
}
export function isFailedStatusW(status: string): boolean {
  const s = status.toUpperCase().trim();
  return (
    s === "FAILED" ||
    s === "REJECTED" ||
    s === "REFUSED" ||
    s === "CANCELED" ||
    s === "CANCELLED"
  );
}
