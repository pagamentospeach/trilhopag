/**
 * SharkHub provider (sub-adquirente — sharkhubsubadquirente.com).
 * Docs: https://app.sharkhubsubadquirente.com/docs  (ground-truth: /llms.txt)
 * Base: https://api.sharkhubsubadquirente.com/v1
 *
 * Auth: Bearer token. DUAS chaves distintas (usar a errada numa rota = 403):
 *   - api-key   → rotas de PAGAMENTO (POST /payment, /payment/:id/refund).
 *                 Guardada em Acquirer.secretKeyEnc (vai na creds.secretKey).
 *   - saque-key → rotas de TRANSFER + BALANCE (POST /transfer, GET /balance).
 *                 Guardada em Acquirer.metadataEnc.withdrawalKey.
 *
 * SharkHub NÃO usa par público/privado — é Bearer puro. O publicKey da row é só
 * um marker pra satisfazer resolveCreds/resolveWebhookAcquirers (publicKey != null).
 *
 * Valores SEMPRE em CENTAVOS (inteiro). Resposta PIX traz o copia-e-cola em
 * data.copypaste (NÃO há expiração no payload).
 *
 * ⚠️ WEBHOOK ANTI-FORGE (ground-truth jun/2026): o doc diz que assina com
 * X-Signature = base64(HMAC-SHA256(body, WEBHOOK_SECRET)), MAS na prática a
 * SharkHub NÃO manda header de assinatura nenhum (provado por captura ao vivo de
 * TODOS os headers de um webhook real). Por isso o gate HMAC nunca passava e os
 * webhooks de PAID eram recusados → vendas não creditavam. Solução: o handler
 * confirma o status com 1 GET /payment/:id (getPaymentStatus) por EVENTO DE
 * DINHEIRO — prova anti-forge sem assinatura (o atacante não faz a API dizer
 * PAID). PROIBIDO é POLLING REPETIDO/abuso (loop em cobrança pendente), NÃO um
 * lookup pontual disparado por webhook. Ver /api/webhooks/sharkhub.
 *
 * Reaproveita os TIPOS do SafePix (CreatePixOptions / SafePixChargeResult /
 * SafePixCreds) pra plugar direto no dispatcher (HANDLERS), sobrescrevendo o
 * notificationUrl pro nosso /api/webhooks/sharkhub.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";
import type {
  CreatePixOptions,
  SafePixChargeResult,
  SafePixCreds,
} from "./safepix";
import { isTransientFetchError, normalizeFetchError } from "./safepix";

const BASE_URL = "https://api.sharkhubsubadquirente.com/v1";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Proxy de IP FIXO usado SÓ nas chamadas com a SAQUE-KEY (balance + transfer).
 * A SharkHub exige que o IP de origem esteja na allowlist pra liberar SAQUE; o
 * Vercel rotaciona o IP de saída, então sem isso o saque/saldo é bloqueado.
 * Reusa o MESMO proxy do SafePix (SAFEPIX_PROXY_URL) — basta a SharkHub
 * whitelistar o IP desse proxy. SHARKHUB_PROXY_URL tem precedência se setado.
 * SEM proxy → conexão direta (charges seguem diretas de qualquer forma; só os
 * saques/saldo é que precisam do IP fixo). ProxyAgent cacheado no módulo.
 */
let _saqueProxy: ProxyAgent | null | undefined;
function saqueDispatcher(): ProxyAgent | undefined {
  if (_saqueProxy === undefined) {
    const url = process.env.SHARKHUB_PROXY_URL ?? process.env.SAFEPIX_PROXY_URL;
    if (url) {
      try {
        _saqueProxy = new ProxyAgent(url);
      } catch {
        _saqueProxy = null;
      }
    } else {
      _saqueProxy = null;
    }
  }
  return _saqueProxy ?? undefined;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
}

function bearer(token?: string): string {
  if (!token) throw new Error("SHARKHUB token ausente (Bearer).");
  return `Bearer ${token}`;
}

// ----------- PIX charge (api-key) -----------

export async function createPixCharge(
  opts: CreatePixOptions,
  creds?: SafePixCreds,
): Promise<SafePixChargeResult> {
  // A api-key vai na creds.secretKey (vinda do secretKeyEnc da row); fallback env.
  const apiKey = creds?.secretKey ?? process.env.SHARKHUB_API_KEY;
  if (!apiKey) throw new Error("SHARKHUB credentials missing (api-key).");

  const notificationUrl = `${appUrl()}/api/webhooks/sharkhub`;
  const taxId = (opts.customer.document?.number ?? "").replace(/\D/g, "");

  const body = {
    amount: opts.amountCents, // CENTAVOS
    currency: "BRL" as const,
    method: "PIX" as const,
    description: (opts.items[0]?.title ?? "Pagamento").slice(0, 200),
    ...(opts.metadata?.transaction_id
      ? { externalRef: opts.metadata.transaction_id }
      : {}),
    notificationUrl,
    ...(opts.ip ? { ip: opts.ip } : {}),
    payer: {
      name: opts.customer.name || "Cliente",
      taxId,
      email: opts.customer.email,
      // 28/07/2026 (davi 'sharkhub-5 ta falando que esta gerando os pix
      // sem telefone'). A SharkHub trata payer.phone como quase-obrigatorio
      // — sem ele, algumas contas rejeitam ou marcam como suspeito. Se
      // cliente nao forneceu, envia placeholder E.164 valido (11 digitos,
      // DDD 11) pra passar validacao basica sem quebrar geracao.
      phone: opts.customer.phone || "+5511999999999",
    },
    items: opts.items.map((it) => ({
      quantity: it.quantity,
      name: it.title,
      price: it.unit_price, // CENTAVOS (unitário)
      type: it.tangible ? ("PHYSICAL" as const) : ("DIGITAL" as const),
    })),
  };

  // FANOUT-AWARE TIMEOUT (jun/2026): dispatcher dispara várias adquirentes em
  // paralelo (Promise.any) — o vencedor responde. Timeout INTERNO de 5s + signal
  // EXTERNO (opts.signal) cancela a chamada quando OUTRA adquirente já venceu.
  // Sem retry interno: o fanout DO DISPATCHER é o próprio retry (próxima batch).
  // Garante "fail-fast" SEM segurar carga em PSP perdedor.
  const externalSignal = opts.signal;
  // Default 5s pro fanout do checkout; caminhos admin (gerar PIX / nominais)
  // passam timeoutMs maior porque precisam que CADA conta responda (contas
  // lentas levam mais que 5s e davam "aborted due to timeout").
  const timeoutSignal = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  const combined = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
  try {
    const res = await fetch(`${BASE_URL}/payment`, {
      method: "POST",
      headers: {
        Authorization: bearer(apiKey),
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
        `SharkHub ${res.status}: ${
          (raw.message as string) ?? text.slice(0, 200) ?? "erro"
        }`,
      );
    }

    const data = (raw.data && typeof raw.data === "object"
      ? raw.data
      : {}) as Record<string, unknown>;
    const qrCode = String(data.copypaste ?? "");
    if (!qrCode) {
      throw new Error(
        "SharkHub não retornou data.copypaste (PIX copia-e-cola).",
      );
    }
    return {
      id: String(raw.id ?? ""),
      status: String(raw.status ?? "PENDING").toUpperCase(),
      qrCode,
      expiresAt: null, // SharkHub não retorna expiração no PIX
      raw,
    };
  } catch (e) {
    if (isTransientFetchError(e)) {
      throw normalizeFetchError(e, "SharkHub cobrança");
    }
    throw e;
  }
}

// ----------- Payment status lookup (api-key) — CONFIRMAÇÃO de webhook -----------

export type SharkHubPaymentStatus = {
  /** true se o GET retornou 2xx e temos um status legível. */
  ok: boolean;
  /** status normalizado (UPPER) quando ok. */
  status?: string;
  /** HTTP status do GET (diagnóstico). */
  httpStatus?: number;
  /** true se a falha foi transiente (timeout/rede) → caller pode pedir retry. */
  transient?: boolean;
  raw?: unknown;
};

/**
 * Lê o status REAL de UMA cobrança via GET /payment/:id (api-key). Existe SÓ pra
 * CONFIRMAR um webhook de dinheiro quando ele chega SEM assinatura HMAC válida.
 *
 * Contexto (ground-truth jun/2026): a SharkHub DOCUMENTA X-Signature =
 * base64(HMAC-SHA256(body, secret)), mas na PRÁTICA não manda header de
 * assinatura nenhum (provado por captura ao vivo de TODOS os headers do webhook).
 * Sem assinatura, a única prova anti-forge é bater na própria API da SharkHub: um
 * atacante não consegue fazer GET /payment/:id responder PAID pra uma cobrança
 * que não foi paga. É UMA chamada por EVENTO DE DINHEIRO (não por cobrança
 * pendente, não em loop) → NÃO é "polling": o doc proíbe polling repetido/abuso,
 * não um lookup pontual disparado por webhook.
 *
 * NÃO relança: devolve {ok:false, transient} pro handler decidir (503 retry vs
 * não-credita) sem derrubar a resposta do webhook. Conexão direta (api-key, igual
 * createPixCharge — só saque/saldo precisa do proxy de IP fixo).
 */
export async function getPaymentStatus(
  paymentId: string,
  apiKey: string,
): Promise<SharkHubPaymentStatus> {
  if (!paymentId || !apiKey) return { ok: false, transient: false };
  let lastTransient = false;
  let lastHttp: number | undefined;
  // Até 3 tentativas com backoff (1.2s, 2.4s) — SÓ em erros TRANSIENTES:
  //   • rede/timeout (queda/soluço);
  //   • HTTP 429 (rate-limit) — a SharkHub limita GET /payment/:id; o limite
  //     LIMPA com o tempo, então backoff+retry resolve a maioria dos bursts;
  //   • HTTP 5xx (hiccup do servidor).
  // Esgotou → devolve transient=true e o handler responde 503 → a SharkHub
  // retenta o webhook DEPOIS (nunca creditamos sem confirmar, mas também não
  // perdemos o crédito de um PAID real sob rate-limit). É 1 confirmação por
  // EVENTO de dinheiro (não loop em cobrança pendente) → não é o "polling" que
  // o doc proíbe. HTTP determinístico (401/403/404) NÃO repete.
  const MAX = 3;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const res = await fetch(
        `${BASE_URL}/payment/${encodeURIComponent(paymentId)}`,
        {
          method: "GET",
          headers: {
            Authorization: bearer(apiKey),
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      const text = await res.text();
      let raw: Record<string, unknown> = {};
      try {
        if (text.trim().length > 0) raw = JSON.parse(text);
      } catch {
        /* corpo não-JSON — trata abaixo */
      }
      if (!res.ok) {
        lastHttp = res.status;
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < MAX) {
          lastTransient = true;
          await sleep(attempt * 1200); // 1.2s, depois 2.4s
          continue;
        }
        // 429/5xx esgotado → transiente (handler dá 503/retry). 4xx determinístico
        // (404 = id inexistente/forjado; 401/403 = cred errada) → não-transiente.
        return { ok: false, httpStatus: res.status, transient: retryable, raw };
      }
      const status = String(raw.status ?? "")
        .toUpperCase()
        .trim();
      if (!status) {
        return { ok: false, httpStatus: res.status, transient: false, raw };
      }
      return { ok: true, status, httpStatus: res.status, raw };
    } catch (e) {
      lastTransient = isTransientFetchError(e);
      if (attempt < MAX && lastTransient) {
        await sleep(attempt * 1200);
        continue;
      }
      return { ok: false, httpStatus: lastHttp, transient: lastTransient };
    }
  }
  return { ok: false, httpStatus: lastHttp, transient: lastTransient };
}

// ----------- Balance (saque-key, via proxy de IP fixo) -----------

export type SharkHubBalance = {
  amountCents: number;
  pendingCents: number;
  raw: unknown;
};

/** Anexa o motivo REAL (e.cause: ECONNREFUSED/ETIMEDOUT/ECONNRESET…) e a rota
 *  (proxy|direto) na mensagem, pra "fetch failed" virar algo diagnosticável no
 *  painel ao invés de uma string opaca. */
function withRouteCause(e: unknown, via: string): Error {
  const base = e instanceof Error ? e.message : String(e);
  const cause = (e as { cause?: { code?: string; message?: string } } | null)
    ?.cause;
  const detail = cause?.code || cause?.message;
  return new Error(detail ? `${base} [${via}: ${detail}]` : `${base} [${via}]`);
}

/**
 * Saldo da conta SharkHub. Usa a SAQUE-KEY (não a api-key — usar a errada = 403).
 *
 * ROTA: tenta primeiro pelo proxy de IP fixo (quando configurado) e, se essa
 * rota FALHAR (proxy fora do ar/instável, IP dropado, etc.), cai AUTOMATICAMENTE
 * pra conexão DIRETA. A IP-allowlist da SharkHub morde no /transfer (saque), NÃO
 * no GET /balance — então a leitura do saldo funciona direto de qualquer IP.
 * Isto conserta o "SharkHub saldo: fetch failed" que aparecia quando o proxy
 * compartilhado (SAFEPIX_PROXY_URL) estava ruim: o saldo volta a aparecer.
 *
 * `available` = sacável agora; `transfers.pending` = em fila.
 */
export async function getBalance(
  withdrawalKey: string,
): Promise<SharkHubBalance> {
  if (!withdrawalKey) throw new Error("SHARKHUB withdrawal key ausente.");
  const proxy = saqueDispatcher();
  // proxy primeiro (1 tentativa: falha rápido p/ failover), depois direto (2).
  const routes: Array<{
    via: string;
    dispatcher: ReturnType<typeof saqueDispatcher>;
    tries: number;
  }> = proxy
    ? [
        { via: "proxy", dispatcher: proxy, tries: 1 },
        { via: "direto", dispatcher: undefined, tries: 2 },
      ]
    : [{ via: "direto", dispatcher: undefined, tries: 2 }];

  let lastErr: unknown;
  for (const route of routes) {
    for (let attempt = 1; attempt <= route.tries; attempt++) {
      try {
        const res = await undiciFetch(`${BASE_URL}/balance`, {
          headers: {
            Authorization: bearer(withdrawalKey),
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(12000),
          ...(route.dispatcher ? { dispatcher: route.dispatcher } : {}),
        });
        const text = await res.text();
        let raw: {
          available?: number;
          transfers?: { pending?: number };
          message?: unknown;
        } = {};
        try {
          if (text.trim().length > 0) raw = JSON.parse(text);
        } catch {
          // erro genérico abaixo
        }
        if (!res.ok) {
          // Erro HTTP (ex.: 403 de IP no proxy). Guarda e tenta a PRÓXIMA rota
          // (direto) — repetir a mesma rota não muda o resultado.
          lastErr = new Error(
            `SharkHub balance ${res.status} (${route.via}): ${
              raw.message
                ? JSON.stringify(raw.message)
                : text.slice(0, 120) || "empty"
            }`,
          );
          break;
        }
        return {
          amountCents: Number(raw.available ?? 0),
          pendingCents: Number(raw.transfers?.pending ?? 0),
          raw,
        };
      } catch (e) {
        lastErr = withRouteCause(e, route.via);
        if (attempt < route.tries && isTransientFetchError(e)) continue;
        break; // próxima rota (ex.: proxy falhou → tenta direto)
      }
    }
  }
  throw normalizeFetchError(lastErr, "SharkHub saldo");
}

// ----------- Transfer / saque (saque-key, via proxy de IP fixo) -----------

export type SharkHubPixKeyType =
  | "CPF"
  | "CNPJ"
  | "EMAIL"
  | "PHONE"
  | "EVP"
  | "COPYPASTE";

export type CreateTransferOptions = {
  amountCents: number;
  pixKey: string;
  pixKeyType: SharkHubPixKeyType;
  externalRef?: string;
};

export type SharkHubTransferResult = {
  id: string;
  status: string;
  raw: unknown;
};

/**
 * Cria uma transferência PIX (saque) a partir do saldo da conta SharkHub. Usa a
 * SAQUE-KEY + proxy de IP fixo (a allowlist de IP é exatamente pra isto). Hoje os
 * saques do Trilho são MANUAIS — esta função existe pra automação futura.
 */
export async function createTransfer(
  opts: CreateTransferOptions,
  withdrawalKey: string,
): Promise<SharkHubTransferResult> {
  if (!withdrawalKey) throw new Error("SHARKHUB withdrawal key ausente.");
  const notificationUrl = `${appUrl()}/api/webhooks/sharkhub`;
  const body = {
    amount: opts.amountCents, // CENTAVOS
    method: "PIX" as const,
    pix: { pixKey: opts.pixKey, pixKeyType: opts.pixKeyType },
    ...(opts.externalRef ? { externalRef: opts.externalRef } : {}),
    notificationUrl,
  };

  const dispatcher = saqueDispatcher();
  const res = await undiciFetch(`${BASE_URL}/transfer`, {
    method: "POST",
    headers: {
      Authorization: bearer(withdrawalKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    ...(dispatcher ? { dispatcher } : {}),
  });

  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // erro genérico abaixo
  }
  if (!res.ok) {
    throw new Error(
      `SharkHub transfer ${res.status}: ${
        (raw.message as string) ?? text.slice(0, 200) ?? "erro"
      }`,
    );
  }
  return {
    id: String(raw.id ?? ""),
    status: String(raw.status ?? "IN_QUEUE").toUpperCase(),
    raw,
  };
}

// ----------- Status helpers -----------

// payment.status enum: PENDING | PROCESSING | PAID | REFUSED | REFUNDED | MED |
//   CHARGEDBACK. Só PAID é sucesso. REFUSED = recusado (falha). REFUNDED e
//   CHARGEDBACK são SEPARADOS (cada um aplica uma taxa de estorno diferente no
//   markTransaction*). MED (disputa em análise) NÃO é terminal — não credita nem
//   estorna (espera virar PAID/REFUNDED/CHARGEDBACK).
const PAID_STATUSES = new Set(["PAID"]);
const FAILED_STATUSES = new Set(["REFUSED"]);
const REFUNDED_STATUSES = new Set(["REFUNDED"]);
const CHARGEDBACK_STATUSES = new Set(["CHARGEDBACK", "CHARGEBACK"]);

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.has(status.toUpperCase().trim());
}
export function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.has(status.toUpperCase().trim());
}
export function isRefundedStatus(status: string): boolean {
  return REFUNDED_STATUSES.has(status.toUpperCase().trim());
}
export function isChargedbackStatus(status: string): boolean {
  return CHARGEDBACK_STATUSES.has(status.toUpperCase().trim());
}
