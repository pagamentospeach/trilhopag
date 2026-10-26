/**
 * 22/07/2026 (davi: "Tira esse negocio de escolher checkout, o seller so
 * precisa escolher o valor").
 *
 * Gera PIX direto pro seller com VALOR arbitrário — sem produto/checkout
 * específico. Usa o ghost product interno (mesmo que a API pública
 * /v1/transactions usa quando não vem product_id).
 *
 * PSP (SafePix e afins) só devolve o "copia-e-cola" EMV. A imagem do QR
 * a gente gera aqui com a lib `qrcode` e devolve como data URL (PNG
 * base64). Runtime converte pra Buffer e envia via sendPhoto multipart
 * do Telegram.
 */
import { after } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import QRCode from "qrcode";
import { prisma } from "./prisma";
import { dispatchPixCharge, normalizeAcquirerCodeToProvider } from "./acquirers";
import {
  splitFeeBetweenPlatformAndReferrer,
  applyAcquirerSurchargePostDispatch,
} from "./fees";
import { getOrCreateApiGhostProduct } from "./api-ghost-product";
import { ensureValidCustomer } from "./fake-customer";
import { buildPostbackUrl } from "./security/webhook-secret";
import { notifyTransactionCreated } from "./transactions";

export type BotFunnelPixResult =
  | {
      ok: true;
      transaction_id: string;
      copy_paste: string;
      /** Data URL PNG do QR code (gerado no server via lib qrcode). */
      qr_code_data_url: string;
      amount_cents: number;
      /** Data de expiração (usado pra countdown timer no chat). */
      expires_at: Date;
    }
  | { ok: false; error: string };

export async function generateBotFunnelPix(input: {
  userId: string;
  botId: string;
  chatId: string;
  amountCents: number;
  label?: string;
  customerName?: string;
  /**
   * Índice do plano escolhido no bloco `payment` modo button. Persistido em
   * providerPayload.plan_idx pra que quando o webhook confirmar o pagamento,
   * o runtime saiba rotear pra bolinha `upsell_${planIdx}` correta (cada plano
   * pode ter seu próprio entregável).
   *
   * 29/07/2026 (davi: "faça com que o painel do upsell tenha mais bolinhas de
   * pagou de acordo com o tanto de plano criado dentro dele... o certo seria
   * duas bolinhas de pago para separar o entregavel de cada um").
   *
   * undefined quando o bloco tem só 1 plano OU o pagamento veio de modo chat/
   * botproduct/link — nesses casos o runtime usa a bolinha `upsell` genérica.
   */
  planIdx?: number;
}): Promise<BotFunnelPixResult> {
  const { userId, botId, chatId, planIdx } = input;
  const amountCents = Math.round(input.amountCents);

  if (!Number.isFinite(amountCents) || amountCents < 200) {
    return { ok: false, error: "Valor mínimo: R$ 2,00" };
  }
  if (amountCents > 100_000_00) {
    return { ok: false, error: "Valor muito alto" };
  }

  const label = (input.label ?? "").trim() || "PIX do bot";
  const fromName = (input.customerName ?? "").trim() || "Cliente Telegram";
  const customer = ensureValidCustomer({ name: fromName });

  const [ghost, split] = await Promise.all([
    getOrCreateApiGhostProduct(userId, { name: "Bot funnel PIX" }),
    splitFeeBetweenPlatformAndReferrer({
      sellerUserId: userId,
      amountCents,
      method: "PIX",
    }),
  ]);

  const txId = createId();
  const expiresAt = new Date(Date.now() + 3600 * 1000);
  const botFunnelTrace = `${botId}|${chatId}`;

  await prisma.transaction.create({
    data: {
      id: txId,
      userId,
      productId: ghost.id,
      checkoutId: null,
      customerEmail: customer.email ?? `tg-${chatId}@trilhopag.com`,
      customerName: customer.name,
      customerCpf: customer.cpf,
      customerPhone: customer.phone,
      amountCents,
      feeCents: split.feeCents,
      netCents: split.netCents,
      currency: "BRL",
      method: "PIX",
      status: "PENDING",
      provider: "safepix",
      pixExpiresAt: expiresAt,
      // Bot funnel: iniciado pelo próprio seller (via /start do cliente) —
      // nunca desvia. Mesma regra da cobrança avulsa.
      divertedToReferrer: false,
      originHost: "telegram_bot",
      originPath: `bot:${botId}`,
      utmSource: "telegram_bot",
      utmMedium: "bot_funnel",
      utmCampaign: `botfunnel|${botId}`,
      utmContent: chatId,
      botFunnelTrace,
      providerPayload: {
        bot_funnel: true,
        bot_id: botId,
        chat_id: chatId,
        label,
        // Só entra quando o seller de fato dividiu em planos. `undefined`
        // é omitido no JSON (Prisma) — fica leve pros funis single-plan.
        ...(Number.isFinite(planIdx) ? { plan_idx: planIdx } : {}),
        ...(split.referrerEarningsCents > 0
          ? { referrer_earnings_cents: split.referrerEarningsCents }
          : {}),
      },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  const cpfDigits = (customer.cpf ?? "").replace(/\D/g, "");
  const dispatchInput = {
    amountCents,
    postbackUrl: buildPostbackUrl(`${appUrl}/api/webhooks/safepix`, txId),
    customer: {
      name: customer.name ?? "Cliente",
      email: customer.email ?? `tg-${chatId}@trilhopag.com`,
      document: {
        number: cpfDigits || "00000000000",
        type: (cpfDigits.length === 14 ? "cnpj" : "cpf") as "cpf" | "cnpj",
      },
      phone: customer.phoneForProvider ?? undefined,
    },
    items: [
      {
        title: label,
        unit_price: amountCents,
        quantity: 1,
        tangible: false,
        external_ref: txId,
      },
    ],
    metadata: { transaction_id: txId },
  };

  const charge = await dispatchPixCharge({ userId, input: dispatchInput });
  if (!charge.ok || !charge.charge) {
    await prisma.transaction
      .update({
        where: { id: txId },
        data: {
          providerPayload: {
            bot_funnel: true,
            bot_id: botId,
            chat_id: chatId,
            label,
            // Preserva plan_idx aqui também — se a tx for retentada e depois
            // paga, o webhook precisa achar o plano pra rotear pra upsell_${i}.
            ...(Number.isFinite(planIdx) ? { plan_idx: planIdx } : {}),
            dispatch_pending_since: new Date().toISOString(),
            last_error: charge.finalError ?? null,
          } as never,
        },
      })
      .catch(() => {});
    console.error("[bot-funnel-pix] dispatch falhou (tx PENDING):", charge.finalError);
    return { ok: false, error: "Não consegui gerar o PIX agora. Tenta de novo em segundos." };
  }

  const acquirerCode = charge.acquirerCode ?? "safepix";
  const normalizedProvider = normalizeAcquirerCodeToProvider(acquirerCode);
  const copyPaste = charge.charge.qrCode ?? "";

  const currentTx = await prisma.transaction.findUnique({
    where: { id: txId },
    select: { providerPayload: true },
  });
  const currentPayload =
    (currentTx?.providerPayload as Record<string, unknown> | null) ?? {};

  await prisma.transaction.update({
    where: { id: txId },
    data: {
      pixCopyPaste: copyPaste || null,
      providerId: charge.charge.id ?? null,
      provider: normalizedProvider,
      providerPayload: {
        ...currentPayload,
        acquirer_id: charge.acquirerId,
        acquirer_code: charge.acquirerCode ?? null,
        acquirer_attempts: charge.attempts.length,
      } as never,
    },
  });

  after(async () => {
    try {
      await applyAcquirerSurchargePostDispatch({
        transactionId: txId,
        amountCents,
        baseFeeCents: split.feeCents,
        acquirerId: charge.acquirerId,
        acquirerCode: charge.acquirerCode ?? null,
      });
    } catch (e) {
      console.error("[bot-funnel-pix] surcharge post-dispatch falhou:", e);
    }
  });
  after(() => notifyTransactionCreated(txId).catch(() => {}));

  // Gera QR PNG (data URL) — SafePix não devolve imagem, só o EMV.
  let qrDataUrl = "";
  if (copyPaste) {
    try {
      qrDataUrl = await QRCode.toDataURL(copyPaste, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 512,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
    } catch (e) {
      console.warn("[bot-funnel-pix] gerar QR falhou (segue só com copy-paste):", e);
    }
  }

  return {
    ok: true,
    transaction_id: txId,
    copy_paste: copyPaste,
    qr_code_data_url: qrDataUrl,
    amount_cents: amountCents,
    expires_at: expiresAt,
  };
}
