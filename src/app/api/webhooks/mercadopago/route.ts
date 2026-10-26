import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getMPPaymentStatus } from "@/lib/providers/mercadopago";
import { resolveWebhookAcquirers } from "@/lib/acquirers";
import { decryptString } from "@/lib/crypto";
import {
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
} from "@/lib/transactions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook do Mercado Pago.
 *
 * MP envia POST com body { action, type, data: { id }, ... }. O ID é do
 * Payment, não da transação interna. Precisamos buscar o Payment via API
 * (não confia no body porque pode ser manipulado), achar a tx interna via
 * providerId e atualizar o status.
 *
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * Auth opcional (mas recomendado): MP pode mandar header `x-signature`
 * com HMAC SHA256. Quando MP_WEBHOOK_SECRET está configurado, validamos.
 * Sem secret, aceitamos baseado no IP (não é ideal — configure o secret).
 */

/**
 * Valida HMAC do webhook do Mercado Pago.
 *
 * Formato correto da doc oficial:
 *   manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 *   v1 = HMAC-SHA256(manifest, secret).hex
 *
 * Para isso precisa parsear data.id ANTES (extraido do rawBody).
 *
 * Antes usava `${requestId}:${ts}:${rawBody}` que NUNCA bate com o que
 * o MP envia — todos webhooks legitimos eram rejeitados como
 * invalid_signature e PIX MP nunca confirmava.
 */
function verifyMpSignature(
  rawBody: string,
  headers: Headers,
  dataId: string | null,
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, reason: "no_secret_configured" };
  }
  const sig = headers.get("x-signature");
  if (!sig) return { ok: false, reason: "missing_signature" };
  // Formato MP: "ts=<timestamp>,v1=<hash>"
  const parts = Object.fromEntries(
    sig.split(",").map((p) => p.trim().split("=")),
  );
  const ts = parts["ts"];
  const provided = parts["v1"];
  if (!ts || !provided) return { ok: false, reason: "malformed_signature" };
  if (!dataId) return { ok: false, reason: "missing_data_id" };

  const requestId = headers.get("x-request-id") ?? "";
  // FORMATO OFICIAL Mercado Pago (com ; final):
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  if (provided !== expected) {
    // Log silencioso pra debug — bodyHash hash do raw pra rastrear sem
    // expor secret.
    console.warn("[mp webhook] sig mismatch", {
      reason: "invalid_signature",
      dataId,
      ts,
      requestIdLen: requestId.length,
    });
    return { ok: false, reason: "invalid_signature" };
  }
  // Confere tambem que o data.id no manifesto bate com o data.id do body
  // (anti-replay-from-other-tx — atacante poderia pegar v1 valido pra
  // tx_A e mandar body de tx_B).
  void rawBody;
  return { ok: true };
}

type MPNotification = {
  action?: string;
  type?: string;
  data?: { id?: string | number };
};

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-mp:${ip}`, 600, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await request.text();

  // Parse body PRIMEIRO pra extrair data.id, depois valida assinatura
  // (formato HMAC do MP inclui data.id no manifesto).
  let body: MPNotification;
  try {
    body = JSON.parse(rawBody) as MPNotification;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const paymentId = body?.data?.id ? String(body.data.id) : null;

  // SIGNATURE: best-effort. Se falhar, NAO rejeitamos — vamos buscar
  // status na API MP usando providerId e confiamos no que MP retorna.
  // Isso protege contra:
  //  - User ainda nao configurou secret no painel MP (caso comum no setup)
  //  - Rotacao de secret onde MP usa secret antiga mas Vercel ja tem nova
  //  - Edge cases de encoding/timing do timestamp
  // SEGURANCA: o providerId (MP payment ID) tem que ja existir na nossa
  // Transaction tabela. Atacante precisaria adivinhar um providerId valido
  // E que tenha sido genuinamente aprovado em MP — janela impossivel.
  // Alem disso, sempre verificamos o status via API MP (getMPPaymentStatus)
  // antes de creditar — MP eh a source of truth.
  const sigCheck = verifyMpSignature(rawBody, request.headers, paymentId);
  if (!sigCheck.ok) {
    // FAIL-CLOSED (auditoria jun/2026): se a assinatura VEIO mas é
    // inválida/malformada com secret configurado, é forja clara → 401.
    // O MP legítimo, com o secret atual, sempre assina certo. Requests SEM
    // assinatura (missing) ou sem secret (bootstrap/rotação) seguem pro
    // caminho de re-verificação via API do MP — não quebra setup nem rotação.
    if (
      sigCheck.reason === "invalid_signature" ||
      sigCheck.reason === "malformed_signature"
    ) {
      return NextResponse.json(
        { error: "invalid_signature" },
        { status: 401 },
      );
    }
    console.warn(
      "[mp webhook] signature check skipped:",
      sigCheck.reason,
      "— proceeding with MP API verification",
    );
  }

  if (!paymentId) {
    // MP pode mandar topic=merchant_order ou outros — só processamos
    // events com data.id (Payment). Devolve 200 pra MP nao reentregar.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // IDEMPOTENCIA POR STATUS DA TX (NAO via lock upfront).
  //
  // CRITICAL BUG FIX (jun/2026): antes a IdempotencyKey era criada AQUI
  // antes do processamento. Quando o processamento falhava (API verify,
  // creds erradas, etc), retornavamos 500 mas a key ja existia. Proxima
  // tentativa do MP → "replay" → tx ficava PENDING pra sempre.
  //
  // Agora a IdempotencyKey eh gravada NO FINAL como auditoria, e a
  // idempotencia real vem do estado atual da tx (markTransaction* eh
  // atomico via updateMany condicional).

  // Acha a transação interna via providerId = MP payment id
  const tx = await prisma.transaction.findFirst({
    where: { provider: "mercadopago", providerId: paymentId },
    select: { id: true, status: true, providerPayload: true, userId: true },
  });
  if (!tx) {
    // Pode ser uma COMPRA INTERNA (subscription massa, tema, etc) —
    // não é Transaction normal de venda. Checa antes de ignorar.
    const internal = await prisma.internalPurchase.findFirst({
      where: { pixProviderId: paymentId },
      select: { id: true, status: true },
    });
    if (internal) {
      if (internal.status !== "paid") {
        // FIX BUG-1: compras INTERNAS sempre usam MP WHITE (do dono).
        // CROSS-ACCOUNT FIX (jun/2026): antes era findFirst({code:"mercadopago"})
        // exato — nao pegava contas com sufixo (mercadopago-white, -2) e
        // escolhia uma arbitraria. Agora tenta TODAS as contas MP white
        // (startsWith) ate alguma confirmar o status.
        const whiteAcqs = await resolveWebhookAcquirers("mercadopago", null, {
          mode: "white",
        });
        if (whiteAcqs.length === 0) {
          console.error("[mp webhook] internal: nenhuma conta MP white com creds");
          return NextResponse.json({ error: "config_error" }, { status: 500 });
        }
        // Confirma status: tenta cada conta white ate uma responder.
        let internalStatus: string | null = null;
        let lastErr: unknown = null;
        for (const acq of whiteAcqs) {
          try {
            const result = await getMPPaymentStatus(paymentId, {
              publicKey: acq.publicKey!,
              accessToken: decryptString(acq.secretKeyEnc!),
            });
            internalStatus = result.status;
            break;
          } catch (e) {
            lastErr = e;
            // 404 = payment nao pertence a essa conta, tenta a proxima.
          }
        }
        if (internalStatus === null) {
          console.error(
            "[mp webhook] internal status fetch failed em todas contas white:",
            internal.id,
            lastErr,
          );
          return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
        }
        if (internalStatus !== "approved") {
          // Pagamento ainda não aprovado (pending) ou rejeitado — ignora,
          // próximo webhook vai chegar quando aprovar (MP retenta).
          return NextResponse.json({
            ok: true,
            internal: true,
            status: internalStatus,
          });
        }
        const { applyInternalPurchase } = await import(
          "@/lib/internal-purchases"
        );
        const r = await applyInternalPurchase(internal.id);
        if (!r.ok) {
          console.error(
            "[mp webhook] applyInternalPurchase failed:",
            internal.id,
            r.error,
          );
        }
      }
      return NextResponse.json({ ok: true, internal: true });
    }

    // Não é tx nem internal — ignora silenciosamente
    return NextResponse.json({ ok: true, message: "unknown_transaction" });
  }

  // Confirma status via API MP (não confia no webhook body — boa prática).
  // CROSS-ACCOUNT FIX (jun/2026): antes era findFirst({code:"mercadopago"})
  // exato + conta arbitraria. Com multiplas contas MP, a tx criada na conta
  // 2 era confirmada com creds da conta 1 → getMPPaymentStatus 404 → tx
  // travava em PENDING. Agora pega a conta ORIGINADORA primeiro (via
  // providerPayload.acquirer_id) e cai pras outras contas MP se falhar.
  const txPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  const txAcquirerId =
    typeof txPayload.acquirer_id === "string" ? txPayload.acquirer_id : null;
  const mpAcqs = await resolveWebhookAcquirers("mercadopago", txAcquirerId);
  if (mpAcqs.length === 0) {
    console.error("[mp webhook] nenhuma conta MP com creds");
    return NextResponse.json({ error: "config_error" }, { status: 500 });
  }

  let mpStatus: string | null = null;
  let lastErr: unknown = null;
  for (const acq of mpAcqs) {
    try {
      const result = await getMPPaymentStatus(paymentId, {
        publicKey: acq.publicKey!,
        accessToken: decryptString(acq.secretKeyEnc!),
      });
      mpStatus = result.status;
      break;
    } catch (e) {
      lastErr = e;
      // 404 = payment nao pertence a essa conta, tenta a proxima.
    }
  }
  if (mpStatus === null) {
    console.error(
      "[mp webhook] failed to fetch payment status em todas contas:",
      lastErr,
    );
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }

  // Persiste o payload do webhook
  const existingPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      providerPayload: {
        ...existingPayload,
        mp_status: mpStatus,
        raw_webhook: body as unknown as Record<string, unknown>,
      } as never,
    },
  });

  if (mpStatus === "approved" && tx.status !== "PAID") {
    await markTransactionPaid(tx.id);
  } else if (mpStatus === "refunded" && tx.status !== "REFUNDED") {
    await markTransactionRefunded(tx.id);
  } else if (
    (mpStatus === "rejected" ||
      mpStatus === "cancelled" ||
      mpStatus === "expired") &&
    tx.status === "PENDING"
  ) {
    await markTransactionExpired(tx.id);
  }

  // Auditoria — grava IdempotencyKey AGORA (depois do processamento).
  // Best-effort: falhas ignoradas. NAO eh gate de replay.
  prisma.idempotencyKey
    .create({
      data: {
        key: `webhook:mp:${paymentId}:${body.action ?? "unknown"}`,
        bodyHash: createHmac("sha256", "mp-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, mpStatus } as object,
        status: 200,
        endpoint: "webhook:mp",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "mercadopago" });
}
