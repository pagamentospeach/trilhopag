/**
 * Asaas — instituicao de pagamento (nao e intermediador white-label como as
 * outras). Docs: https://docs.asaas.com  ·  Base: https://api.asaas.com/v3
 *
 * Auth: chave unica no header `access_token` (NAO e Bearer, NAO e Basic).
 * A chave comeca com `$` e esse cifrao FAZ PARTE dela. Guardada em
 * Acquirer.secretKeyEnc (encriptada).
 *
 * ⚠️ A LINHA Acquirer PRECISA DE `publicKey` PREENCHIDO, mesmo a Asaas nao
 * tendo par public/secret. `resolveWebhookAcquirers()` filtra por
 * `publicKey: { not: null }`, entao com o campo nulo a conta some do lookup e
 * o webhook devolve 503 "confirmation_unavailable" pra sempre — a venda e
 * paga na Asaas e nunca credita. Custou uma venda real pra descobrir
 * (10/08/2026). Qualquer valor serve, o provider le so o secretKey; hoje esta
 * "asaas" como rotulo.
 *
 * ── POR QUE SAO 3 CHAMADAS E NAO 1 ──────────────────────────────────────
 *
 * A Asaas nao tem "cria cobranca com dados do cliente inline". O fluxo e:
 *   1. POST /customers            cria (ou reaproveita) o cliente
 *   2. POST /payments             cria a cobranca, billingType PIX
 *   3. GET  /payments/{id}/pixQrCode   pega o copia-e-cola
 *
 * Isso e um passo a mais que as outras adquirentes, e no FANOUT paralelo do
 * checkout (onde so a mais rapida ganha) conta contra ela. Por isso o timeout
 * default e o mesmo das outras: se a Asaas nao acompanhar, outra vence a
 * corrida e ninguem perde venda. Nao adianta dar folga extra — o cliente esta
 * olhando pra tela.
 *
 * Dedup de cliente: `externalReference` do nosso lado + busca por cpfCnpj
 * antes de criar. Sem isso, cada venda criaria um cliente novo na conta e em
 * um mes a base viraria lixo.
 *
 * ── LIMITES REAIS (medidos na conta, 10/08/2026) ────────────────────────
 *
 *  - MINIMO R$ 5,00 por cobranca. Abaixo disso a API devolve 400
 *    "O valor da cobranca (R$ X) menos o valor do desconto nao pode ser
 *    menor que R$ 5,00". Validamos aqui pra falhar rapido e deixar o fanout
 *    seguir pra outra adquirente em vez de gastar o round-trip.
 *  - EXIGE chave PIX cadastrada na conta. Sem ela o passo 3 devolve 400
 *    "Voce nao possui uma chave Pix cadastrada". A doc chama isso de
 *    transitorio; nesta conta ja e obrigatorio.
 *
 * ── EXPIRACAO ───────────────────────────────────────────────────────────
 *
 * A Asaas NAO expira o QR junto com a nossa janela: com dueDate de hoje ela
 * devolve expirationDate de ~1 ano. Quem manda no prazo mostrado pro cliente
 * e o nosso `pixExpiresAt`. Consequencia: uma tx que a gente ja marcou como
 * EXPIRED continua pagavel no lado da Asaas, e o webhook de PAYMENT_RECEIVED
 * chega depois. O handler de webhook trata isso (paga uma tx expirada em vez
 * de ignorar) — comportamento igual ao das outras adquirentes.
 *
 * Statuses da cobranca: PENDING | RECEIVED | CONFIRMED | OVERDUE | REFUNDED
 *                       | RECEIVED_IN_CASH | CHARGEBACK_REQUESTED | ...
 *
 * ⚠️ CONFIRMED != RECEIVED. Em cartao/boleto, CONFIRMED significa "pago mas o
 * dinheiro ainda nao caiu na conta Asaas". Creditar o seller nele e creditar
 * dinheiro que a gente ainda nao tem. So RECEIVED credita. No PIX o fluxo
 * pula CONFIRMED e vai direto pra RECEIVED, entao isso so afeta os outros
 * meios — mas a regra fica valendo pros dois.
 *
 * Reaproveita os TIPOS do SafePix pra plugar direto no dispatcher (HANDLERS)
 * via getHandler("asaas").
 */
import type {
  CreatePixOptions,
  SafePixChargeResult,
  SafePixCreds,
} from "./safepix";

const BASE_URL = "https://api.asaas.com/v3";

/** Minimo aceito pela Asaas, em centavos. */
export const ASAAS_MIN_CENTS = 500;

function authHeaders(creds?: SafePixCreds): Record<string, string> {
  const token = creds?.secretKey ?? process.env.ASAAS_API_KEY;
  if (!token) {
    throw new Error("ASAAS credentials missing (access_token).");
  }
  return {
    access_token: token,
    "Content-Type": "application/json",
    Accept: "application/json",
    // A Asaas pede User-Agent identificavel; sem ele algumas rotas respondem
    // 403 no edge deles.
    "User-Agent": "trilhopag",
  };
}

/** Erro da Asaas vem em `{ errors: [{ code, description }] }`. */
function asaasError(raw: unknown, fallback: string): string {
  const errs = (raw as { errors?: { description?: string }[] })?.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    return errs.map((e) => e?.description ?? "").filter(Boolean).join("; ");
  }
  return fallback;
}

async function asaasFetch(
  path: string,
  init: RequestInit,
  creds: SafePixCreds | undefined,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: authHeaders(creds),
    signal,
  });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // resposta nao-JSON (502 do edge, HTML de manutencao) → trata como erro
  }
  if (!res.ok) {
    throw new Error(
      `Asaas ${init.method ?? "GET"} ${path} ${res.status}: ${asaasError(
        raw,
        text.slice(0, 200),
      )}`,
    );
  }
  return raw;
}

/**
 * Acha o cliente pelo CPF/CNPJ ou cria um novo.
 *
 * A busca vem antes da criacao de proposito: a Asaas ACEITA cpfCnpj repetido
 * e criaria um cliente novo a cada venda do mesmo comprador. Em volume isso
 * enche a conta de duplicata e atrapalha quem for olhar o painel deles.
 */
async function ensureCustomer(
  opts: CreatePixOptions,
  creds: SafePixCreds | undefined,
  signal: AbortSignal,
): Promise<string> {
  const doc = (opts.customer.document?.number ?? "").replace(/\D/g, "");
  const name = (opts.customer.name || "Cliente").slice(0, 120);

  if (doc) {
    const found = await asaasFetch(
      `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`,
      { method: "GET" },
      creds,
      signal,
    );
    const first = (found.data as { id?: string }[] | undefined)?.[0];
    if (first?.id) return first.id;
  }

  const created = await asaasFetch(
    "/customers",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        ...(doc ? { cpfCnpj: doc } : {}),
        ...(opts.customer.email ? { email: opts.customer.email } : {}),
        notificationDisabled: true,
      }),
    },
    creds,
    signal,
  );
  const id = created.id;
  if (typeof id !== "string") {
    throw new Error("Asaas: resposta de /customers sem id");
  }
  return id;
}

/** YYYY-MM-DD no fuso de Brasilia (a Asaas interpreta dueDate em BRT). */
function hojeBRT(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  if (opts.amountCents < ASAAS_MIN_CENTS) {
    throw new Error(
      `Asaas min amount ${ASAAS_MIN_CENTS} cents (R$5,00); received ${opts.amountCents}`,
    );
  }

  // FANOUT-AWARE TIMEOUT (mesmo padrao do safepix/pixzy/sharkhub): timeout
  // interno + signal externo pra cortar quando outra adquirente vence o
  // Promise.any. As tres chamadas dividem o MESMO deadline — o que importa
  // pro checkout e o tempo total ate o copia-e-cola, nao por request.
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;

  const customerId = await ensureCustomer(opts, creds, signal);

  const payment = await asaasFetch(
    "/payments",
    {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "PIX",
        // A Asaas trabalha em REAIS com decimal, nao em centavos como as
        // outras. Dividir por 100 aqui e o unico lugar onde isso acontece.
        value: opts.amountCents / 100,
        dueDate: hojeBRT(),
        // Rastro pra achar a tx a partir do painel da Asaas. O id da nossa
        // transaction chega em metadata quando o caller manda.
        ...(opts.metadata?.transaction_id
          ? { externalReference: opts.metadata.transaction_id }
          : {}),
        description: opts.items?.[0]?.title?.slice(0, 200) ?? undefined,
      }),
    },
    creds,
    signal,
  );

  const paymentId = payment.id;
  if (typeof paymentId !== "string") {
    throw new Error("Asaas: resposta de /payments sem id");
  }

  const qr = await asaasFetch(
    `/payments/${paymentId}/pixQrCode`,
    { method: "GET" },
    creds,
    signal,
  );
  const payload = qr.payload;
  if (typeof payload !== "string" || payload.length === 0) {
    // O caso classico aqui e conta sem chave PIX cadastrada. A cobranca ja
    // foi criada, mas sem copia-e-cola ela nao serve pra nada — deixa o
    // fanout cair pra outra adquirente.
    throw new Error(
      `Asaas: cobranca ${paymentId} criada mas sem QR Code (conta tem chave PIX cadastrada?)`,
    );
  }

  return {
    id: paymentId,
    status: String(payment.status ?? "PENDING"),
    qrCode: payload,
    expiresAt:
      typeof qr.expirationDate === "string"
        ? qr.expirationDate.replace(" ", "T")
        : null,
    raw: { payment, qr, customerId },
  };
}

// ----------- Cartao e boleto -----------

/**
 * Cartao e boleto via PAGINA HOSPEDADA da Asaas (`invoiceUrl`).
 *
 * 11/08/2026 (davi): "Verifique se o asaas suporta api de pagamento em cartao
 * ou boleto (...) faz eles funcionarem". Suporta os dois. Testado na conta:
 * CREDIT_CARD, BOLETO, DEBIT_CARD e UNDEFINED sao todos aceitos.
 *
 * ⚠️ NAO RECEBEMOS DADO DE CARTAO. O cliente digita o cartao no dominio da
 * Asaas, nao no nosso. Isso e escolha, nao limitacao: existe a API de
 * tokenizacao deles, mas passar numero de cartao pelo nosso servidor puxa
 * escopo de PCI que este gateway nao tem hoje. Mesmo desenho da AbacatePay,
 * que ja roda assim.
 *
 * O retorno e a `invoiceUrl` — o dispatcher de cartao ja sabe lidar com
 * `redirectUrl` (o campo existe desde a AbacatePay), entao nada no frontend
 * precisou mudar.
 *
 * `UNDEFINED` deixa o proprio cliente escolher entre cartao, boleto e PIX na
 * pagina. E o que usamos quando o seller liga os dois meios: uma cobranca so,
 * o cliente decide.
 */
export type AsaasBillingType = "CREDIT_CARD" | "BOLETO" | "UNDEFINED";

export type AsaasHostedBilling = {
  id: string;
  /** Pagina hospedada — e pra ca que o cliente e redirecionado. */
  url: string;
  /** PDF do boleto. Null em cobranca so de cartao. */
  boletoPdfUrl: string | null;
  status: string;
  raw: unknown;
};

export async function createHostedBilling(
  opts: {
    amountCents: number;
    billingType: AsaasBillingType;
    description?: string;
    externalRef?: string;
    /** Dias ate o vencimento. Boleto precisa de prazo; cartao nao usa. */
    diasVencimento?: number;
    customer: {
      name: string;
      email?: string;
      phone?: string;
      document?: { number?: string | null } | null;
    };
  },
  creds?: SafePixCreds,
): Promise<AsaasHostedBilling> {
  if (opts.amountCents < ASAAS_MIN_CENTS) {
    throw new Error(
      `Asaas min amount ${ASAAS_MIN_CENTS} cents (R$5,00); received ${opts.amountCents}`,
    );
  }

  // Cartao e boleto NAO estao no fanout do checkout (nao ha corrida entre
  // adquirentes aqui), entao o timeout pode ser folgado: o custo de estourar
  // e o cliente ver erro numa compra que ele ja decidiu fazer.
  const signal = AbortSignal.timeout(20_000);

  const customerId = await ensureCustomer(
    { customer: opts.customer } as unknown as CreatePixOptions,
    creds,
    signal,
  );

  const dias = opts.diasVencimento ?? (opts.billingType === "CREDIT_CARD" ? 1 : 3);
  const venc = new Date(Date.now() - 3 * 3600_000 + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const payment = await asaasFetch(
    "/payments",
    {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: opts.billingType,
        value: opts.amountCents / 100,
        dueDate: venc,
        ...(opts.description
          ? { description: opts.description.slice(0, 500) }
          : {}),
        ...(opts.externalRef ? { externalReference: opts.externalRef } : {}),
      }),
    },
    creds,
    signal,
  );

  const id = payment.id;
  const url = payment.invoiceUrl;
  if (typeof id !== "string" || typeof url !== "string") {
    throw new Error("Asaas: resposta de /payments sem id ou invoiceUrl");
  }

  return {
    id,
    url,
    boletoPdfUrl:
      typeof payment.bankSlipUrl === "string" ? payment.bankSlipUrl : null,
    status: String(payment.status ?? "PENDING"),
    raw: payment,
  };
}

/** Consulta o status atual. Usado pelo webhook como ANTI-FORGE. */
export async function getPaymentStatus(
  paymentId: string,
  creds?: SafePixCreds,
): Promise<{ status: string } | null> {
  try {
    const raw = await asaasFetch(
      `/payments/${encodeURIComponent(paymentId)}`,
      { method: "GET" },
      creds,
      AbortSignal.timeout(15_000),
    );
    const status = raw.status;
    return { status: typeof status === "string" ? status : "UNKNOWN" };
  } catch {
    return null;
  }
}

/**
 * CONFIRMED CONTA COMO PAGO — corrigido em 11/08/2026, junto com a entrada de
 * cartao e boleto.
 *
 * Meu raciocinio anterior estava errado. CONFIRMED significa "o cliente pagou,
 * o valor ainda nao esta liberado na conta Asaas" — e no cartao esse "ainda
 * nao" dura 32 dias. Esperar RECEIVED faria o seller ficar mais de um mes sem
 * ver na tela uma venda que ja aconteceu, e o cliente ja com o produto.
 *
 * Quem cuida do descasamento entre "aprovada" e "sacavel" nao e este status, e
 * a retencao: markTransactionPaid marca a venda como PAID na hora e trava o
 * dinheiro ate D+30 (lib/holding-release.ts). Estorno e chargeback dentro
 * dessa janela debitam de volta antes de virar saque.
 *
 * No PIX nao muda nada: o fluxo vai de CREATED direto pra RECEIVED, CONFIRMED
 * nem acontece.
 */
export function isPaidStatus(s: string): boolean {
  const u = s.toUpperCase();
  return u === "RECEIVED" || u === "RECEIVED_IN_CASH" || u === "CONFIRMED";
}

export function isRefundedStatus(s: string): boolean {
  const u = s.toUpperCase();
  return (
    u === "REFUNDED" ||
    u === "REFUND_REQUESTED" ||
    u === "PARTIALLY_REFUNDED" ||
    u === "CHARGEBACK_REQUESTED" ||
    u === "CHARGEBACK_DISPUTE"
  );
}

export function isFailedStatus(s: string): boolean {
  const u = s.toUpperCase();
  return u === "OVERDUE" || u === "DELETED" || u === "EXPIRED";
}

/** Saldo em centavos. `GET /finance/balance` devolve em reais. */
export async function getBalance(
  creds?: SafePixCreds,
): Promise<{ availableCents: number } | null> {
  try {
    const raw = await asaasFetch(
      "/finance/balance",
      { method: "GET" },
      creds,
      AbortSignal.timeout(15_000),
    );
    const b = raw.balance;
    if (typeof b !== "number") return null;
    return { availableCents: Math.round(b * 100) };
  } catch {
    return null;
  }
}
