import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { safeFetch } from "./security/ssrf";

const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_SEC = [30, 120, 600, 1800, 3600, 10800, 21600, 86400];

// 08/08/2026: a união saiu daqui pro catálogo neutro em lib/webhook-events.ts,
// que o formulário também consegue importar. Enquanto ela morava neste arquivo
// (que puxa prisma), o form "use client" tinha que manter uma cópia à mão — e
// as duas divergiram. Reexportado pra não quebrar quem já importava daqui.
// `export ... from` reexporta mas NÃO traz o nome pro escopo deste arquivo, e
// as funções abaixo tipam parâmetros com ele — por isso o import junto.
import type { WebhookEvent } from "./webhook-events";
export type { WebhookEvent };

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signPayload(payload: string, secret: string, timestamp: number) {
  const signedPayload = `${timestamp}.${payload}`;
  const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export async function dispatchEvent(
  userId: string,
  event: WebhookEvent,
  payload: unknown,
) {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, active: true },
  });
  const matches = webhooks.filter(
    (w) => w.events.length === 0 || w.events.includes(event),
  );
  await Promise.all(matches.map((w) => deliverOnce(w.id, event, payload)));
}

async function deliverOnce(webhookId: string, event: WebhookEvent, payload: unknown) {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || !webhook.active) return;

  // Cria a delivery PRIMEIRO: assim o event id (`evt_<deliveryId>`) é ESTÁVEL
  // em TODAS as retentativas desta mesma entrega — o receptor pode deduplicar
  // por esse id com segurança (a retentativa traz o MESMO evt_id, só muda o
  // timestamp/assinatura).
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event,
      payload: payload as never,
      attempts: 0,
      succeeded: false,
    },
  });

  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: `evt_${delivery.id}`,
    type: event,
    created: ts,
    data: payload,
  });
  const signature = signPayload(body, webhook.secret, ts);

  await attemptDelivery(delivery.id, webhook.url, body, signature);
}

async function attemptDelivery(
  deliveryId: string,
  url: string,
  body: string,
  signature: string,
) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!delivery) return;

  const attempts = delivery.attempts + 1;

  try {
    // FIX M6: usa safeFetch pra bloquear SSRF — seller cadastra webhook.url
    // arbitrário, atacante poderia setar http://169.254.169.254/ ou
    // http://10.0.0.0/ pra fazer fetch interno (metadata AWS, rede privada).
    // safeFetch valida resolução DNS contra blocklist (RFC1918, link-local,
    // loopback) e bloqueia esquemas não-HTTP(S).
    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Trilho-Webhook/1.0",
        // Header canônico + alias `X-` (compat com receptores que esperam o
        // prefixo X-). Ambos carregam o MESMO valor: `t=<ts>,v1=<hmac>`.
        "Trilho-Signature": signature,
        "X-Trilho-Signature": signature,
      },
      body,
      timeoutMs: 10_000,
    });

    const respBody = (await res.text()).slice(0, 1000);
    const succeeded = res.ok;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        statusCode: res.status,
        responseBody: respBody,
        attempts,
        succeeded,
        nextRetryAt: succeeded ? null : computeRetry(attempts),
      },
    });
  } catch (err) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        statusCode: null,
        responseBody: err instanceof Error ? err.message.slice(0, 1000) : "Network error",
        attempts,
        succeeded: false,
        nextRetryAt: computeRetry(attempts),
      },
    });
  }
}

function computeRetry(attempts: number): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delaySec = RETRY_DELAYS_SEC[attempts - 1] ?? 86400;
  return new Date(Date.now() + delaySec * 1000);
}

export async function processPendingRetries(limit = 50) {
  const now = new Date();
  // orderBy nextRetryAt asc = fairness. Sem isso, o Prisma retorna em
  // ordem indefinida (PK desc geralmente) e deliveries antigas ficam pra
  // tras quando ha backlog grande — pode causar webhook do seller atrasar
  // dias com cron daily (Vercel Hobby).
  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      succeeded: false,
      nextRetryAt: { not: null, lte: now },
      attempts: { lt: MAX_ATTEMPTS },
    },
    include: { webhook: true },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });

  for (const d of deliveries) {
    if (!d.webhook.active) continue;
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      // MESMO id da entrega original (estável entre retentativas).
      id: `evt_${d.id}`,
      type: d.event,
      created: ts,
      data: d.payload,
    });
    const signature = signPayload(body, d.webhook.secret, ts);
    await attemptDelivery(d.id, d.webhook.url, body, signature);
  }
  return deliveries.length;
}

/**
 * Reenviar uma entrega que já existe (seção 13: "reenviar evento").
 *
 * ⚠️ REUSA O MESMO `evt_id`, e isso é o ponto.
 *
 * O `deliverOnce` cria a delivery ANTES de despachar justamente pra o id do
 * evento (`evt_<deliveryId>`) ser estável entre tentativas — o receptor
 * deduplica por ele. Se o reenvio criasse uma delivery nova, o mesmo fato
 * chegaria com id diferente e um receptor bem escrito o trataria como um
 * SEGUNDO evento: venda contada duas vezes do outro lado.
 *
 * O timestamp e a assinatura são novos de propósito. A assinatura cobre
 * `t=<ts>`, e receptores rejeitam timestamp velho como proteção contra replay
 * — reenviar com a assinatura original seria entregar algo que o outro lado
 * deve recusar.
 */
export async function redeliverWebhook(
  deliveryId: string,
): Promise<{ ok: boolean; status: number | null }> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery) return { ok: false, status: null };
  if (!delivery.webhook.active) return { ok: false, status: null };

  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: `evt_${delivery.id}`,
    type: delivery.event,
    created: ts,
    data: delivery.payload,
  });
  const signature = signPayload(body, delivery.webhook.secret, ts);

  await attemptDelivery(delivery.id, delivery.webhook.url, body, signature);

  const depois = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { succeeded: true, statusCode: true },
  });
  return { ok: !!depois?.succeeded, status: depois?.statusCode ?? null };
}

/**
 * Disparar um evento de teste (seção 13: "testar webhook").
 *
 * Passa pelo MESMO caminho de uma entrega real — mesma assinatura HMAC, mesmo
 * formato de envelope, mesma gravação em WebhookDelivery. Um teste que usa
 * outro caminho testa o outro caminho: o dev veria 200 aqui e falha em
 * produção por diferença de header ou de assinatura.
 *
 * O `type` é `transaction.paid` porque é o evento que praticamente todo
 * receptor implementa primeiro. O payload é claramente falso (`tx_teste_...`,
 * e-mail em example.com) pra ninguém confundir com venda de verdade — e a
 * entrega fica no histórico marcada pelo próprio id do produto.
 */
export async function sendTestWebhook(webhookId: string) {
  await deliverOnce(webhookId, "transaction.paid", {
    id: `tx_teste_${Date.now().toString(36)}`,
    status: "PAID",
    amount_cents: 1000,
    currency: "BRL",
    method: "PIX",
    customer: { name: "Cliente de Teste", email: "teste@example.com" },
    product: { id: "prod_teste", name: "Evento de teste do Trilho" },
    test: true,
  });
}
