import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  transactionId: z.string().min(1),
  slug: z.string().min(1),
});

/**
 * Registra "tentativa de pagamento por cartao" quando o user termina
 * de preencher o Stripe PaymentElement (event onChange.complete=true).
 *
 * Sem auth (publica) — o checkout e publico. Mas validamos que a tx existe
 * e bate com o slug. Idempotente: se ja existe CardCapture pra essa tx,
 * so atualiza updatedAt.
 *
 * Stripe Elements NAO entrega brand/last4/exp/PAN aqui — esses dados sao
 * recebidos no webhook payment_intent.succeeded/failed via stripe.paymentMethods.retrieve.
 * Esse endpoint serve so pra marcar "lead chegou ate o final do form".
 */
export async function POST(request: Request) {
  // Rate limit: endpoint publico que cria/atualiza CardCapture. Sem RL um
  // atacante com transactionId valido pode spammar updates (DB bloat).
  // 60/min/IP eh suficiente — fluxo normal so chama 1x por checkout.
  const ip = getClientIp(request);
  const rl = rateLimit(`card-capture:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetIn / 1000).toString() } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const { transactionId, slug } = parsed.data;

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      amountCents: true,
      currency: true,
      customerEmail: true,
      customerName: true,
      customerCpf: true,
      customerPhone: true,
      customerIp: true,
      checkout: { select: { slug: true } },
    },
  });
  if (!tx) {
    return NextResponse.json({ ok: false, error: "tx_not_found" }, { status: 404 });
  }
  if (tx.checkout?.slug !== slug) {
    return NextResponse.json({ ok: false, error: "slug_mismatch" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") || null;

  // Upsert por transactionId pra nao duplicar
  const existing = await prisma.cardCapture.findFirst({
    where: { transactionId },
    select: { id: true },
  });
  if (existing) {
    await prisma.cardCapture.update({
      where: { id: existing.id },
      data: {
        updatedAt: new Date(),
        userAgent: userAgent ?? undefined,
      },
    });
  } else {
    await prisma.cardCapture.create({
      data: {
        userId: tx.userId,
        transactionId: tx.id,
        amountCents: tx.amountCents,
        currency: tx.currency,
        email: tx.customerEmail,
        phone: tx.customerPhone,
        cpf: tx.customerCpf,
        cardholderName: tx.customerName,
        customerIp: tx.customerIp,
        userAgent,
        checkoutSlug: slug,
        status: "attempted",
      },
    });
  }
  return NextResponse.json({ ok: true });
}
