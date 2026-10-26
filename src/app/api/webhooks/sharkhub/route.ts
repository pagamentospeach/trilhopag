import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  getPaymentStatus,
  isChargedbackStatus,
  isFailedStatus,
  isPaidStatus,
  isRefundedStatus,
} from "@/lib/providers/sharkhub";
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
 * Webhook handler da SharkHub (sub-adquirente).
 *
 * ⚠️ A SharkHub PROÍBE polling (GET /payment/:id → rate-limit/IP block). Por
 * isso, ao contrário do SafePix/SharkBanking, NÃO dá pra re-confirmar o status
 * via API. A assinatura HMAC é a ÚNICA prova anti-forge:
 *   X-Signature = base64(HMAC-SHA256(rawBody, WEBHOOK_SECRET))
 * O WEBHOOK_SECRET é POR-CONTA (Acquirer.metadataEnc.webhookSecret).
 *
 * Pra QUALQUER status que mexe em dinheiro (PAID/REFUNDED/CHARGEDBACK) a
 * assinatura é OBRIGATÓRIA: ausente/inválida → 401 (não credita). O `id` da
 * cobrança não é secreto (vai na resposta da criação), então confiar no body
 * sem assinatura seria forjável. Melhor preso (e reconciliado à mão) que
 * crédito forjado de dinheiro não recebido.
 *
 * Payload = o objeto payment (mesmo shape do GET /payment/:id): { id, status,
 * method, data:{...}, ... }. Webhooks de TRANSFER (saque) têm id de outro
 * espaço e não casam com Transaction (saque é manual hoje) → unknown_transaction.
 */

type WebhookBody = {
  id?: string;
  status?: string;
  method?: string;
  [k: string]: unknown;
};

/** Compara duas strings em tempo constante (evita timing attack). */
function timingEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Expande um secret em CHAVES-candidatas pra o HMAC. A SharkHub gera o secret em
 * HEX (64 chars), mas NÃO documenta se assina usando o secret como STRING (utf-8)
 * ou como os BYTES hex-decodados — divergir nisso é o erro clássico que faz toda
 * assinatura falhar. Então tentamos as 3 interpretações plausíveis (utf-8,
 * hex-decoded, base64-decoded). TODAS continuam exigindo conhecer o secret real
 * → isto NÃO enfraquece o anti-forge, só tolera a codificação que a SharkHub usa.
 */
function secretKeyCandidates(secret: string): Array<Buffer | string> {
  const out: Array<Buffer | string> = [secret]; // utf-8 (padrão)
  if (/^[0-9a-fA-F]+$/.test(secret) && secret.length % 2 === 0) {
    try {
      const b = Buffer.from(secret, "hex");
      if (b.length > 0) out.push(b);
    } catch {
      /* ignora */
    }
  }
  if (/^[A-Za-z0-9+/]+=*$/.test(secret) && secret.length % 4 === 0) {
    try {
      const b = Buffer.from(secret, "base64");
      if (b.length > 0) out.push(b);
    } catch {
      /* ignora */
    }
  }
  return out;
}

/**
 * Valida a assinatura HMAC do webhook. O secret é por-conta SharkHub
 * (metadataEnc.webhookSecret + webhookSecretSaque). Tenta a conta originadora
 * primeiro; com várias contas sharkhub, qualquer secret que bater valida.
 *
 * Robustez: a SharkHub documenta X-Signature = base64(HMAC-SHA256(body, secret)),
 * mas pra NÃO depender da codificação exata, tentamos todas as combinações
 * plausíveis: chave em {utf-8, hex-decoded, base64-decoded} × digest em
 * {base64, hex} × prefixo "sha256=" normalizado. Toda combinação ainda exige o
 * secret real → segue à prova de forja.
 */
async function verifySignature(
  rawBody: string,
  sigHeader: string | null,
  acquirerId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!sigHeader) return { ok: false, reason: "missing_signature" };
  // alguns provedores prefixam "sha256=" — normaliza antes de comparar.
  const provided = sigHeader.trim().replace(/^sha256=/i, "");
  const acqs = await resolveWebhookAcquirers("sharkhub", acquirerId);
  let anySecret = false;
  for (const acq of acqs) {
    if (!acq.metadataEnc) continue;
    let secrets: string[] = [];
    try {
      const meta = JSON.parse(decryptString(acq.metadataEnc)) as {
        webhookSecret?: string;
        webhookSecretSaque?: string;
      };
      // A SharkHub gera um secret POR webhook (transação e saque). Tentamos
      // TODOS os secrets da conta — o que bater valida (não sabemos a priori
      // qual webhook assinou este evento).
      secrets = [meta.webhookSecret, meta.webhookSecretSaque].filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      );
    } catch {
      continue;
    }
    if (secrets.length === 0) continue;
    anySecret = true;
    for (const secret of secrets) {
      for (const key of secretKeyCandidates(secret)) {
        // digest UMA vez como Buffer; compara contra base64 E hex (não sabemos
        // a priori qual encoding a SharkHub manda; o doc diz base64).
        const digest = createHmac("sha256", key).update(rawBody).digest();
        if (timingEq(provided, digest.toString("base64"))) return { ok: true };
        if (timingEq(provided, digest.toString("hex"))) return { ok: true };
      }
    }
  }
  return {
    ok: false,
    reason: anySecret ? "invalid_signature" : "no_secret_configured",
  };
}

/**
 * CONFIRMA um status de dinheiro batendo na PRÓPRIA API da SharkHub
 * (GET /payment/:id, api-key). É o anti-forge REAL: a SharkHub documenta
 * X-Signature mas, na prática, NÃO assina os webhooks (provado por captura ao
 * vivo de todos os headers), então a verificação HMAC nunca passa e o webhook de
 * PAID era recusado — por isso as vendas não creditavam. Como um atacante não
 * consegue fazer a API da SharkHub responder PAID pra uma cobrança não-paga, um
 * único lookup por evento de dinheiro prova a legitimidade sem assinatura. NÃO é
 * polling (o doc proíbe polling REPETIDO/abuso, não 1 confirmação por webhook).
 *
 * Tenta as api-keys das contas sharkhub (originadora primeiro). Retorna:
 *   - {confirmed:true}                       → ALGUMA conta confirmou o MESMO status;
 *   - {confirmed:false, transient:true}      → só erro de rede OU status ainda
 *                                              não-terminal (lag) → caller dá 503
 *                                              pra SharkHub retentar;
 *   - {confirmed:false, transient:false}     → API achou a cobrança mas o status
 *                                              diverge de forma terminal (forja),
 *                                              ou id inexistente → não credita.
 */
async function confirmMoneyStatusViaApi(
  providerId: string,
  webhookStatus: string, // já UPPER
  acquirerId: string | null,
): Promise<{
  confirmed: boolean;
  transient: boolean;
  apiStatus?: string;
  via?: string;
}> {
  const acqs = await resolveWebhookAcquirers("sharkhub", acquirerId);
  const wantPaid = isPaidStatus(webhookStatus);
  const wantRefunded = isRefundedStatus(webhookStatus);
  const wantCharged = isChargedbackStatus(webhookStatus);
  let sawTransient = false;
  let mismatchApiStatus: string | undefined;
  let softPending = false;
  for (const acq of acqs) {
    if (!acq.secretKeyEnc) continue;
    let apiKey: string;
    try {
      apiKey = decryptString(acq.secretKeyEnc);
    } catch {
      continue;
    }
    const r = await getPaymentStatus(providerId, apiKey);
    if (!r.ok || !r.status) {
      if (r.transient) sawTransient = true;
      // HTTP determinístico (404/401) nesta conta → tenta a próxima (a cobrança
      // pode ser de outra conta sharkhub). Não confirma com esta.
      continue;
    }
    const matches =
      (wantPaid && isPaidStatus(r.status)) ||
      (wantRefunded && isRefundedStatus(r.status)) ||
      (wantCharged && isChargedbackStatus(r.status));
    if (matches) {
      return { confirmed: true, transient: false, apiStatus: r.status, via: "api_lookup" };
    }
    // A API achou a cobrança mas o status não bate. Se ainda é não-terminal
    // (PENDING/PROCESSING), pode ser lag de consistência da SharkHub → pede
    // retry. Se já é OUTRO status terminal (ex.: REFUSED p/ um webhook "PAID"),
    // é divergência dura (forja/erro) → não credita.
    mismatchApiStatus = r.status;
    if (r.status === "PENDING" || r.status === "PROCESSING") softPending = true;
  }
  if (mismatchApiStatus !== undefined) {
    return {
      confirmed: false,
      transient: softPending,
      apiStatus: mismatchApiStatus,
    };
  }
  return { confirmed: false, transient: sawTransient };
}

export async function POST(request: Request) {
  // Anti-flood: 1200 webhooks/min/IP (folga — venda perdida é pior que 429).
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-sharkhub:${ip}`, 1200, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Lê raw pra HMAC; parse depois.
  const rawBody = await request.text();
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const providerId = String(body.id ?? "");
  const statusRaw = String(body.status ?? "").toUpperCase();
  if (!providerId || !statusRaw) {
    return NextResponse.json(
      { error: "missing_fields", required: ["id", "status"] },
      { status: 400 },
    );
  }

  const tx = await prisma.transaction.findFirst({
    where: { provider: "sharkhub", providerId },
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
    // Cobrança desconhecida OU webhook de transfer (saque) — no-op.
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
      : isChargedbackStatus(statusRaw)
        ? "CHARGEBACK"
        : isFailedStatus(statusRaw)
          ? "EXPIRED"
          : null;
  if (targetStatusFromBody && tx.status === targetStatusFromBody) {
    return NextResponse.json({ ok: true, already: targetStatusFromBody });
  }

  // ANTI-FORGE: HMAC OBRIGATÓRIO pra status que mexem em dinheiro (polling
  // proibido → assinatura é a única prova). Sem/ inválida → 401, não credita.
  const existingPayload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  const acquirerId =
    typeof existingPayload.acquirer_id === "string"
      ? existingPayload.acquirer_id
      : null;
  const isMoneyStatus =
    isPaidStatus(statusRaw) ||
    isRefundedStatus(statusRaw) ||
    isChargedbackStatus(statusRaw);
  let verifiedVia: string | null = null;
  if (isMoneyStatus) {
    // 1) FAST-PATH — assinatura HMAC. A SharkHub DOCUMENTA X-Signature mas, na
    //    prática, NÃO assina os webhooks (provado por captura ao vivo de todos os
    //    headers); mantemos o caminho HMAC pra (a) o dia em que ela assinar e (b)
    //    evitar a chamada de API quando houver assinatura válida. Tenta os
    //    apelidos comuns de header pra não recusar por procurar no nome errado.
    const incomingSig =
      request.headers.get("x-signature") ??
      request.headers.get("signature") ??
      request.headers.get("x-webhook-signature") ??
      request.headers.get("x-hub-signature-256") ??
      request.headers.get("x-hub-signature");
    const sig = await verifySignature(rawBody, incomingSig, acquirerId);

    let confirm: Awaited<ReturnType<typeof confirmMoneyStatusViaApi>> | null =
      null;
    if (sig.ok) {
      verifiedVia = "hmac";
    } else {
      // 2) FALLBACK anti-forge — confirma o status na PRÓPRIA API da SharkHub
      //    (1 GET /payment/:id). É o que REALMENTE destrava o crédito, já que a
      //    SharkHub não manda assinatura. Forja é impossível: o atacante não faz
      //    a API da SharkHub dizer PAID por uma cobrança não-paga.
      confirm = await confirmMoneyStatusViaApi(
        providerId,
        statusRaw,
        acquirerId,
      );
      if (confirm.confirmed) verifiedVia = confirm.via ?? "api_lookup";
    }

    if (!verifiedVia) {
      const transient = confirm?.transient ?? false;
      console.error(
        "[sharkhub webhook] status de dinheiro NÃO confirmado — não credita",
        providerId,
        statusRaw,
        `hmac=${sig.reason ?? "ok"}`,
        `api=${
          confirm
            ? confirm.transient
              ? "transient/lag"
              : `mismatch:${confirm.apiStatus ?? "?"}`
            : "n/a"
        }`,
      );
      // OBSERVABILIDADE: grava o que a SharkHub mandou + o resultado da
      // confirmação na própria tx (tx CONHECIDA — ids forjados já saíram em
      // unknown_transaction, sem vetor de flood). Best-effort.
      await prisma.transaction
        .update({
          where: { id: tx.id },
          data: {
            providerPayload: {
              ...existingPayload,
              wh_sig_reject: {
                at: new Date().toISOString(),
                reason: sig.reason,
                status: statusRaw,
                got_signature: incomingSig ?? null,
                api_confirm: confirm
                  ? {
                      confirmed: confirm.confirmed,
                      transient: confirm.transient,
                      apiStatus: confirm.apiStatus ?? null,
                    }
                  : null,
                headers: Object.fromEntries(request.headers.entries()),
                body: rawBody.slice(0, 4000),
              },
            } as never,
          },
        })
        .catch(() => {});
      // Transiente (rede OU status ainda não-terminal = lag) → 503 pra SharkHub
      // RETENTAR (não creditamos sem confirmação). Divergência dura → 401.
      return NextResponse.json(
        {
          error: transient ? "confirmation_unavailable" : "unconfirmed_status",
          reason: sig.reason,
        },
        { status: transient ? 503 : 401 },
      );
    }
  }

  // Salva o webhook bruto no providerPayload (preserva os outros campos).
  // wh_sig_seen captura o(s) header(s) de assinatura recebido(s) + o raw body em
  // TODO webhook (inclusive PENDING, que pula a verificação) — sem custo extra de
  // escrita. Assim o PRÓXIMO webhook de qualquer status já revela se a SharkHub
  // assina, sob qual nome de header, e com qual valor (pra cruzar offline com o
  // HMAC e ter 100% de certeza da codificação).
  // Captura TODOS os nomes de header (nomes NÃO são segredo) + o valor de
  // qualquer header com cara de assinatura (sign/hmac/hash/hub) — assim o
  // próximo webhook revela DEFINITIVAMENTE se a SharkHub assina e sob QUAL nome,
  // mesmo que não seja nenhum dos apelidos que já testamos.
  const allHeaderKeys = [...request.headers.keys()];
  const sigHeaders: Record<string, string> = {};
  for (const [k, v] of request.headers.entries()) {
    if (/sign|hmac|hash|hub/i.test(k)) sigHeaders[k] = v;
  }
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      providerPayload: {
        ...existingPayload,
        raw_webhook: body as unknown as object,
        wh_at: new Date().toISOString(),
        // como o status de dinheiro foi PROVADO: "hmac" | "api_lookup" | null
        // (null = status não-monetário, ex. PENDING, que não exige prova).
        wh_verified_via: verifiedVia,
        wh_sig_seen: {
          x_signature: request.headers.get("x-signature"),
          signature: request.headers.get("signature"),
          x_webhook_signature: request.headers.get("x-webhook-signature"),
          x_hub_signature_256: request.headers.get("x-hub-signature-256"),
          all_header_keys: allHeaderKeys,
          sig_headers: sigHeaders,
          raw: rawBody.slice(0, 4000),
        },
      } as never,
    },
  });

  if (isPaidStatus(statusRaw) && tx.status !== "PAID") {
    await markTransactionPaid(tx.id);
    if (acquirerId) {
      const { recordAcquirerApproval } = await import("@/lib/acquirers");
      await recordAcquirerApproval(acquirerId, tx.userId).catch(() => {});
    }
  } else if (isRefundedStatus(statusRaw) && tx.status !== "REFUNDED") {
    await markTransactionRefunded(tx.id);
  } else if (isChargedbackStatus(statusRaw) && tx.status !== "CHARGEBACK") {
    await markTransactionChargedback(tx.id);
  } else if (isFailedStatus(statusRaw) && tx.status === "PENDING") {
    await markTransactionExpired(tx.id);
  }

  // Auditoria — IdempotencyKey APÓS o processamento. Best-effort.
  prisma.idempotencyKey
    .create({
      data: {
        key: `webhook:sharkhub:${providerId}:${statusRaw}`,
        bodyHash: createHmac("sha256", "sharkhub-replay")
          .update(rawBody)
          .digest("hex"),
        response: { processed: true, status: statusRaw } as object,
        status: 200,
        endpoint: "webhook:sharkhub",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "sharkhub" });
}
