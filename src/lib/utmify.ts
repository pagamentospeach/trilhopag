/**
 * UTMify dispatcher.
 * Docs: POST https://api.utmify.com.br/api-credentials/orders
 * Header: x-api-token
 */

import { prisma } from "./prisma";

const UTMIFY_URL = "https://api.utmify.com.br/api-credentials/orders";

type Status = "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback";

type PaymentMethod = "credit_card" | "boleto" | "pix" | "paypal" | "free_price";

function toUTC(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function mapMethod(method: string): PaymentMethod {
  const m = method.toUpperCase();
  if (m === "PIX") return "pix";
  if (m === "CARD" || m === "APPLE_PAY" || m === "GOOGLE_PAY")
    return "credit_card";
  if (m === "BOLETO") return "boleto";
  return "pix";
}

/**
 * Tokens da UTMify ficam guardados 1-por-linha (ou separados por vírgula) no
 * campo `apiToken` — assim o seller pode integrar MAIS DE UMA conta UTMify sem
 * mudar o schema. Cada venda é enviada pra TODOS os tokens.
 */
export function parseUtmifyTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[\n,;]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
}

function mapStatus(status: string): Status {
  const s = status.toUpperCase();
  if (s === "PAID") return "paid";
  if (s === "REFUNDED") return "refunded";
  if (s === "CHARGEBACK") return "chargedback";
  if (s === "FAILED" || s === "CANCELED" || s === "EXPIRED") return "refused";
  return "waiting_payment";
}

export type DispatchUtmifyInput = {
  userId: string;
  transaction: {
    id: string;
    productId: string;
    amountCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    method: string;
    status: string;
    customerEmail: string;
    customerName: string | null;
    customerPhone: string | null;
    customerCpf: string | null;
    customerIp: string | null;
    utmSource: string | null;
    utmCampaign: string | null;
    utmMedium: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    createdAt: Date;
    paidAt: Date | null;
    refundedAt: Date | null;
  };
  product: { id: string; name: string };
};

export async function dispatchUtmify(input: DispatchUtmifyInput): Promise<{
  ok: boolean;
  status?: number;
  body?: unknown;
  skipped?: string;
  /** true quando falhou com erro 4xx (token inválido / payload / createdAt
   *  fora da janela) — não adianta re-tentar no cron. */
  permanent?: boolean;
}> {
  // SAFETY CHECK (06/07/2026 — david: "NUNCA nenhuma venda pendente pode
  // chegar como paga para utmify"). Se o payload esta tentando enviar
  // status=paid, RECONFIRMA no DB que a tx esta REALMENTE PAID + nao
  // desviada. Fecha race conditions:
  //   - Tx virou EXPIRED entre o agendamento e o dispatch do cron
  //   - Admin desviou a tx entre markTransactionPaid e o dispatch
  //   - Bug em caller que passa status errado
  // Sem esse guard, cron dispatch-utmify (rede de seguranca do fast-path)
  // poderia disparar paid pra tx que ficou "PAID" no payload mas virou
  // outra coisa no DB. Custo: 1 query extra so no caminho PAID.
  const inputStatus = String(input.transaction.status).toUpperCase();
  const currentTx = await prisma.transaction.findUnique({
    where: { id: input.transaction.id },
    select: {
      status: true,
      divertedToAcquirer: true,
      divertedToReferrer: true,
      providerPayload: true,
    },
  });
  if (!currentTx) return { ok: false, skipped: "tx_not_found_in_db" };
  if (inputStatus === "PAID") {
    if (currentTx.status !== "PAID") {
      console.warn(
        `[utmify] REFUSING paid dispatch — DB tx.status=${currentTx.status} (payload said PAID)`,
        input.transaction.id,
      );
      return { ok: false, skipped: "tx_not_paid_in_db" };
    }
    if (currentTx.divertedToAcquirer || currentTx.divertedToReferrer) {
      console.warn(
        "[utmify] REFUSING paid dispatch — tx is diverted",
        input.transaction.id,
      );
      return { ok: false, skipped: "tx_diverted" };
    }
  }

  // CONFIG CHECK MOVED HERE (18/07/2026, davi: "auditoria utmify"):
  // Se o seller nao tem UtmifyConfig ativo OU o produto nao esta na lista
  // habilitada, retorna JA — SEM gravar o marker atomico. Antes o marker
  // era escrito primeiro e depois checavamos config, o que:
  //   1. Escrevia lixo no providerPayload de TODA tx do gateway (5290 tx
  //      do Alexandre tinham marker gravado sem UtmifyConfig existir).
  //   2. Gastava write no Postgres pra cada tx (waiting_payment + paid).
  //   3. Confundia auditoria (o marker parecia dispatch real, mas nada foi
  //      efetivamente enviado pra plataforma UTMify).
  // Custo: 1 read a mais (UtmifyConfig.findUnique) — mas o read tende a ser
  // cacheado por sessao de HTTP e o read anterior de currentTx ja abriu conn.
  const config = await prisma.utmifyConfig.findUnique({
    where: { userId: input.userId },
  });
  if (!config || !config.active) {
    return { ok: false, skipped: "not_configured" };
  }
  const tokensEarly = parseUtmifyTokens(config.apiToken);
  if (tokensEarly.length === 0) {
    return { ok: false, skipped: "not_configured" };
  }
  if (
    config.enabledProductIds &&
    config.enabledProductIds.length > 0 &&
    !config.enabledProductIds.includes(input.product.id)
  ) {
    return { ok: false, skipped: "product_not_enabled" };
  }

  // ============ ATOMIC CLAIM ANTI-DUPLICATE (11/07/2026 v2, david) ============
  // Bug repetido apos primeiro fix (v1 gate STATUS-AWARE). Motivo: v1 fazia
  // read-then-check-then-send-then-write. Isso e vulneravel a RACE:
  //   - fast-path (markTransactionPaid) le utmify_last_status=null.
  //   - cron dispatch-utmify roda em paralelo, ambos leem null.
  //   - Ambos passam pelo gate.
  //   - Ambos disparam PAID → duplica na Utmify.
  //   - Ambos gravam marker no final (ultimo vence, mas ja foi tarde).
  //
  // v2 = CLAIM ATOMICO. Fazemos updateMany com condicao WHERE que so
  // deixa passar SE o marker atual (a) esta ausente OU (b) tem status
  // diferente OU (c) esta expirado (>24h). Se count=0 → alguem ja claimou
  // → SKIP. Se count=1 → temos o lock exclusivo → dispara.
  //
  // O update grava o marker IMEDIATAMENTE (antes do fetch pra Utmify). Se
  // o fetch falhar, marker fica gravado com status pending — mas OUTRA
  // instancia esperando NAO vai disparar (marker recente). Trade-off:
  // em falha transiente do fetch, perdemos aquele evento ate 24h passar
  // OU status mudar. Preferivel a duplicar.
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const dedupWindowMs = 24 * 60 * 60 * 1000; // 24h
  const dedupCutoffIso = new Date(nowMs - dedupWindowMs).toISOString();

  // updateMany com condicao no JSON path (Postgres). Se o marker eh:
  //   - null → passa (nunca claimou)
  //   - status DIFERENTE → passa (novo status legitimo)
  //   - status IGUAL mas timestamp < cutoff → passa (janela expirou)
  // Em todos os casos, sobrescreve marker → outros callers veem novo estado.
  const claim = await prisma.$executeRaw`
    UPDATE "Transaction"
    SET "providerPayload" = jsonb_set(
      jsonb_set(
        COALESCE("providerPayload", '{}'::jsonb),
        '{utmify_last_status}', to_jsonb(${inputStatus}::text)
      ),
      '{utmify_last_status_at}', to_jsonb(${nowIso}::text)
    )
    WHERE id = ${input.transaction.id}
      AND (
        ("providerPayload"->>'utmify_last_status') IS NULL
        OR ("providerPayload"->>'utmify_last_status') != ${inputStatus}
        OR ("providerPayload"->>'utmify_last_status_at') < ${dedupCutoffIso}
      )
  `;
  if (claim === 0) {
    // Outra instancia ja claimou este (status, tx) recente. SKIP.
    return { ok: false, skipped: "already_claimed_by_other_dispatch" };
  }

  // Config + tokens ja resolvidos ANTES do claim (linha ~132). Reutiliza.
  const tokens = tokensEarly;

  const t = input.transaction;
  const payload = {
    orderId: t.id,
    platform: config.platform || "Trilho",
    paymentMethod: mapMethod(t.method),
    status: mapStatus(t.status),
    createdAt: toUTC(t.createdAt),
    approvedDate: toUTC(t.paidAt),
    refundedAt: toUTC(t.refundedAt),
    customer: {
      name: t.customerName ?? "Cliente",
      email: t.customerEmail,
      phone: t.customerPhone,
      document: t.customerCpf,
      country: "BR",
      ip: t.customerIp ?? undefined,
    },
    products: [
      {
        id: input.product.id,
        name: input.product.name,
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: t.amountCents,
      },
    ],
    trackingParameters: {
      src: null,
      sck: null,
      utm_source: t.utmSource,
      utm_campaign: t.utmCampaign,
      utm_medium: t.utmMedium,
      utm_content: t.utmContent,
      utm_term: t.utmTerm,
    },
    commission: {
      totalPriceInCents: t.amountCents,
      gatewayFeeInCents: t.feeCents,
      userCommissionInCents: t.netCents,
      ...(t.currency !== "BRL" ? { currency: t.currency } : {}),
    },
  };

  // Dispara pra cada token em paralelo. orderId = id da transação, então
  // reenvio é idempotente no lado da UTMify (atualiza a mesma order).
  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(UTMIFY_URL, {
          method: "POST",
          headers: {
            "x-api-token": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        const body = await res.json().catch(() => ({}));
        return { token: token.slice(-4), ok: res.ok, status: res.status, body };
      } catch (e) {
        return {
          token: token.slice(-4),
          ok: false,
          body: { error: e instanceof Error ? e.message : "network" },
        };
      }
    }),
  );

  // ok = pelo menos um token recebeu (não re-tenta em loop por causa de 1
  // token ruim; o cron marca como despachado). Falhas individuais ficam no body.
  const anyOk = results.some((r) => r.ok);
  // "permanent" = nenhum token aceitou E há erro 4xx (token inválido /
  // createdAt fora da janela / payload). O cron NÃO deve re-tentar isso pra
  // sempre. 5xx ou timeout (sem status) são transitórios → continuam re-tentáveis.
  const permanent =
    !anyOk &&
    results.some(
      (r) => typeof r.status === "number" && r.status >= 400 && r.status < 500,
    );
  if (!anyOk) {
    // Observabilidade: token inválido (404 API_CREDENTIAL_NOT_FOUND),
    // createdAt fora da janela, etc. Antes sumia em silêncio — agora loga
    // pra diagnosticar reclamação de seller ("não aparece nada na UTMify").
    console.error(
      `[utmify] dispatch FAILED${permanent ? " (permanent 4xx)" : " (transient)"} tx=${input.transaction.id} status=${input.transaction.status} →`,
      JSON.stringify(results),
    );
  }

  // Marker ja foi gravado no CLAIM ATOMICO no inicio (linha ~155). Nao
  // precisa regravar aqui.
  //
  // ROLLBACK EM FALHA: se anyOk=false (nenhum token aceitou), REVERTE o
  // marker pra permitir retry legitimo. Sem isso, uma falha transiente
  // (5xx/timeout) travaria o envio por 24h.
  if (!anyOk) {
    // So reverte se o marker ainda eh o que a gente gravou (evita apagar
    // marker de uma dispatch bem-sucedida que rodou em paralelo).
    await prisma.$executeRaw`
      UPDATE "Transaction"
      SET "providerPayload" =
        ("providerPayload" - 'utmify_last_status' - 'utmify_last_status_at')
      WHERE id = ${input.transaction.id}
        AND ("providerPayload"->>'utmify_last_status_at') = ${nowIso}
    `.catch((e) =>
      console.error("[utmify] failed to rollback marker:", input.transaction.id, e),
    );
  }

  return {
    ok: anyOk,
    permanent,
    status: results.find((r) => r.ok)?.status ?? results[0]?.status,
    body: { tokens: results.length, results },
  };
}

/**
 * "Cancela" uma venda no painel da UTMify enviando um dispatch com status=
 * refused para o mesmo orderId (idempotente na UTMify). Usado quando admin
 * desvia manualmente uma tx APOS a UTMify ter visto ela como waiting_payment
 * (via notifyTransactionCreated). Se nao mandar isso, a venda fica presa
 * como waiting_payment no painel do seller — e a UTMify tem monitoring
 * proprio que checa PSP e vira "paid" sozinha, gerando o desalinhamento
 * "venda cai como paga na utmify mas na trilho nao aparece" (reportado
 * pelo alexandre em jul/2026).
 *
 * Mesmo se a UTMify ainda nao tinha recebido nada dessa tx, o dispatch de
 * refused nao causa mal: orderId novo com status refused = nenhuma metrica
 * de venda ganha, so cria um registro visivel de "recusada". Preferimos
 * enviar sempre a arriscar deixar preso.
 */
export async function sendUtmifyCancellation(input: DispatchUtmifyInput) {
  return dispatchUtmify({
    ...input,
    transaction: { ...input.transaction, status: "CANCELED" },
  });
}

export type UtmifyTokenTestResult = {
  tokenSuffix: string;
  ok: boolean;
  status?: number;
  message: string;
};

/**
 * Testa a conexão com a UTMify para cada token. Valida DE VERDADE o token
 * (404 = inválido/revogado), o schema e a conectividade. Usado pelo botão
 * "Testar conexão" da tela de integração.
 *
 * IMPORTANTE: NÃO usa `isTest: true` — descobrimos (jun/2026) que com isTest
 * a UTMify aceita QUALQUER token (200), dando falso-positivo e tornando o
 * teste inútil pra detectar token errado. Então enviamos um pedido real, mas
 * com `orderId` ESTÁVEL por seller (`trilhopag-conn-test-<userId>`): clicar
 * "Testar" várias vezes ATUALIZA o mesmo pedido em vez de criar vários —
 * fica no máximo 1 pedido de teste (waiting_payment, R$1) no painel UTMify.
 *
 * createdAt = agora (UTC) → dentro da janela. customer com phone/document
 * null testa de propósito o caso "sem dados do cliente".
 */
export async function runUtmifyConnectionTest(
  tokens: string[],
  platform: string,
  orderId: string,
): Promise<UtmifyTokenTestResult[]> {
  const testPayload = {
    orderId,
    platform: platform || "Trilho",
    paymentMethod: "pix" as PaymentMethod,
    status: "waiting_payment" as Status,
    createdAt: toUTC(new Date()),
    approvedDate: null,
    refundedAt: null,
    customer: {
      name: "Teste de conexão Trilho (pode ignorar)",
      email: "teste@trilhopag.com",
      phone: null,
      document: null,
      country: "BR",
    },
    products: [
      {
        id: "trilhopag-conn-test",
        name: "Teste de conexão",
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: 100,
      },
    ],
    trackingParameters: {
      src: null,
      sck: null,
      utm_source: "trilhopag-test",
      utm_campaign: null,
      utm_medium: null,
      utm_content: null,
      utm_term: null,
    },
    commission: {
      totalPriceInCents: 100,
      gatewayFeeInCents: 0,
      userCommissionInCents: 100,
    },
  };

  return Promise.all(
    tokens.map(async (token): Promise<UtmifyTokenTestResult> => {
      const tokenSuffix = "…" + token.slice(-4);
      try {
        const res = await fetch(UTMIFY_URL, {
          method: "POST",
          headers: { "x-api-token": token, "Content-Type": "application/json" },
          body: JSON.stringify(testPayload),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return {
            tokenSuffix,
            ok: true,
            status: res.status,
            message: "Conectado — a UTMify está recebendo os dados.",
          };
        }
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          data?: { type?: string; createdAt?: string };
        };
        let message: string;
        if (
          res.status === 404 ||
          body?.message === "API_CREDENTIAL_NOT_FOUND" ||
          body?.data?.type === "API_CREDENTIAL"
        ) {
          message =
            "Token inválido ou revogado. Gere um novo em UTMify → Integrações → Webhook/API e cole aqui.";
        } else if (body?.data?.createdAt) {
          message = `A UTMify rejeitou a data: ${body.data.createdAt}`;
        } else if (body?.message) {
          message = `Erro ${res.status}: ${body.message}`;
        } else {
          message = `A UTMify respondeu erro ${res.status}.`;
        }
        return { tokenSuffix, ok: false, status: res.status, message };
      } catch (e) {
        const timeout = e instanceof Error && e.name === "TimeoutError";
        return {
          tokenSuffix,
          ok: false,
          message: timeout
            ? "Tempo esgotado ao contatar a UTMify (tente de novo)."
            : "Falha de rede ao contatar a UTMify.",
        };
      }
    }),
  );
}
