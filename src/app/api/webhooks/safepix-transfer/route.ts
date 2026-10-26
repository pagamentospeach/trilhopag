import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isFailedStatus,
  isPaidStatus,
} from "@/lib/providers/safepix";
import {
  markWithdrawalFailed,
  markWithdrawalPaid,
} from "@/lib/withdrawals";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.SAFEPIX_WEBHOOK_SECRET;
  const token = process.env.SAFEPIX_WEBHOOK_TOKEN;
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
  if (token) {
    const provided = headers.get("x-webhook-token") || "";
    const a = Buffer.from(provided);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_token" };
    }
    return { ok: true };
  }
  // FAIL CLOSED em TODOS os ambientes. Antes "if !prod return ok" abria
  // preview/staging deploys — que podem rodar no MESMO DB de prod.
  return { ok: false, reason: "no_secret_configured" };
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = rateLimit(`webhook-safepix-tr:${ip}`, 600, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const rawBody = await request.text();
  const sig = verifyWebhookSignature(rawBody, request.headers);
  // SEGURANÇA (igual ao webhook de cobrança): a SafePix NÃO expõe API de status
  // de transferência (GET responde 401) e o postback pode vir SEM assinatura. Se
  // a gente fail-close em "no_secret_configured", TODO saque fica preso em
  // PROCESSING (foi o bug). Então: só RECUSA quando a assinatura/token VEIO mas é
  // INVÁLIDA (adulteração clara → 503 pra re-entrega). Quando não dá pra
  // verificar, confiamos no body — a correlação é pelo `withdrawal_id`, que é id
  // interno (não vai em resposta pública), então não é forjável facilmente.
  const sigTampered =
    !sig.ok &&
    (sig.reason === "invalid_signature" || sig.reason === "invalid_token");
  if (sigTampered) {
    console.warn("[safepix-transfer webhook] assinatura inválida — recusando:", sig.reason);
    return NextResponse.json(
      { error: "invalid_signature", retry: true },
      { status: 503 },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const meta = (body.Metadata ?? body.metadata) as
    | Record<string, unknown>
    | undefined;
  const withdrawalId =
    (meta?.withdrawal_id as string | undefined) ??
    (meta?.["withdrawal_id"] as string | undefined);

  const statusRaw = String(body.Status ?? body.status ?? "");

  if (!withdrawalId || !statusRaw) {
    return NextResponse.json(
      { ok: true, message: "missing_metadata_or_status" },
      { status: 200 },
    );
  }

  if (isPaidStatus(statusRaw)) {
    await markWithdrawalPaid(withdrawalId);
  } else if (isFailedStatus(statusRaw)) {
    await markWithdrawalFailed(
      withdrawalId,
      String(body.FailReason ?? body.failure_reason ?? statusRaw),
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "safepix-transfer" });
}
