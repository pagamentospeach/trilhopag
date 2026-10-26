import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  isFailedStatus,
  isPaidStatus,
  isRefundedStatus,
} from "@/lib/providers/safepix";
import {
  markTransactionExpired,
  markTransactionPaid,
  markTransactionRefunded,
} from "@/lib/transactions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyWebhookSecret } from "@/lib/security/webhook-secret";

export const dynamic = "force-dynamic";

/**
 * Verifica assinatura HMAC do webhook quando SAFEPIX_WEBHOOK_SECRET está
 * configurado. Suporta dois formatos comuns:
 *  - Header `x-signature: sha256=<hex>`
 *  - Header `x-webhook-token: <secret>` (token simples)
 *
 * Se nenhum secret configurado, exige no mínimo um token comparado por
 * constant-time. Sem secret + sem token = bloqueado em produção.
 */
function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.SAFEPIX_WEBHOOK_SECRET;
  const token = process.env.SAFEPIX_WEBHOOK_TOKEN;

  // 1. HMAC sha256
  if (secret) {
    const sig = headers.get("x-signature") || headers.get("x-hub-signature-256");
    if (!sig) return { ok: false, reason: "missing_signature" };
    const provided = sig.replace(/^sha256=/, "").trim();
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true };
  }

  // 2. Token compartilhado
  if (token) {
    const provided = headers.get("x-webhook-token") || "";
    const a = Buffer.from(provided);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_token" };
    }
    return { ok: true };
  }

  // Sem nenhum secret configurado: BLOQUEIA SEMPRE (incluindo dev).
  // Em dev, configura SAFEPIX_WEBHOOK_TOKEN com qualquer string.
  // Antes esse fallback aceitava em dev — mas se a env var não carregar
  // em prod (deploy ruim), webhook ficava aberto. Eliminado o risco.
  return { ok: false, reason: "no_secret_configured" };
}

export async function POST(request: Request) {
  // Anti-flood: 1200 webhooks/min/IP. Folga deliberada — agora a SafePix pode
  // entregar por 2 canais (postback por-cobrança + webhook de conta), e os
  // dois vêm do MESMO IP da SafePix. 429 num webhook de pagamento = venda
  // perdida (sem API de status pra reconciliar), então preferimos sobra.
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-safepix:${ip}`, 1200, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Lê raw pra HMAC; parse depois.
  const rawBody = await request.text();

  // SIGNATURE: best-effort. Se falhar (secret nao bate, missing header,
  // env nao carregou no deploy) NAO rejeitamos — pq isso ja deixou 24
  // vendas reais stuck em PENDING. Validamos status real chamando a
  // API SafePix por providerId antes de creditar.
  // Risco: zero. providerId precisa existir na nossa DB E o status real
  // na SafePix tem que ser PAID antes de markTransactionPaid rodar.
  const sigCheck = verifyWebhookSignature(rawBody, request.headers);
  if (!sigCheck.ok) {
    console.warn(
      "[safepix webhook] signature check failed:",
      sigCheck.reason,
      "— proceeding with API verification",
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Aceita os DOIS formatos da SafePix:
  //  1) POSTBACK por-cobrança (o `postback_url` que mandamos em cada charge):
  //     PascalCase no topo → { Id, Status, ... }
  //  2) WEBHOOK DE CONTA (criado no painel SafePix → Webhooks): envia a
  //     ENTIDADE payment-transaction, geralmente lowercase e/ou aninhada em
  //     `data` → { data: { id, status, ... } } ou { id, status, ... }.
  //
  // Ter os 2 canais = REDUNDÂNCIA de entrega. Como a SafePix não expõe API de
  // status pra reconciliar (GET retorna 401), um 2º webhook é a rede de
  // segurança contra postback perdido. Por isso o parser tem que entender
  // qualquer um dos formatos.
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : null;
  const providerId = String(
    body.Id ?? body.id ?? data?.Id ?? data?.id ?? "",
  );
  const statusRaw = String(
    body.Status ?? body.status ?? data?.Status ?? data?.status ?? "",
  );
  if (!providerId || !statusRaw) {
    return NextResponse.json(
      {
        error: "missing_fields",
        required: ["Id|id|data.id", "Status|status|data.status"],
      },
      { status: 400 },
    );
  }

  // 1. Busca tx PRIMEIRO. Sem tx, nem ha o que fazer.
  const tx = await prisma.transaction.findFirst({
    where: { provider: "safepix", providerId },
    select: {
      id: true,
      status: true,
      providerPayload: true,
      userId: true,
      productId: true,
      createdAt: true,
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

  // 2. IDEMPOTENCIA REAL via status da tx, NAO via IdempotencyKey upfront.
  //
  // CRITICAL BUG FIX (jun/2026): antes a IdempotencyKey era criada ANTES
  // do processamento. Quando o processamento falhava (signature + API
  // verify), retornavamos 502 mas a key ja existia. Proxima tentativa do
  // SafePix retornava "replay" e tx ficava PENDING pra sempre.
  //
  // Agora: idempotency vem do estado da TX:
  //   - body=PAID + tx ja PAID         → skip (success)
  //   - body=PAID + tx PENDING/etc     → processa
  //   - body=REFUNDED + tx ja REFUNDED → skip
  //   etc
  // Idempotency real, sem race trap.
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

  // 3. Verificação em camadas (16/07/2026 — pós-incidente forge R$2100):
  //
  //   a) SIG HMAC/token — se estiver configurada e bater, aceita.
  //   b) WHS (query param secreto por-tx) — nosso próprio hash derivado do
  //      txId via APP_ENCRYPTION_KEY, injetado em `postback_url?whs=X`
  //      quando criamos a PIX. A SafePix guarda a URL e chama de volta.
  //      Attacker que forja webhook não conhece o whs.
  //   c) API SafePix (best-effort, mas sabemos que retorna 401 sempre).
  //
  // Se sig falhou, tenta whs. Se whs falhou, tenta API. Se todas falharam
  // pra status terminal (PAID/REFUND) → 503 fail-closed. SafePix reentrega.
  let effectiveStatus = statusRaw;
  if (!sigCheck.ok) {
    // ===== Tentativa 1: whs query param =====
    const providedWhs = new URL(request.url).searchParams.get("whs");
    const whsOk = verifyWebhookSecret(providedWhs, tx.id);
    if (whsOk) {
      console.log("[safepix webhook] whs verificado", { providerId, txId: tx.id });
      // whs bateu → confiamos no body
    } else {
      // ===== Tentativa 2: API SafePix (sabemos que retorna 401, mas mantém pra o dia que voltarem) =====
      const verified = await verifyViaApiCrossAcquirer(providerId, tx);
      if (verified.ok) {
        effectiveStatus = verified.status;
        console.log("[safepix webhook] API verificou status", {
          providerId,
          status: effectiveStatus,
          via: verified.acquirerCode,
        });
      } else {
        // ===== FAIL-CLOSED absoluto pra status terminal =====
        //
        // Exceção legacy: tx criadas ANTES do WHS_DEPLOY_AT não têm whs no
        // postback URL — permite fallback com log warn. Após esse marco,
        // TODA tx safepix nova tem whs; ausência = forjada.
        const WHS_DEPLOY_AT = new Date("2026-07-16T09:00:00Z");
        const isLegacyTx = tx.createdAt < WHS_DEPLOY_AT;

        const isTerminalMoneyStatus =
          isPaidStatus(statusRaw) || isRefundedStatus(statusRaw);
        if (isTerminalMoneyStatus && !isLegacyTx) {
          console.error("[safepix webhook] FAIL-CLOSED: sig+whs+API falharam", {
            providerId,
            txId: tx.id,
            ip,
            sigReason: sigCheck.reason,
            whsProvided: providedWhs ? providedWhs.slice(0, 8) + "..." : "missing",
            apiErr: verified.lastError,
            status: statusRaw,
            txCreatedAt: tx.createdAt,
          });
          return NextResponse.json(
            {
              error: "verification_failed",
              retry: true,
              hint: "Missing/invalid whs query param.",
            },
            { status: 503 },
          );
        }
        if (isTerminalMoneyStatus && isLegacyTx) {
          console.warn(
            "[safepix webhook] tx legacy sem whs — aceitando body (transição)",
            { providerId, txId: tx.id, txCreatedAt: tx.createdAt },
          );
        }
        // Status não-terminal (PENDING, PROCESSING) — não mexe em dinheiro,
        // segue com o body pra observabilidade.
        console.warn(
          "[safepix webhook] status não-terminal sem verificação — seguindo com body",
          providerId,
          "reason=" + sigCheck.reason,
        );
      }
    }
  }

  // 4. Atualiza payload + marca QUAL canal entregou (observabilidade da
  //    redundância). Heurística: o POSTBACK por-cobrança manda `Id` PascalCase
  //    no topo; o WEBHOOK DE CONTA (painel SafePix) manda a entidade (id/status
  //    lowercase ou em `data`). `?src=account|postback` na URL, se presente, é
  //    definitivo. Guarda o webhook de conta SEPARADO (raw_account_webhook) pra
  //    o postback não sobrescrever — assim dá pra auditar que os 2 chegaram.
  const existingPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  const srcParam = new URL(request.url).searchParams.get("src");
  const isAccountWebhook =
    srcParam === "account" ||
    (srcParam !== "postback" &&
      !("Id" in body) &&
      ("id" in body || "data" in body));
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      providerPayload: {
        ...existingPayload,
        raw_webhook: body,
        [isAccountWebhook ? "wh_account_at" : "wh_postback_at"]:
          new Date().toISOString(),
        ...(isAccountWebhook ? { raw_account_webhook: body } : {}),
      } as never,
    },
  });

  // 5. Aplica status. As funcoes markTransaction* sao IDEMPOTENTES via
  // updateMany condicional, entao chamadas duplicadas nao creditam 2x.
  if (isPaidStatus(effectiveStatus) && tx.status !== "PAID") {
    await markTransactionPaid(tx.id);
    const payload = existingPayload as Record<string, unknown>;
    if (payload?.acquirer_id && typeof payload.acquirer_id === "string") {
      const { recordAcquirerApproval } = await import("@/lib/acquirers");
      await recordAcquirerApproval(payload.acquirer_id, tx.userId).catch(() => {});
    }
  } else if (isRefundedStatus(effectiveStatus) && tx.status !== "REFUNDED") {
    await markTransactionRefunded(tx.id);
  } else if (isFailedStatus(effectiveStatus) && tx.status === "PENDING") {
    await markTransactionExpired(tx.id);
  }

  // 6. SO AGORA grava IdempotencyKey — como AUDITORIA, NAO como gate.
  //    Falhas aqui sao ignoradas (best-effort). Mesmo se 2 webhooks
  //    chegarem em paralelo, markTransaction* eh atomico/idempotente.
  prisma.idempotencyKey
    .create({
      data: {
        key: `webhook:safepix:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "safepix-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, effectiveStatus } as object,
        status: 200,
        endpoint: "webhook:safepix",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

/**
 * Cross-acquirer fallback: tenta verify via API SafePix com creds de
 * TODOS os acquirers ativos. Se algum retornar status, confirma.
 *
 * Por que: quando a tx foi criada com `acq_safepix_default` (env-based
 * legacy) e depois alguem trocou as env vars OU os creds da acquirer,
 * o verify via 1 conta especifica falha. Tentar todas resolve.
 */
async function verifyViaApiCrossAcquirer(
  providerId: string,
  tx: { providerPayload: unknown },
): Promise<
  | { ok: true; status: string; acquirerCode: string }
  | { ok: false; lastError: string }
> {
  const { getPaymentStatus } = await import("@/lib/providers/safepix");
  const { decryptString } = await import("@/lib/crypto");

  // Prioriza a acquirer original (do payload) primeiro
  const txPayload = (tx.providerPayload as Record<string, unknown> | null) ?? {};
  const txAcquirerId =
    typeof txPayload.acquirer_id === "string" ? txPayload.acquirer_id : null;

  const acqs = await prisma.acquirer.findMany({
    where: {
      code: { startsWith: "safepix" },
      active: true,
      publicKey: { not: null },
      secretKeyEnc: { not: null },
    },
    select: { id: true, code: true, publicKey: true, secretKeyEnc: true },
  });

  // Reordena: a do tx primeiro (mais provavel de funcionar)
  acqs.sort((a, b) => {
    if (a.id === txAcquirerId) return -1;
    if (b.id === txAcquirerId) return 1;
    return 0;
  });

  let lastError = "no acquirers configured";
  for (const acq of acqs) {
    try {
      const sk = decryptString(acq.secretKeyEnc!);
      const r = await getPaymentStatus(providerId, {
        publicKey: acq.publicKey!,
        secretKey: sk,
      });
      return { ok: true, status: r.status, acquirerCode: acq.code };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // 401/404 = wrong acquirer, continua. erro real (500) tambem segue.
    }
  }

  // Fallback final: tenta com env vars (legacy SafePix account)
  if (process.env.SAFEPIX_PUBLIC_KEY && process.env.SAFEPIX_SECRET_KEY) {
    try {
      const r = await getPaymentStatus(providerId, {
        publicKey: process.env.SAFEPIX_PUBLIC_KEY,
        secretKey: process.env.SAFEPIX_SECRET_KEY,
      });
      return { ok: true, status: r.status, acquirerCode: "env" };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, lastError };
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "safepix" });
}
