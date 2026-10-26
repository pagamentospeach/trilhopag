import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  getPaymentStatus,
  isFailedStatus,
  isPaidStatus,
  isRefundedStatus,
  isChargedbackStatus,
  isPaidStatusW,
  isFailedStatusW,
  isRefundedStatusW,
} from "@/lib/providers/pixzy";
import { decryptString } from "@/lib/crypto";
import { resolveWebhookAcquirers } from "@/lib/acquirers";
import {
  markTransactionChargedback,
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
} from "@/lib/transactions";
import { markWithdrawalFailed, markWithdrawalPaid } from "@/lib/withdrawals";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook UNICO da Pixzy Pay — roteia por prefixo do event:
 *   "transaction_*"  → cobranca PIX (mark {Paid,Refunded,Chargedback,Expired})
 *   "approved" | "rejected" (do saque) OU "withdrawal_*" → saque
 *
 * Payload transacao:
 *   { event: "transaction_paid"|"transaction_created"|"transaction_refunded"
 *            |"transaction_cancelled"|"transaction_chargeback"|
 *             "transaction_expired"|"transaction_failed",
 *     transaction: { id, external_id, amount, status, sale_origin, ip_address,
 *                    created_at, updated_at },
 *     client: {...}, products: [...], utms: {...} }
 *
 * Payload saque:
 *   { event: "approved"|"rejected",
 *     withdrawal: { id, amount, status, pix_key, pix_key_type,
 *                   created_at, updated_at } }
 *
 * Headers: sem HMAC documentado — anti-forge por RE-CONFIRMACAO via
 * GET /transactions/{id} pra transacoes. Saque nao tem endpoint publico
 * de consulta — confiamos no primeiro webhook + idempotency (chave =
 * "wd:{providerId}:{status}" impede replay).
 *
 * Retries Pixzy: ate 3x a cada 60s se resposta != 2xx. Timeout esperado:
 * ~10s. Respondemos 200 rapido pra evitar re-envio; 503 soh quando nao
 * conseguimos confirmar por API (caso de forge suspeito).
 *
 * Correlacao:
 *   - transaction  → Transaction.provider="pixzy" + providerId=transaction.id
 *                    (fallback: metadata.transaction_id se presente)
 *   - withdrawal   → Withdrawal.providerId=withdrawal.id + providerAccount
 *                    startsWith "pixzy"
 */

type PixzyTransactionEvent = {
  event?: string;
  transaction?: {
    id?: string;
    external_id?: string;
    status?: string;
    amount?: number;
    [k: string]: unknown;
  };
  client?: Record<string, unknown>;
  products?: unknown[];
  utms?: Record<string, unknown>;
};

type PixzyWithdrawalEvent = {
  event?: string;
  withdrawal?: {
    id?: string;
    status?: string;
    amount?: number;
    pix_key?: string;
    pix_key_type?: string;
    [k: string]: unknown;
  };
};

type PixzyWebhookBody = PixzyTransactionEvent & PixzyWithdrawalEvent;

export async function POST(request: Request) {
  // Anti-flood: 1200 webhooks/min/IP (mesmo teto do pluggou).
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-pixzy:${ip}`, 1200, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await request.text();
  let body: PixzyWebhookBody;
  try {
    body = JSON.parse(rawBody) as PixzyWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = String(body.event ?? "").toLowerCase().trim();

  // ============ WITHDRAWAL ============
  // Pixzy webhook de saque usa event "approved" | "rejected" (sem prefixo
  // "withdrawal_"). Se veio o objeto `withdrawal` no body, eh saque.
  if (
    body.withdrawal !== undefined ||
    event === "approved" ||
    event === "rejected" ||
    event.startsWith("withdrawal_")
  ) {
    return handleWithdrawal(body, rawBody, event);
  }

  // ============ TRANSACTION ============
  // Todo evento "transaction_*" cai aqui. Se veio soh `transaction` no body
  // sem event, tratamos como transacao tambem (defensivo — soh explode se
  // faltar id/status).
  return handleTransaction(body, rawBody, event);
}

// ============ TRANSACTION ============

async function handleTransaction(
  body: PixzyWebhookBody,
  rawBody: string,
  event: string,
) {
  const providerId = String(body.transaction?.id ?? "");
  const statusRaw = String(body.transaction?.status ?? "");

  if (!providerId) {
    return NextResponse.json(
      { error: "missing_fields", required: ["transaction.id"] },
      { status: 400 },
    );
  }

  // Deriva status do EVENT quando `transaction.status` nao veio (defensivo —
  // Pixzy sempre manda status, mas alguns event names ja implicam o status).
  const derivedStatus = statusRaw || eventToStatus(event);
  if (!derivedStatus) {
    return NextResponse.json(
      { error: "unknown_event", event },
      { status: 400 },
    );
  }

  const tx = await prisma.transaction.findFirst({
    where: { provider: "pixzy", providerId },
    select: {
      id: true,
      status: true,
      providerPayload: true,
      userId: true,
    },
  });
  if (!tx) {
    // Pode ser COMPRA INTERNA (tema/subscription/espionagem).
    const { tryHandleInternalPurchaseWebhook } = await import(
      "@/lib/internal-purchases"
    );
    const internal = await tryHandleInternalPurchaseWebhook({
      pixProviderId: providerId,
      confirmedPaid: isPaidStatus(derivedStatus),
    });
    if (internal.isInternal) {
      return NextResponse.json({ ok: true, internal: true });
    }
    return NextResponse.json(
      { ok: true, message: "unknown_transaction" },
      { status: 200 },
    );
  }

  // Idempotencia: se ja tem esse status, no-op.
  const targetStatus = isPaidStatus(derivedStatus)
    ? "PAID"
    : isRefundedStatus(derivedStatus)
      ? "REFUNDED"
      : isChargedbackStatus(derivedStatus)
        ? "CHARGEBACK"
        : isFailedStatus(derivedStatus)
          ? "EXPIRED"
          : null;
  if (targetStatus && tx.status === targetStatus) {
    return NextResponse.json({ ok: true, already: targetStatus });
  }

  // ANTI-FORGE: pra estados terminais (PAID/REFUND/CHARGEBACK), re-confirma
  // via API. Tenta todas as contas Pixzy; se nenhuma confirmar → 503.
  let confirmedStatus = derivedStatus;
  if (
    isPaidStatus(derivedStatus) ||
    isRefundedStatus(derivedStatus) ||
    isChargedbackStatus(derivedStatus)
  ) {
    const existingPayload =
      (tx.providerPayload as Record<string, unknown> | null) ?? {};
    const acquirerId =
      typeof existingPayload.acquirer_id === "string"
        ? existingPayload.acquirer_id
        : null;
    const acqs = await resolveWebhookAcquirers("pixzy", acquirerId);
    let apiConfirmed: string | null = null;
    let lastErr: unknown = null;
    for (const acq of acqs) {
      if (!acq.secretKeyEnc) continue;
      try {
        const s = await getPaymentStatus(providerId, {
          publicKey: acq.publicKey ?? "",
          secretKey: decryptString(acq.secretKeyEnc),
        });
        if (s?.status && s.status !== "UNKNOWN") {
          apiConfirmed = s.status;
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    if (apiConfirmed === null) {
      console.error(
        "[pixzy webhook] confirmação API falhou — recusando (retry)",
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
        key: `webhook:pixzy:tx:${providerId}:${derivedStatus}`,
        bodyHash: createHmac("sha256", "pixzy-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, confirmedStatus } as object,
        status: 200,
        endpoint: "webhook:pixzy",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

// ============ WITHDRAWAL ============

async function handleWithdrawal(
  body: PixzyWebhookBody,
  rawBody: string,
  event: string,
) {
  const providerId = String(body.withdrawal?.id ?? "");
  const statusRaw = String(body.withdrawal?.status ?? "") || event;

  if (!providerId) {
    return NextResponse.json(
      { error: "missing_fields", required: ["withdrawal.id"] },
      { status: 400 },
    );
  }

  const w = await prisma.withdrawal.findFirst({
    where: { providerId, providerAccount: { startsWith: "pixzy" } },
    select: { id: true, status: true, providerAccount: true },
  });
  if (!w) {
    return NextResponse.json(
      { ok: true, message: "unknown_withdrawal" },
      { status: 200 },
    );
  }

  // Idempotencia: se ja processado, no-op.
  if (
    (isPaidStatusW(statusRaw) && w.status === "PAID") ||
    (isFailedStatusW(statusRaw) && w.status === "FAILED") ||
    (isRefundedStatusW(statusRaw) && w.status === "FAILED")
  ) {
    return NextResponse.json({ ok: true, already: w.status });
  }

  // Pixzy nao expoe GET /withdrawals/{id} publico — nao ha como
  // re-confirmar via API. Confiamos no webhook + a idempotency key acima
  // impede replay (mesma tupla providerId+status nao dispara 2x).
  // Se um dia a Pixzy publicar GET pra saques, adicionar re-confirmacao
  // aqui igual ao handleTransaction acima.

  if (isPaidStatusW(statusRaw) && w.status !== "PAID") {
    await markWithdrawalPaid(w.id);
  } else if (
    (isFailedStatusW(statusRaw) || isRefundedStatusW(statusRaw)) &&
    w.status !== "FAILED"
  ) {
    await markWithdrawalFailed(w.id, statusRaw || event);
  }

  // Auditoria idempotency — best-effort.
  prisma.idempotencyKey
    .create({
      data: {
        key: `webhook:pixzy:wd:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "pixzy-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, statusRaw } as object,
        status: 200,
        endpoint: "webhook:pixzy",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

/** Deriva status a partir do nome do event (fallback quando
 *  `transaction.status` nao vem). Ex: "transaction_paid" → "paid". */
function eventToStatus(event: string): string {
  if (event.startsWith("transaction_")) return event.slice("transaction_".length);
  return "";
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "pixzy" });
}
