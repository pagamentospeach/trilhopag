/**
 * Webhook signature verification com:
 *  - HMAC-SHA256 constant-time
 *  - Timestamp tolerance curta (5min default) — anti-replay
 *  - Nonce store (opcional) — anti-replay forte
 *  - Body raw integrity (não JSON.parse antes de verificar)
 *
 * Use em todo webhook recebido de adquirente.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../prisma";

/**
 * Secret-token determinístico por bot do Telegram.
 *
 * O Telegram não assina o body — ele apenas devolve, no header
 * `X-Telegram-Bot-Api-Secret-Token`, o `secret_token` que foi passado no
 * setWebhook. Validar esse header garante que o update veio mesmo do
 * Telegram (e não de alguém que descobriu o botId e forja POSTs pra abusar
 * do token do bot do seller).
 *
 * Deriva de APP_ENCRYPTION_KEY (sempre setado em prod) via HMAC — assim não
 * precisa de coluna nova no schema: tanto o setWebhook quanto o handler
 * recomputam o mesmo valor a partir do botId. Hex de 64 chars satisfaz o
 * formato exigido pelo Telegram (`[A-Za-z0-9_-]{1,256}`).
 *
 * Retorna null se nenhum secret de servidor estiver disponível (dev sem env).
 */
export function deriveTelegramWebhookSecret(botId: string): string | null {
  const serverSecret =
    process.env.APP_ENCRYPTION_KEY ?? process.env.ANTI_BOT_SECRET;
  if (!serverSecret) return null;
  return createHmac("sha256", serverSecret)
    .update(`telegram-webhook:${botId}`)
    .digest("hex");
}

/** Compara dois secrets em tempo constante (evita timing-attack). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export type VerifyResult =
  | { ok: true; payload: unknown }
  | { ok: false; status: number; error: string };

export type WebhookVerifyOpts = {
  /** Raw body do request (NÃO parsed) */
  body: string;
  /** Header com a assinatura (ex: "x-safepix-signature") */
  signature: string | null;
  /** Header com timestamp Unix (segundos). Se null, tolera (alguns providers não enviam) */
  timestamp?: string | null;
  /** Secret HMAC */
  secret: string;
  /** Tolerância máxima de drift em segundos (default 300 = 5min) */
  maxAgeSeconds?: number;
  /** Formato da assinatura: "hex" (default) ou "base64" */
  encoding?: "hex" | "base64";
  /** Algoritmo: sha256 (default), sha512 */
  algorithm?: "sha256" | "sha512";
  /**
   * String a assinar. Default é body. Stripe-style: `${timestamp}.${body}`.
   * Pass como template ou função.
   */
  payloadBuilder?: (body: string, timestamp: string | null) => string;
  /** Anti-replay forte: ID único do evento — guardado no DB e bloqueia repetição */
  eventId?: string | null;
  /** Source do webhook (pra rastreio, ex: "safepix") */
  source: string;
};

export async function verifyWebhook(opts: WebhookVerifyOpts): Promise<VerifyResult> {
  const {
    body,
    signature,
    timestamp,
    secret,
    maxAgeSeconds = 300,
    encoding = "hex",
    algorithm = "sha256",
    payloadBuilder,
    eventId,
    source,
  } = opts;

  if (!secret) {
    return { ok: false, status: 500, error: "Webhook secret não configurado" };
  }
  if (!signature) {
    return { ok: false, status: 401, error: "Assinatura ausente" };
  }

  // Timestamp check (anti-replay simples)
  if (timestamp) {
    const ts = parseInt(timestamp, 10);
    if (!Number.isFinite(ts)) {
      return { ok: false, status: 400, error: "Timestamp inválido" };
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > maxAgeSeconds) {
      return { ok: false, status: 401, error: "Timestamp fora da janela aceita" };
    }
  }

  // Build payload to sign
  const payload = payloadBuilder ? payloadBuilder(body, timestamp ?? null) : body;
  const expected = createHmac(algorithm, secret).update(payload).digest(encoding);

  // Constant-time compare
  let signaturesMatch = false;
  try {
    const a = Buffer.from(expected, encoding);
    const b = Buffer.from(signature, encoding);
    if (a.length === b.length) {
      signaturesMatch = timingSafeEqual(a, b);
    }
  } catch {
    signaturesMatch = false;
  }
  if (!signaturesMatch) {
    return { ok: false, status: 401, error: "Assinatura inválida" };
  }

  // Anti-replay forte: nonce store
  if (eventId) {
    try {
      // Tenta criar uma idempotency key — se já existe (P2002), é replay
      const key = `webhook:${source}:${eventId}`;
      await prisma.idempotencyKey.create({
        data: {
          key,
          bodyHash: createHmac("sha256", secret).update(body).digest("hex"),
          response: { received: true } as object,
          status: 200,
          endpoint: `webhook:${source}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("P2002") || msg.includes("Unique constraint")) {
        return { ok: false, status: 200, error: "Replay (já processado)" };
      }
      // Outros erros: loga mas não bloqueia (não queremos perder webhook real)
      console.error("[webhook] anti-replay store falhou:", err);
    }
  }

  // Parse payload
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "Body não é JSON válido" };
  }
  return { ok: true, payload: parsed };
}
