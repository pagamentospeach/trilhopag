import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  getPaymentStatus,
  isFailedStatus,
  isPaidStatus,
  isRefundedStatus,
} from "@/lib/providers/sharkbanking";
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
 * Webhook handler da Shark Banking (white-label Shield Tecnologia).
 *
 * A Shark NÃO documenta secret/assinatura de webhook — então a segurança é
 * 100% ANTI-FORGE por RE-CONFIRMAÇÃO via API: pra QUALQUER estado terminal
 * (PAID/REFUND) re-consultamos GET /v1/transactions/{id} com as creds da conta
 * e só creditamos se a Shark confirmar. O `id` da cobrança NÃO é secreto (vai
 * na resposta da criação), então confiar no body seria forjável — por isso o
 * re-check é OBRIGATÓRIO. Se nenhuma conta confirmar → 503 (retry).
 *
 * Payload (doc): { type:"transaction", objectId, url, data:{ id, amount,
 *   paymentMethod, status, paidAt, secureId, pix:{qrcode}, customer{...} } }.
 * O id pode vir em data.id, objectId ou id (topo). Casamos com
 * Transaction.providerId (o id NUMÉRICO que guardamos String() na criação).
 */

type WebhookBody = {
  type?: string;
  objectId?: string | number;
  id?: string | number;
  status?: string;
  data?: {
    id?: string | number;
    status?: string;
    [k: string]: unknown;
  };
};

export async function POST(request: Request) {
  // Anti-flood: 1200 webhooks/min/IP (folga — venda perdida é pior que 429).
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-sharkbanking:${ip}`, 1200, 60_000);
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

  const providerId = String(
    body.data?.id ?? body.objectId ?? body.id ?? "",
  );
  const statusRaw = String(
    body.data?.status ?? body.status ?? "",
  ).toUpperCase();

  if (!providerId || !statusRaw) {
    return NextResponse.json(
      { error: "missing_fields", required: ["data.id|objectId", "data.status"] },
      { status: 400 },
    );
  }

  const tx = await prisma.transaction.findFirst({
    where: { provider: "sharkbanking", providerId },
    select: {
      id: true,
      status: true,
      providerPayload: true,
      userId: true,
    },
  });
  if (!tx) {
    // Pode ser uma COMPRA INTERNA (tema/subscription/espionagem) —
    // desde jul/2026 QUALQUER adquirente pode gerar PIX interno.
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
    const acqs = await resolveWebhookAcquirers("sharkbanking", acquirerId);
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
        "[sharkbanking webhook] confirmação API falhou em todas as contas — recusando (retry)",
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
        key: `webhook:sharkbanking:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "sharkbanking-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, confirmedStatus } as object,
        status: 200,
        endpoint: "webhook:sharkbanking",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "sharkbanking" });
}
