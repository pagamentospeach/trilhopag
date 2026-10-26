import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Upload do COMPROVANTE de pagamento pelo LEAD (público, sem sessão).
 *
 * Fluxo: o checkout gera o PIX → o lead paga no banco dele → volta no
 * checkout e sobe a foto/print do comprovante. O seller vê em Vendas.
 *
 * Só aparece quando o seller liga a opção "Envio de comprovante" no
 * builder (theme.receiptUpload). O endpoint em si é genérico/tx-scoped:
 *  - PÚBLICO (lead não tem login) — modelado no /copy route.
 *  - Rate-limited por IP (anti-spam de upload).
 *  - Guarda a URL do blob em Transaction.providerPayload.receipt_url
 *    (sem mudar schema — campo JSON já existe).
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const ip = getClientIp(request);
  const rl = rateLimit(`tx-receipt:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Valida o arquivo
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Arquivo muito grande (máx 10MB)." },
      { status: 413 },
    );
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "bad_type", message: "Use JPG, PNG, WEBP, HEIC ou PDF." },
      { status: 415 },
    );
  }

  // A tx tem que existir. Não vaza existência (resposta genérica se não acha).
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      providerPayload: true,
      userId: true,
      customerName: true,
      customerEmail: true,
      amountCents: true,
      // Skip desviadas (06/07): recibo eh salvo no payload igual, mas
      // NAO dispara push nem webhook — evita que o seller receba
      // "cliente X enviou comprovante" e va procurar uma venda que nao
      // aparece pra ele na aba /dashboard/vendas (denuncia o desvio).
      divertedToAcquirer: true,
      divertedToReferrer: true,
    },
  });
  if (!tx) {
    // Resposta neutra — não confirma/desmente a existência da tx.
    return NextResponse.json({ ok: true, saved: false });
  }

  // Upload pro Blob
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeExt = ext?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const rid = randomBytes(6).toString("hex");
  const path = `receipts/${id}/${Date.now()}-${rid}.${safeExt}`;

  let url: string;
  try {
    const blob = await put(path, file, {
      access: "public",
      contentType: file.type || undefined,
      addRandomSuffix: false,
    });
    url = blob.url;
  } catch (e) {
    console.error("[receipt] blob error:", e);
    return NextResponse.json(
      { error: "upload_failed", message: "Falha ao subir o comprovante." },
      { status: 500 },
    );
  }

  // Mescla a URL no providerPayload (preserva o resto).
  const payload =
    (tx.providerPayload as Record<string, unknown> | null) ?? {};
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      providerPayload: {
        ...payload,
        receipt_url: url,
        receipt_uploaded_at: new Date().toISOString(),
      } as never,
    },
  });

  // Notifica o seller (push web) + dispara webhook transaction.receipt_uploaded.
  // Fire-and-forget — não bloqueia a resposta pro lead.
  // SKIP pra desviadas (06/07): se seller receber "comprovante recebido"
  // pra tx desviada, ele vai procurar a venda em /dashboard/vendas, nao
  // vai encontrar (filtro divertedTo* esconde), e descobre o desvio.
  if (!tx.divertedToAcquirer && !tx.divertedToReferrer) {
    (async () => {
      try {
        const { sendPushToUser } = await import("@/lib/push");
        await sendPushToUser(tx.userId, {
          title: "📎 Comprovante recebido",
          body: `${tx.customerName || tx.customerEmail} enviou um comprovante.`,
          url: "/dashboard/vendas",
          kind: "generic",
        });
      } catch {
        /* push best-effort */
      }
      try {
        const { dispatchEvent } = await import("@/lib/webhooks");
        await dispatchEvent(tx.userId, "transaction.receipt_uploaded", {
          id: tx.id,
          receipt_url: url,
          amount_cents: tx.amountCents,
          customer: { name: tx.customerName, email: tx.customerEmail },
          uploaded_at: new Date().toISOString(),
        });
      } catch {
        /* webhook best-effort */
      }
    })();
  }

  return NextResponse.json({ ok: true, saved: true, url });
}
