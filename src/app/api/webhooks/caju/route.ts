import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  isFailedStatus,
  isPaidStatus,
  isPendingStatus,
  isRefundedStatus,
  isChargedbackStatus,
  getPaymentStatus,
} from "@/lib/providers/caju";
import {
  markTransactionChargedback,
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
} from "@/lib/transactions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook da Caju — configurado no painel deles com URL
 * https://trilhopag.com/api/webhooks/caju.
 *
 * Formato REAL do body (documentado pelo david 10/07/2026):
 *   {
 *     "evento": "pagamento",
 *     "txid": "<uuid>",
 *     "valor": 9990,             // centavos
 *     "nome": "Cliente Nome",
 *     "email": "cliente@x.com",
 *     "telefone": "11999999999",
 *     "cpf": "12345678900",
 *     "status": "paid" | "med" | "refund",
 *     "data": "2026-06-29T15:30:45.123Z"
 *   }
 *
 * Vocabulario de status:
 *   paid   → transacao paga
 *   med    → Mecanismo Especial de Devolucao PIX (equivalente a chargeback)
 *   refund → estornada
 *
 * MATCHING de tx: primeiro tenta providerId=body.txid. Se nao acha (a Caju
 * pode ter internamente 2 IDs — o UUID retornado na criacao vs o UUID
 * enviado no webhook), FALLBACK por customerEmail + valor + janela de
 * 30min. Melhor achar do que perder venda.
 */

type WebhookBody = {
  // Formato oficial Caju (10/07/2026)
  evento?: string;
  txid?: string;
  valor?: number;
  nome?: string;
  email?: string;
  telefone?: string;
  cpf?: string;
  status?: string;
  data?: string;
  // Fallbacks pra futuras variantes / adquirentes internas
  id?: string;
  transactionId?: string;
  payment_id?: string;
  payment_status?: string;
  state?: string;
  amount?: number;
  [k: string]: unknown;
};

function extractProviderId(body: WebhookBody): string {
  return String(
    body.txid ?? body.id ?? body.transactionId ?? body.payment_id ?? "",
  ).trim();
}

function extractStatus(body: WebhookBody): string {
  return String(
    body.status ?? body.payment_status ?? body.state ?? "",
  ).trim();
}

function extractAmountCents(body: WebhookBody): number | null {
  const raw = body.valor ?? body.amount;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw);
}

function extractEmail(body: WebhookBody): string | null {
  const v = body.email;
  if (typeof v !== "string" || !v.includes("@")) return null;
  return v.trim().toLowerCase();
}

export async function POST(request: Request) {
  // Anti-flood: 1200 webhooks/min/IP.
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-caju:${ip}`, 1200, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await request.text();
  // LOG DETALHADO (10/07/2026): a Caju nao documentou o shape do webhook,
  // entao registramos TUDO (headers + body) pra diagnosticar quando o
  // primeiro webhook real bater. Facil deducir o formato correto olhando
  // o log e ajustar os extractors abaixo.
  const headersLog: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    if (!/^cookie$/i.test(k)) headersLog[k] = v;
  });
  console.log(
    "[caju webhook] IN",
    JSON.stringify({ ip, headers: headersLog, body: rawBody.slice(0, 2000) }),
  );

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const providerId = extractProviderId(body);
  const statusRaw = extractStatus(body);

  if (!providerId) {
    console.warn("[caju webhook] missing providerId — body keys:", Object.keys(body));
    return NextResponse.json(
      {
        error: "missing_fields",
        required: ["txid | id | transactionId | payment_id"],
      },
      { status: 400 },
    );
  }
  if (!statusRaw) {
    console.warn("[caju webhook] missing status — body keys:", Object.keys(body));
    return NextResponse.json(
      {
        error: "missing_fields",
        required: ["status | payment_status | state"],
      },
      { status: 400 },
    );
  }

  return handleTransaction(providerId, statusRaw, body, rawBody);
}

async function handleTransaction(
  providerId: string,
  statusRaw: string,
  body: WebhookBody,
  rawBody: string,
) {
  // Match #1: providerId direto (padrao — funciona quando o txid do webhook
  // eh o mesmo UUID retornado na criacao).
  let tx = await prisma.transaction.findFirst({
    where: { provider: "caju", providerId },
    select: {
      id: true,
      status: true,
      providerPayload: true,
      userId: true,
    },
  });

  // Match #2 (FALLBACK 10/07/2026): a Caju pode gerar txid diferente pro
  // webhook vs pro create (2 IDs internos). Busca por
  // customerEmail + amountCents + tempo (ultimos 60min PENDING).
  // Sem match, cai pro fluxo original de "unknown_transaction".
  if (!tx) {
    const amountCents = extractAmountCents(body);
    const email = extractEmail(body);
    if (amountCents && email) {
      const candidate = await prisma.transaction.findFirst({
        where: {
          provider: "caju",
          status: "PENDING",
          amountCents,
          customerEmail: email,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          providerPayload: true,
          userId: true,
          providerId: true,
        },
      });
      if (candidate) {
        console.log(
          `[caju webhook] match FALLBACK (email+amount): webhook_txid=${providerId} → tx=${candidate.id} (providerId=${candidate.providerId})`,
        );
        // Reatribui o providerId da tx pro txid do webhook — proximos
        // webhooks (refund, med) matcham direto pelo #1. Merge no payload
        // pra preservar rastro (webhook_txid + original_provider_id).
        const mergedPayload = {
          ...((candidate.providerPayload as Record<string, unknown> | null) ??
            {}),
          webhook_txid: providerId,
          original_provider_id: candidate.providerId,
        };
        await prisma.transaction.update({
          where: { id: candidate.id },
          data: {
            providerId,
            providerPayload: mergedPayload as never,
          },
        });
        tx = {
          id: candidate.id,
          status: candidate.status,
          // Passa o payload JA MERGED pra proximos updates (raw_webhook)
          // preservarem o rastro do fallback.
          providerPayload: mergedPayload,
          userId: candidate.userId,
        };
      }
    }
  }

  if (!tx) {
    // Pode ser COMPRA INTERNA (tema/subscription/espionagem) — qualquer
    // adquirente pode gerar PIX interno.
    const { tryHandleInternalPurchaseWebhook } = await import(
      "@/lib/internal-purchases"
    );
    const internal = await tryHandleInternalPurchaseWebhook({
      pixProviderId: providerId,
      confirmedPaid: isPaidStatus(statusRaw),
    });
    if (internal.isInternal) {
      return NextResponse.json({ ok: true, internal: true });
    }
    // Log detalhado — ajuda diagnosticar quando a Caju bater com formato
    // novo que nao conseguimos matchar. Sem isso o webhook some sem trace.
    console.warn(
      `[caju webhook] UNKNOWN TX — providerId=${providerId} status=${statusRaw} amount=${extractAmountCents(body)} email=${extractEmail(body)}`,
    );
    return NextResponse.json(
      { ok: true, message: "unknown_transaction" },
      { status: 200 },
    );
  }

  // Idempotencia via status atual da tx.
  const targetStatusFromBody = isPaidStatus(statusRaw)
    ? "PAID"
    : isRefundedStatus(statusRaw)
      ? "REFUNDED"
      : isChargedbackStatus(statusRaw)
        ? "CHARGEBACK"
        : isFailedStatus(statusRaw)
          ? "EXPIRED"
          : null;
  if (targetStatusFromBody && tx.status === targetStatusFromBody) {
    return NextResponse.json({ ok: true, already: targetStatusFromBody });
  }

  // ===================== ANTI-FORGE (restaurado 01/08/2026) =====================
  //
  // HISTORICO: em 10/07/2026 o anti-forge foi REMOVIDO porque a Caju nao
  // tinha endpoint de status funcional — /api/bravive-payment-status/{txid}
  // devolvia "Payment not found" pra tudo. Com a re-consulta sempre falhando,
  // TODO webhook legitimo era rejeitado: o David pagou R$10 no
  // seller-l@exemplo.com, o webhook devia marcar PAID e era recusado com
  // 503 em retry infinito. Passamos entao a confiar no payload cru.
  //
  // Agora a Caju entregou GET /api/vendas/{txid}/status e ele FUNCIONA, entao
  // da pra proteger de novo. Mas o desenho abaixo NAO repete o erro antigo:
  //
  //   consulta CONFIRMA pago    → segue (caminho normal)
  //   consulta DIZ "aguardando" → rejeita 409 (contradicao explicita = forja)
  //   consulta FALHA / sem key  → FAIL-OPEN, segue com o payload do webhook
  //
  // A distincao entre "a Caju afirma que nao pagou" e "nao consegui perguntar
  // pra Caju" e o ponto inteiro. Tratar os dois como negativa foi exatamente
  // o bug de julho.
  //
  // So re-consultamos quando o webhook afirma PAGO. Ninguem forja um MED ou
  // um refund contra si mesmo — esses seguem direto, e re-consultar custaria
  // ~1-8s (Render, cold start) em cima de cada webhook.
  //
  // REDE EXTRA: se um webhook legitimo cair aqui por lag de propagacao da
  // Caju, o cron reconcile-pending (10 em 10 min) varre as PENDING e marca
  // paga pelo mesmo caminho. Nada se perde de forma permanente.
  let confirmedStatus = statusRaw;

  if (isPaidStatus(statusRaw)) {
    try {
      const remote = await getPaymentStatus(providerId);
      if (isPaidStatus(remote.status)) {
        confirmedStatus = remote.status;
      } else if (isPendingStatus(remote.status)) {
        console.warn(
          `[caju webhook] ANTI-FORGE bloqueou: webhook diz "${statusRaw}" mas a Caju diz "${remote.status}" — providerId=${providerId} tx=${tx.id}`,
        );
        return NextResponse.json(
          {
            ok: false,
            error: "status_mismatch",
            webhook: statusRaw,
            remote: remote.status,
          },
          { status: 409 },
        );
      }
      // Outro status remoto (med/refund/desconhecido): nao temos base pra
      // afirmar forja. Segue com o payload do webhook.
    } catch (e) {
      // FAIL-OPEN DELIBERADO. Caju fora do ar, timeout, CAJU_API_KEY ausente
      // — nada disso e evidencia de fraude, e bloquear aqui reintroduz o bug
      // de julho. Loga alto pra dar pra auditar depois.
      console.warn(
        `[caju webhook] anti-forge indisponivel (${e instanceof Error ? e.message : String(e)}) — seguindo com o payload cru, providerId=${providerId}`,
      );
    }
  }

  // Salva o webhook bruto no providerPayload.
  const existingPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      providerPayload: {
        ...existingPayload,
        raw_webhook: body as unknown as object,
        wh_at: new Date().toISOString(),
      } as never,
    },
  });

  if (isPaidStatus(confirmedStatus) && tx.status !== "PAID") {
    await markTransactionPaid(tx.id);
    const payload = existingPayload as Record<string, unknown>;
    if (payload?.acquirer_id && typeof payload.acquirer_id === "string") {
      const { recordAcquirerApproval } = await import("@/lib/acquirers");
      await recordAcquirerApproval(payload.acquirer_id, tx.userId).catch(
        () => {},
      );
    }
  } else if (
    isRefundedStatus(confirmedStatus) &&
    tx.status !== "REFUNDED"
  ) {
    await markTransactionRefunded(tx.id);
  } else if (
    isChargedbackStatus(confirmedStatus) &&
    tx.status !== "CHARGEBACK"
  ) {
    await markTransactionChargedback(tx.id);
  } else if (isFailedStatus(confirmedStatus) && tx.status === "PENDING") {
    await markTransactionExpired(tx.id);
  }

  // Auditoria idempotency — best-effort.
  prisma.idempotencyKey
    .create({
      data: {
        key: `webhook:caju:tx:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "caju-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, confirmedStatus } as object,
        status: 200,
        endpoint: "webhook:caju",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
