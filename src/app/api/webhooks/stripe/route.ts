import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { parseStripeWebhook } from "@/lib/providers/stripe";
import { resolveWebhookAcquirers } from "@/lib/acquirers";
import { decryptString } from "@/lib/crypto";
import {
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
  markTransactionChargedback,
} from "@/lib/transactions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook do Stripe — recebe eventos de payment_intent + charge + refund.
 *
 * Assinatura HMAC validada via parseStripeWebhook (constrói o evento e
 * verifica). Precisa do webhook_secret cadastrado em Acquirer.metadataEnc
 * como { webhookSecret: "whsec_..." }.
 *
 * Eventos tratados:
 *   payment_intent.succeeded     → markTransactionPaid
 *   payment_intent.payment_failed → markTransactionExpired (treat as expired)
 *   charge.refunded              → markTransactionRefunded
 *   charge.dispute.created       → markTransactionChargedback
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-stripe:${ip}`, 600, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const signature = request.headers.get("stripe-signature") ?? "";
  if (!signature) {
    return NextResponse.json(
      { error: "missing_signature" },
      { status: 401 },
    );
  }

  const rawBody = await request.text();

  // MULTI-ACCOUNT FIX (jun/2026): cada conta Stripe tem seu PROPRIO
  // webhook_secret. Antes pegavamos findFirst (1 conta arbitraria) e
  // validavamos a assinatura so com aquele secret — txs criadas em OUTRA
  // conta Stripe falhavam com "invalid_signature".
  //
  // Como nao da pra saber a conta antes de validar a assinatura (precisa
  // do secret pra parsear o evento), tentamos CADA conta Stripe ate uma
  // validar. A que validar eh a conta correta (secret bate = veio dela).
  // NAO filtra globalEnabled: webhook de conta recem-desativada ainda
  // precisa ser processado (o pagamento ja aconteceu).
  const stripeAcqs = await resolveWebhookAcquirers("stripe");
  if (stripeAcqs.length === 0) {
    console.error("[stripe webhook] nenhuma conta stripe com creds");
    return NextResponse.json({ error: "config_error" }, { status: 500 });
  }

  let event: ReturnType<typeof parseStripeWebhook> | null = null;
  let matchedAcq: (typeof stripeAcqs)[number] | null = null;
  let lastErr = "nenhuma conta stripe validou a assinatura";
  for (const acq of stripeAcqs) {
    if (!acq.publicKey || !acq.secretKeyEnc) continue;
    let webhookSecret: string | undefined;
    if (acq.metadataEnc) {
      try {
        const meta = JSON.parse(decryptString(acq.metadataEnc)) as {
          webhookSecret?: string;
        };
        webhookSecret = meta.webhookSecret;
      } catch {}
    }
    if (!webhookSecret) continue;
    try {
      event = parseStripeWebhook(rawBody, signature, {
        publishableKey: acq.publicKey,
        secretKey: decryptString(acq.secretKeyEnc),
        webhookSecret,
      });
      matchedAcq = acq;
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "unknown";
      // Secret nao bate com essa conta — tenta a proxima.
    }
  }
  if (!event || !matchedAcq) {
    console.warn("[stripe webhook] signature invalid:", lastErr);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  const stripeAcq = matchedAcq;

  // IDEMPOTENCY: Stripe signature ja foi verificada acima — body confiavel.
  // markTransaction* sao atomicos via updateMany condicional (status:
  // {not: "PAID"}), entao mesmo se o mesmo event chegar 2x (Stripe retry),
  // o crédito sai 1 vez so. NAO usamos IdempotencyKey como gate aqui —
  // gravamos NO FINAL pra auditoria (best-effort).
  //
  // BUG FIX (jun/2026): antes a key era criada upfront. Se processamento
  // falhasse (DB transient error), Stripe retentava mas batia "replay"
  // → tx ficava PENDING. Como markTransaction* eh idempotente, dispensar
  // o gate eh seguro e elimina o failure mode.
  const eventKey = `webhook:stripe:${event.id}`;
  const alreadyProcessed = await prisma.idempotencyKey
    .findUnique({
      where: { key: eventKey },
      select: { key: true },
    })
    .catch(() => null);
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true, replay: true });
  }

  // Type-specific handling
  const type = event.type;
  let providerId: string | null = null;

  if (
    type === "payment_intent.succeeded" ||
    type === "payment_intent.payment_failed"
  ) {
    providerId = (event.data.object as { id?: string }).id ?? null;
  } else if (
    type === "charge.refunded" ||
    type === "charge.dispute.created"
  ) {
    // Charge events têm payment_intent string no campo
    const charge = event.data.object as { payment_intent?: string | null };
    providerId = charge.payment_intent ?? null;
  }

  if (!providerId) {
    // Outros eventos (payment_intent.created, etc) — só ack, não processa
    return NextResponse.json({ ok: true, ignored: type });
  }

  const tx = await prisma.transaction.findFirst({
    where: { provider: "stripe", providerId },
    select: { id: true, status: true, providerPayload: true, userId: true },
  });
  if (!tx) {
    return NextResponse.json({ ok: true, message: "unknown_transaction" });
  }

  // Persiste o payload
  const existingPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      providerPayload: {
        ...existingPayload,
        stripe_event_type: type,
        stripe_event_id: event.id,
      } as never,
    },
  });

  // === ENRICH CARD CAPTURE ===
  // Quando temos payment_intent.succeeded ou .payment_failed, o Stripe expoe
  // os metadados do PaymentMethod (brand, last4, exp_month, exp_year, country,
  // funding, fingerprint). Salvamos isso no CardCapture vinculado a tx pra
  // auditoria admin. NUNCA expomos PAN nem CVV — Stripe nao retorna isso.
  if (
    type === "payment_intent.succeeded" ||
    type === "payment_intent.payment_failed"
  ) {
    try {
      const pi = event.data.object as {
        id: string;
        payment_method?: string | null;
        last_payment_error?: { message?: string; code?: string } | null;
      };
      let card: {
        brand?: string;
        last4?: string;
        exp_month?: number;
        exp_year?: number;
        country?: string;
        funding?: string;
        fingerprint?: string;
      } | null = null;
      let cardholderName: string | null = null;
      if (pi.payment_method) {
        // secretKeyEnc garantido non-null: so chega aqui se a conta validou
        // a assinatura (loop acima faz `continue` quando falta secretKeyEnc).
        const stripeClient = new Stripe(decryptString(stripeAcq.secretKeyEnc!), {
          apiVersion: "2026-04-22.dahlia",
        });
        const pm = await stripeClient.paymentMethods.retrieve(pi.payment_method);
        if (pm.card) {
          card = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
            country: pm.card.country ?? undefined,
            funding: pm.card.funding,
            fingerprint: pm.card.fingerprint ?? undefined,
          };
        }
        cardholderName = pm.billing_details?.name ?? null;
      }
      // Upsert CardCapture pra essa tx
      const existing = await prisma.cardCapture.findFirst({
        where: { transactionId: tx.id },
        select: { id: true },
      });
      const data = {
        userId: tx.userId,
        transactionId: tx.id,
        stripePmId: pi.payment_method ?? null,
        brand: card?.brand ?? null,
        last4: card?.last4 ?? null,
        bin: null, // Stripe nao expoe BIN/primeiros 6 digitos
        expMonth: card?.exp_month ?? null,
        expYear: card?.exp_year ?? null,
        funding: card?.funding ?? null,
        cardCountry: card?.country ?? null,
        fingerprint: card?.fingerprint ?? null,
        cardholderName: cardholderName,
        status:
          type === "payment_intent.succeeded" ? "succeeded" : "failed",
        failReason:
          type === "payment_intent.payment_failed"
            ? pi.last_payment_error?.message ?? pi.last_payment_error?.code ?? "unknown"
            : null,
      };
      if (existing) {
        await prisma.cardCapture.update({ where: { id: existing.id }, data });
      } else {
        await prisma.cardCapture.create({ data });
      }
    } catch (e) {
      console.error("[stripe-webhook] card-capture enrich failed", e);
    }
  }

  if (type === "payment_intent.succeeded" && tx.status !== "PAID") {
    await markTransactionPaid(tx.id);
  } else if (
    type === "payment_intent.payment_failed" &&
    tx.status === "PENDING"
  ) {
    await markTransactionExpired(tx.id);
  } else if (type === "charge.refunded" && tx.status !== "REFUNDED") {
    await markTransactionRefunded(tx.id);
  } else if (
    type === "charge.dispute.created" &&
    tx.status !== "CHARGEBACK"
  ) {
    await markTransactionChargedback(tx.id);
  }

  // Auditoria — grava IdempotencyKey APOS o processamento. Best-effort.
  prisma.idempotencyKey
    .create({
      data: {
        key: eventKey,
        bodyHash: createHmac("sha256", "stripe-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, type } as object,
        status: 200,
        endpoint: "webhook:stripe",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "stripe" });
}
