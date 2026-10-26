import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  eventToStatus,
  getPaymentStatus,
  isDisputedStatus,
  isDisputeEvent,
  isFailedStatus,
  isPaidStatus,
  isRefundedStatus,
} from "@/lib/providers/abacatepay";
import { decryptString } from "@/lib/crypto";
import { resolveWebhookAcquirers } from "@/lib/acquirers";
import {
  markTransactionChargedback,
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
} from "@/lib/transactions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook handler da AbacatePay.
 *
 * Docs: https://docs.abacatepay.com/pages/webhooks
 *
 * Autenticação: a AbacatePay manda o secret na QUERY STRING — você cadastra a
 * URL no painel JÁ com `?webhookSecret=SEU_SECRET`. A gente compara com
 * ABACATEPAY_WEBHOOK_SECRET (timing-safe). Sem o env → bloqueia sempre.
 *
 * Anti-forge (defesa em profundidade): pra PIX (pixQrCode), além do secret,
 * RE-CONFIRMA o status via GET /pixQrCode/check antes de creditar — assim,
 * mesmo se o secret vazar (fica numa URL), ninguém forja um PAGO. Cartão
 * (billing) confia no secret validado (o v1 não tem GET de billing único
 * confiável; o secret na URL é a auth).
 *
 * EVENTOS (jun/2026, conferido na doc): o PIX inline (pixQrCode / "checkout
 * transparente", criado em POST /pixQrCode/create) dispara `transparent.completed`
 * quando pago (e `transparent.refunded` / `transparent.disputed`). NÃO é
 * `billing.paid` — esse é do checkout HOSPEDADO/cartão. Por isso, se o webhook
 * do painel só assinar billing.*, o PIX nunca notifica em tempo real (cai só na
 * reconciliação a cada 10 min do cron reconcile-pending). Pra crédito INSTANTÂNEO
 * o painel deve assinar também `transparent.completed`/`transparent.refunded`.
 *
 * Payload: { id, event, devMode, data:{ … } }. O id da cobrança pode vir em
 * data.pixQrCode.id, data.transparent.id, data.checkout.id, data.billing.id,
 * data.payment.id ou data.id — extraímos de TODOS e casamos com
 * Transaction.providerId (o `pix_char_…` que guardamos na criação).
 */

type WebhookBody = {
  id?: string;
  event?: string;
  devMode?: boolean;
  data?: {
    id?: string;
    status?: string;
    pixQrCode?: { id?: string; status?: string };
    // `transparent.*` é o objeto do PIX inline; `checkout.*` do hospedado.
    transparent?: { id?: string; status?: string };
    checkout?: { id?: string; status?: string };
    billing?: { id?: string; status?: string };
    payment?: { id?: string; status?: string; amount?: number };
    [k: string]: unknown;
  };
};

function verifySecret(url: URL): { ok: boolean; reason?: string } {
  const expected = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!expected) {
    // Sem secret configurado = BLOQUEIA SEMPRE (inclusive dev). Defina o env.
    return { ok: false, reason: "no_secret_configured" };
  }
  // A AbacatePay manda o secret na query (?webhookSecret=). Aceita QUALQUER
  // valor de webhookSecret/secret que bata — robusto a duplicatas (secret no
  // campo do painel + na URL ao mesmo tempo) e à ordem dos params.
  const candidates = [
    ...url.searchParams.getAll("webhookSecret"),
    ...url.searchParams.getAll("secret"),
  ].filter((s) => s.length > 0);
  if (candidates.length === 0) return { ok: false, reason: "missing_secret" };
  const exp = Buffer.from(expected);
  const match = candidates.some((c) => {
    const cand = Buffer.from(c);
    return cand.length === exp.length && timingSafeEqual(cand, exp);
  });
  if (!match) return { ok: false, reason: "invalid_secret" };
  return { ok: true };
}

export async function POST(request: Request) {
  // Anti-flood: 600 webhooks/min/IP
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-abacatepay:${ip}`, 600, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const secretCheck = verifySecret(url);
  if (!secretCheck.ok) {
    console.warn("[abacatepay webhook] reject:", secretCheck.reason);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const providerId = String(
    body.data?.pixQrCode?.id ??
      body.data?.transparent?.id ??
      body.data?.checkout?.id ??
      body.data?.billing?.id ??
      body.data?.payment?.id ??
      body.data?.id ??
      "",
  );
  const statusFromData = String(
    body.data?.pixQrCode?.status ??
      body.data?.transparent?.status ??
      body.data?.checkout?.status ??
      body.data?.billing?.status ??
      body.data?.payment?.status ??
      body.data?.status ??
      "",
  );
  // DISPUTA / MED PIX: detecta pelo nome do evento (*.disputed) OU pelo status.
  // Vira CHARGEBACK na Trilho (debita o seller). Forçamos statusRaw="DISPUTED"
  // pra passar o guard abaixo mesmo quando o evento não traz data.status.
  const disputed = isDisputeEvent(event) || isDisputedStatus(statusFromData);
  const statusRaw = disputed
    ? "DISPUTED"
    : statusFromData
      ? statusFromData.toUpperCase()
      : eventToStatus(event);

  if (!providerId || !statusRaw) {
    return NextResponse.json(
      { error: "missing_fields", required: ["data.*.id", "event|data.*.status"] },
      { status: 400 },
    );
  }

  const eventKey = `webhook:abacatepay:${providerId}:${event || statusRaw}`;

  const tx = await prisma.transaction.findFirst({
    where: { provider: "abacatepay", providerId },
    select: {
      id: true,
      status: true,
      providerPayload: true,
      userId: true,
      method: true,
    },
  });
  if (!tx) {
    // Pode ser COMPRA INTERNA (funções pagas do gateway). Confirma na API
    // AbacatePay antes de aplicar (mesma proteção anti-forja das vendas).
    const internal = await prisma.internalPurchase.findFirst({
      where: { pixProviderId: providerId },
      select: { id: true, status: true },
    });
    if (internal) {
      if (internal.status !== "paid" && isPaidStatus(statusRaw)) {
        const acqs = await resolveWebhookAcquirers("abacatepay", null);
        let apiConfirmed: string | null = null;
        for (const acq of acqs) {
          try {
            const s = await getPaymentStatus(providerId, {
              publicKey: acq.publicKey ?? "",
              secretKey: decryptString(acq.secretKeyEnc!),
            });
            if (s?.status) {
              apiConfirmed = s.status;
              break;
            }
          } catch {
            // creds erradas pra essa conta — tenta a próxima
          }
        }
        if (apiConfirmed && isPaidStatus(apiConfirmed)) {
          const { applyInternalPurchase } = await import(
            "@/lib/internal-purchases"
          );
          const r = await applyInternalPurchase(internal.id);
          if (!r.ok) {
            console.error(
              "[abacatepay webhook] applyInternalPurchase failed:",
              internal.id,
              r.error,
            );
          }
        }
      }
      return NextResponse.json({ ok: true, internal: true });
    }
    return NextResponse.json(
      { ok: true, message: "unknown_transaction" },
      { status: 200 },
    );
  }

  // CONFIRMAÇÃO anti-forge pra estados TERMINAIS (PAID/REFUND) — só PIX, que
  // tem o endpoint /pixQrCode/check. Cartão (billing) confia no secret.
  let confirmedStatus = statusRaw;
  if (
    tx.method === "PIX" &&
    (isPaidStatus(statusRaw) || isRefundedStatus(statusRaw))
  ) {
    const existingPayload =
      (tx.providerPayload as Record<string, unknown> | null) ?? {};
    const acquirerId =
      typeof existingPayload.acquirer_id === "string"
        ? existingPayload.acquirer_id
        : null;
    const acqs = await resolveWebhookAcquirers("abacatepay", acquirerId);
    let apiConfirmed: string | null = null;
    let lastErr: unknown = null;
    for (const acq of acqs) {
      try {
        const s = await getPaymentStatus(providerId, {
          publicKey: acq.publicKey ?? "",
          secretKey: decryptString(acq.secretKeyEnc!),
        });
        if (s?.status) {
          apiConfirmed = s.status;
          break;
        }
      } catch (e) {
        lastErr = e;
        // creds erradas pra essa conta — tenta a próxima
      }
    }
    if (apiConfirmed === null) {
      // Não deu pra confirmar em NENHUMA conta. Não credita — pede retry
      // (AbacatePay reenvia o webhook). Pior caso é atraso, não crédito falso.
      console.error(
        "[abacatepay webhook] confirmação API falhou em todas as contas — recusando crédito (retry)",
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

  // Salva o webhook bruto no providerPayload (preserva os outros campos)
  const existingPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      providerPayload: {
        ...existingPayload,
        raw_webhook: body as unknown as object,
      } as never,
    },
  });

  if (disputed) {
    // MED PIX / disputa → CHARGEBACK. Só rebaixa uma venda que JÁ foi paga
    // (não debita tx PENDING/EXPIRED que nunca creditou). markTransaction-
    // Chargedback é idempotente (não estorna 2x). Se a tx ainda não está PAID,
    // só registra o webhook bruto (já salvo acima) e segue.
    if (tx.status === "PAID" || tx.status === "CHARGEBACK") {
      await markTransactionChargedback(tx.id);
    } else {
      console.warn(
        "[abacatepay webhook] disputa em tx não-PAID — registrado, sem debitar:",
        tx.id,
        tx.status,
      );
    }
  } else if (isPaidStatus(confirmedStatus) && tx.status !== "PAID") {
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

  // Auditoria — grava IdempotencyKey APÓS o processamento. Best-effort.
  prisma.idempotencyKey
    .create({
      data: {
        key: eventKey,
        bodyHash: createHmac("sha256", "abacatepay-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, confirmedStatus } as object,
        status: 200,
        endpoint: "webhook:abacatepay",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "abacatepay" });
}
