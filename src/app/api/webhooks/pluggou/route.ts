import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  getPaymentStatus,
  getWithdrawalStatus,
  isFailedStatus,
  isPaidStatus,
  isRefundedStatus,
  isChargedbackStatus,
  isPaidStatusW,
  isFailedStatusW,
  isRefundedStatusW,
} from "@/lib/providers/pluggou";
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
 * Webhook UNICO da Pluggou Cash — roteia por event_type:
 *   - "transaction"  → cobranca PIX (mark {Paid,Refunded,Chargedback,Expired})
 *   - "withdrawal"   → saque PIX (mark {Paid,Failed})
 *
 * Payload (ambos):
 *   { id: <event-uuid>, event_type: "transaction"|"withdrawal", data: {...} }
 *
 * Headers:
 *   X-Webhook-Event-ID  UUID do evento
 *   X-Webhook-Code      cod fixo do painel (whk_...)  ← anti-forge fraco
 *   User-Agent          "Pluggou-Webhook/1.0"
 *
 * A Pluggou NAO documenta HMAC. Seguranca eh 100% ANTI-FORGE por
 * RE-CONFIRMACAO via API: pra qualquer evento de DINHEIRO (paid/refund/
 * chargeback), re-consultamos GET /transactions/{id} ou /withdrawals/{id}
 * com as creds da conta e so processamos se a Pluggou confirmar. Mesmo
 * padrao adotado no SharkHub / SharkBanking. Se nenhuma conta confirmar
 * → 503 (retry).
 *
 * Correlacao:
 *   - transaction  → Transaction.provider="pluggou" + providerId=data.id
 *   - withdrawal   → Withdrawal.providerId=data.id (a Pluggou nao aceita
 *                    metadata em saques, entao correlacionamos pelo UUID
 *                    que guardamos na criacao).
 */

type WebhookBody = {
  id?: string;
  event_type?: string;
  data?: {
    id?: string;
    status?: string;
    paid_at?: string | null;
    [k: string]: unknown;
  };
};

export async function POST(request: Request) {
  // Anti-flood: 1200 webhooks/min/IP.
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-pluggou:${ip}`, 1200, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await request.text();
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventType = String(body.event_type ?? "").toLowerCase();
  const providerId = String(body.data?.id ?? "");
  const statusRaw = String(body.data?.status ?? "");

  if (!providerId || !statusRaw) {
    return NextResponse.json(
      { error: "missing_fields", required: ["data.id", "data.status"] },
      { status: 400 },
    );
  }

  if (eventType === "withdrawal") {
    return handleWithdrawal(providerId, statusRaw, body, rawBody);
  }
  // Default (transaction) — a Pluggou envia event_type="transaction" pra
  // cobranca, e alguns painels podem omitir. Trata como transaction.
  return handleTransaction(providerId, statusRaw, body, rawBody);
}

// ============ TRANSACTION ============

async function handleTransaction(
  providerId: string,
  statusRaw: string,
  body: WebhookBody,
  rawBody: string,
) {
  const tx = await prisma.transaction.findFirst({
    where: { provider: "pluggou", providerId },
    select: {
      id: true,
      status: true,
      providerPayload: true,
      userId: true,
    },
  });
  if (!tx) {
    // Pode ser COMPRA INTERNA (tema/subscription/espionagem) — desde
    // jul/2026 qualquer adquirente pode gerar PIX interno.
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

  // Idempotencia via status atual da tx (nao trava em race de falha).
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

  // ANTI-FORGE: pra estados terminais (PAID/REFUND/CHARGEBACK), re-confirma
  // via API. Tenta todas as contas Pluggou; se nenhuma confirmar → 503.
  let confirmedStatus = statusRaw;
  if (
    isPaidStatus(statusRaw) ||
    isRefundedStatus(statusRaw) ||
    isChargedbackStatus(statusRaw)
  ) {
    const existingPayload =
      (tx.providerPayload as Record<string, unknown> | null) ?? {};
    const acquirerId =
      typeof existingPayload.acquirer_id === "string"
        ? existingPayload.acquirer_id
        : null;
    const acqs = await resolveWebhookAcquirers("pluggou", acquirerId);
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
      }
    }
    if (apiConfirmed === null) {
      console.error(
        "[pluggou webhook] confirmação API falhou — recusando (retry)",
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
        key: `webhook:pluggou:tx:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "pluggou-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, confirmedStatus } as object,
        status: 200,
        endpoint: "webhook:pluggou",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

// ============ WITHDRAWAL ============

async function handleWithdrawal(
  providerId: string,
  statusRaw: string,
  body: WebhookBody,
  rawBody: string,
) {
  // Correlaciona pelo providerId (uuid do saque na Pluggou, que a gente
  // guardou em Withdrawal.providerId ao criar).
  const w = await prisma.withdrawal.findFirst({
    where: { providerId, providerAccount: { startsWith: "pluggou" } },
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

  // ANTI-FORGE: re-confirma via API pra estados terminais (paid/failed/refunded).
  // Diferente da tx, aqui usamos a conta que ENVIOU o saque (providerAccount).
  let confirmedStatus = statusRaw;
  if (
    isPaidStatusW(statusRaw) ||
    isFailedStatusW(statusRaw) ||
    isRefundedStatusW(statusRaw)
  ) {
    const acq = w.providerAccount
      ? await prisma.acquirer.findFirst({
          where: { code: w.providerAccount },
          select: { publicKey: true, secretKeyEnc: true },
        })
      : null;
    // Fallback: se a conta que ENVIOU nao ta mais no DB, tenta todas as
    // contas Pluggou ativas ate uma responder.
    const candidates = acq?.secretKeyEnc
      ? [acq]
      : await prisma.acquirer.findMany({
          where: {
            code: { startsWith: "pluggou" },
            active: true,
            secretKeyEnc: { not: null },
          },
          select: { publicKey: true, secretKeyEnc: true },
        });
    let apiConfirmed: string | null = null;
    let lastErr: unknown = null;
    for (const a of candidates) {
      if (!a.secretKeyEnc) continue;
      try {
        const s = await getWithdrawalStatus(providerId, {
          publicKey: a.publicKey ?? "",
          secretKey: decryptString(a.secretKeyEnc),
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
        "[pluggou webhook] withdrawal confirmação API falhou — recusando (retry)",
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

  if (isPaidStatusW(confirmedStatus) && w.status !== "PAID") {
    await markWithdrawalPaid(w.id);
  } else if (
    (isFailedStatusW(confirmedStatus) || isRefundedStatusW(confirmedStatus)) &&
    w.status !== "FAILED"
  ) {
    await markWithdrawalFailed(
      w.id,
      String(body.data?.status ?? confirmedStatus),
    );
  }

  // Auditoria idempotency — best-effort.
  prisma.idempotencyKey
    .create({
      data: {
        key: `webhook:pluggou:wd:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "pluggou-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, confirmedStatus } as object,
        status: 200,
        endpoint: "webhook:pluggou",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "pluggou" });
}
