import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  getPaymentStatus,
  isFailedStatus,
  isPaidStatus,
  isRefundedStatus,
} from "@/lib/providers/asaas";
import { decryptString } from "@/lib/crypto";
import { resolveWebhookAcquirers } from "@/lib/acquirers";
import {
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
} from "@/lib/transactions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook da Asaas.
 *
 * ── DUAS TRAVAS, NAO UMA ────────────────────────────────────────────────
 *
 * 1. TOKEN. A Asaas manda o token configurado no painel no header
 *    `asaas-access-token`. Comparado com ASAAS_WEBHOOK_TOKEN em tempo
 *    constante (timingSafeEqual) — comparar com === vaza o token byte a byte
 *    pra quem medir o tempo de resposta.
 *
 * 2. RE-CONFIRMACAO. Mesmo com token valido, estado terminal (pago/estorno)
 *    e re-consultado via GET /payments/{id} antes de creditar. Token
 *    vazado nao vira venda falsa. Mesmo padrao do sharkbanking/pluggou.
 *
 * ── POR QUE 200 EM QUASE TUDO ───────────────────────────────────────────
 *
 * A regra da Asaas: resposta fora da familia 2xx conta como falha, 15 falhas
 * seguidas INTERROMPEM a fila, e evento parado mais de 14 dias e APAGADO EM
 * DEFINITIVO. Ou seja, devolver erro pra evento que a gente simplesmente nao
 * conhece (tx de outro sistema, evento que nao tratamos) derruba a fila e nos
 * faz perder as vendas de verdade que vierem depois.
 *
 * Entao: 200 pra tudo que foi entendido, mesmo quando ignorado.
 * 401 so pra token errado (nao e retry, e invasor).
 * 503 so quando a re-confirmacao caiu e a gente QUER que reenviem.
 *
 * ── EVENTOS ─────────────────────────────────────────────────────────────
 *
 * Body: { event: "PAYMENT_RECEIVED", payment: { id, status, value, ... } }
 *
 * PAYMENT_CONFIRMED NAO credita, de proposito — no Asaas ele significa "pago,
 * mas o valor ainda nao esta disponivel na conta". No PIX o fluxo nem passa
 * por ele (CREATED vai direto pra RECEIVED); em cartao/boleto passar por ele
 * seria repassar dinheiro que a plataforma ainda nao recebeu.
 */

type WebhookBody = {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    externalReference?: string | null;
    [k: string]: unknown;
  };
};

/** Compara em tempo constante. Tamanhos diferentes já retornam false. */
function tokenOk(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado) {
    // Sem token configurado, a unica trava seria a re-confirmacao. Preferimos
    // recusar: webhook de dinheiro sem segredo e um endpoint aberto.
    console.error("[asaas webhook] ASAAS_WEBHOOK_TOKEN nao configurado");
    return false;
  }
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  // Anti-flood: 1200 webhooks/min/IP (folga — venda perdida é pior que 429).
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-asaas:${ip}`, 1200, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!tokenOk(request.headers.get("asaas-access-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const providerId = String(body.payment?.id ?? "");
  const statusRaw = String(body.payment?.status ?? "").toUpperCase();
  const evento = String(body.event ?? "");

  if (!providerId || !statusRaw) {
    // 200: body entendido, so nao tem o que fazer. 400 aqui contaria como
    // falha e caminharia pra interrupcao da fila.
    return NextResponse.json(
      { ok: true, message: "missing_fields", event: evento },
      { status: 200 },
    );
  }

  const tx = await prisma.transaction.findFirst({
    where: { provider: "asaas", providerId },
    select: { id: true, status: true, providerPayload: true, userId: true },
  });
  if (!tx) {
    // Pode ser uma COMPRA INTERNA (tema/subscription/espionagem) — desde
    // jul/2026 QUALQUER adquirente pode gerar PIX interno.
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
    return NextResponse.json(
      { ok: true, message: "unknown_transaction" },
      { status: 200 },
    );
  }

  // IDEMPOTÊNCIA via status da tx (não trava em race de falha).
  const targetStatusFromBody = isPaidStatus(statusRaw)
    ? "PAID"
    : isRefundedStatus(statusRaw)
      ? "REFUNDED"
      : isFailedStatus(statusRaw)
        ? "EXPIRED"
        : null;
  if (targetStatusFromBody && tx.status === targetStatusFromBody) {
    return NextResponse.json({ ok: true, already: targetStatusFromBody });
  }

  // ANTI-FORGE: pra estados terminais (PAID/REFUND), RE-CONFIRMA via API.
  let confirmedStatus = statusRaw;
  if (isPaidStatus(statusRaw) || isRefundedStatus(statusRaw)) {
    const existingPayload =
      (tx.providerPayload as Record<string, unknown> | null) ?? {};
    const acquirerId =
      typeof existingPayload.acquirer_id === "string"
        ? existingPayload.acquirer_id
        : null;
    const acqs = await resolveWebhookAcquirers("asaas", acquirerId);
    let apiConfirmed: string | null = null;
    let lastErr: unknown = null;
    for (const acq of acqs) {
      try {
        const s = await getPaymentStatus(providerId, {
          publicKey: acq.publicKey ?? "",
          secretKey: decryptString(acq.secretKeyEnc!),
        });
        if (s?.status && s.status !== "UNKNOWN") {
          apiConfirmed = s.status;
          break;
        }
      } catch (e) {
        lastErr = e;
        // creds erradas pra essa conta — tenta a próxima
      }
    }
    if (apiConfirmed === null) {
      console.error(
        "[asaas webhook] confirmação API falhou em todas as contas — recusando (retry)",
        providerId,
        lastErr,
      );
      return NextResponse.json(
        { error: "confirmation_unavailable", retry: true },
        { status: 503 },
      );
    }
    confirmedStatus = apiConfirmed;
  }

  // Salva o webhook bruto no providerPayload (preserva os outros campos).
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
    // Paga mesmo se a tx ja estava EXPIRED do nosso lado: a Asaas nao expira
    // o QR junto com a nossa janela, entao o cliente consegue pagar depois.
    // Recusar aqui seria ficar com o dinheiro sem entregar a venda.
    await markTransactionPaid(tx.id);
    const payload = existingPayload as Record<string, unknown>;
    if (payload?.acquirer_id && typeof payload.acquirer_id === "string") {
      const { recordAcquirerApproval } = await import("@/lib/acquirers");
      await recordAcquirerApproval(payload.acquirer_id, tx.userId).catch(
        () => {},
      );
    }
  } else if (isRefundedStatus(confirmedStatus) && tx.status !== "REFUNDED") {
    await markTransactionRefunded(tx.id);
  } else if (isFailedStatus(confirmedStatus) && tx.status === "PENDING") {
    await markTransactionExpired(tx.id);
  }

  // Auditoria — IdempotencyKey APÓS o processamento. Best-effort.
  prisma.idempotencyKey
    .create({
      data: {
        key: `webhook:asaas:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "asaas-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, confirmedStatus, evento } as object,
        status: 200,
        endpoint: "webhook:asaas",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "asaas" });
}
