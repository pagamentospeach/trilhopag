import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchPixCharge, normalizeAcquirerCodeToProvider } from "@/lib/acquirers";
import { nextBillingDate, isValidInterval } from "@/lib/recurrence";
import {
  splitFeeBetweenPlatformAndReferrer,
  applyAcquirerSurchargePostDispatch,
} from "@/lib/fees";
import { notifyTransactionCreated } from "@/lib/transactions";
import { createId } from "@paralleldrive/cuid2";
import { buildPostbackUrl } from "@/lib/security/webhook-secret";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Processa Subscriptions com nextBillingAt <= now() — cria PIX charges
 * pra renovar e atualiza o status.
 *
 * Cron sugerido: a cada 1h (ou diário às 9h) via vercel.json.
 *
 * Idempotência: a query é fila simples; cada sub é processada uma vez
 * por execução. Se uma execução cair no meio, na próxima ela tenta de
 * novo (nextBillingAt ainda está vencido).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const BATCH = 50;

  const due = await prisma.subscription.findMany({
    where: {
      status: "active",
      nextBillingAt: { lte: now },
    },
    take: BATCH,
    orderBy: { nextBillingAt: "asc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          recurrenceInterval: true,
          recurrenceTrialDays: true,
          recurrenceMaxBillings: true,
        },
      },
    },
  });

  let processed = 0;
  let failed = 0;
  let completed = 0;

  for (const sub of due) {
    // FONTE DE VERDADE = a própria Subscription (sub.interval), não o produto.
    // Assinaturas criadas via API (POST /api/v1/subscriptions ou override) usam
    // produto ghost SEM recurrenceInterval — antes o cron lia
    // sub.product.recurrenceInterval (null) e PULAVA pra sempre = nunca cobrava.
    const interval = sub.interval || sub.product.recurrenceInterval || "";
    if (!interval || !isValidInterval(interval)) continue;

    // max_billings: override da API (no payload da tx inicial) tem prioridade
    // sobre o limite do produto. Sem nenhum → ilimitado.
    // split: lido do MESMO recurrence_override pra aplicar em CADA renovação.
    let maxBillings: number | null = sub.product.recurrenceMaxBillings ?? null;
    let recurringSplit: {
      recipient_user_id: string;
      recipient_label?: string;
      amount_cents: number;
    } | null = null;
    if (sub.initialTransactionId) {
      const initTx = await prisma.transaction.findUnique({
        where: { id: sub.initialTransactionId },
        select: { providerPayload: true },
      });
      const ov = (initTx?.providerPayload as Record<string, unknown> | null)
        ?.recurrence_override as
        | {
            max_billings?: number | null;
            split?: {
              recipient_user_id?: string;
              recipient_label?: string;
              amount_cents?: number;
            } | null;
          }
        | undefined;
      if (ov && typeof ov.max_billings === "number") maxBillings = ov.max_billings;
      if (
        ov?.split &&
        typeof ov.split.recipient_user_id === "string" &&
        typeof ov.split.amount_cents === "number" &&
        ov.split.amount_cents >= 1
      ) {
        recurringSplit = {
          recipient_user_id: ov.split.recipient_user_id,
          recipient_label: ov.split.recipient_label,
          amount_cents: ov.split.amount_cents,
        };
      }
    }

    // Atingiu max billings? Completa e segue.
    if (maxBillings && sub.billingsCount >= maxBillings) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "completed" },
      });
      completed++;
      continue;
    }

    // CLAIM ATÔMICO (anti dupla-cobrança — auditoria jun/2026):
    // avança nextBillingAt pro próximo ciclo ANTES de cobrar. Se outra
    // execução do cron (timeout+retry do Vercel, ou /tick + cron nativo)
    // pegou esta sub primeiro, o updateMany retorna count=0 e a gente pula
    // — então só UMA execução cria o PIX deste ciclo. Antes, 2 execuções
    // concorrentes criavam 2 PIX reais (cliente cobrado em dobro).
    const billingBasis = sub.nextBillingAt ?? now;
    const next = nextBillingDate(billingBasis, interval, null, false);
    const claim = await prisma.subscription.updateMany({
      where: { id: sub.id, status: "active", nextBillingAt: { lte: now } },
      data: { nextBillingAt: next, currentPeriodStart: now },
    });
    if (claim.count === 0) {
      // Outra execução já está cobrando este ciclo.
      continue;
    }

    // Cria nova Transaction PIX pra cobrar este ciclo
    const txId = createId();
    try {
      // Fee split
      const split = await splitFeeBetweenPlatformAndReferrer({
        sellerUserId: sub.userId,
        amountCents: sub.amountCents,
        method: "PIX",
      });

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";

      const tx = await prisma.transaction.create({
        data: {
          id: txId,
          userId: sub.userId,
          productId: sub.productId,
          customerEmail: sub.customerEmail,
          customerName: sub.customerName,
          customerCpf: sub.customerCpf,
          customerPhone: sub.customerPhone,
          amountCents: sub.amountCents,
          feeCents: split.feeCents,
          netCents: split.netCents,
          currency: "BRL",
          method: "PIX",
          status: "PENDING",
          provider: "safepix",
          originHost: "cron",
          originPath: `cron:process-subscriptions/${sub.id}`,
          providerPayload: {
            subscription_id: sub.id,
            billing_n: sub.billingsCount + 1,
            // BUG-FIX (rede): congela o ganho do referrer em CADA renovação —
            // antes só a cobrança de ativação persistia referrer_earnings_cents,
            // então o indicador parava de receber comissão a partir da 2ª
            // cobrança da assinatura do indicado.
            ...(split.referrerEarningsCents > 0
              ? { referrer_earnings_cents: split.referrerEarningsCents }
              : {}),
            // SPLIT recorrente: replica o split da assinatura em cada ciclo.
            // Clampa no líquido desta cobrança pra nunca exceder o net.
            ...(recurringSplit
              ? {
                  split: {
                    recipient_user_id: recurringSplit.recipient_user_id,
                    recipient_label: recurringSplit.recipient_label,
                    amount_cents: Math.min(
                      recurringSplit.amount_cents,
                      split.netCents,
                    ),
                  },
                }
              : {}),
          } as never,
        },
      });

      // Dispara cobrança no PSP via acquirer dispatcher
      const dispatch = await dispatchPixCharge({
        userId: sub.userId,
        productId: sub.productId,
        input: {
          amountCents: sub.amountCents,
          postbackUrl: buildPostbackUrl(`${appUrl}/api/webhooks/safepix`, tx.id),
          customer: {
            name: sub.customerName ?? sub.customerEmail,
            email: sub.customerEmail,
            document: {
              number: sub.customerCpf ?? "00000000000",
              type: (sub.customerCpf?.length ?? 0) === 14 ? "cnpj" : "cpf",
            },
            phone: sub.customerPhone ?? undefined,
          },
          items: [
            {
              title: sub.product.name.slice(0, 80),
              unit_price: sub.amountCents,
              quantity: 1,
              tangible: false,
            },
          ],
          metadata: { transaction_id: txId, subscription_id: sub.id },
        },
      });

      if (!dispatch.ok || !dispatch.charge) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { status: "FAILED" },
        });
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            failedAttempts: { increment: 1 },
            status: sub.failedAttempts >= 2 ? "canceled" : "past_due",
            cancelReason:
              sub.failedAttempts >= 2 ? "max_failed_attempts" : null,
          },
        });
        failed++;
        continue;
      }

      // Sucesso na CRIAÇÃO do PIX. (Pago só é confirmado via webhook.)
      const acquirerCode = dispatch.acquirerCode ?? "safepix";
      const normalizedProvider = normalizeAcquirerCodeToProvider(acquirerCode);

      // CRITICAL: persiste provider/providerId/QR — webhook precisa pra achar.
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          pixCopyPaste: dispatch.charge.qrCode,
          providerId: dispatch.charge.id,
          provider: normalizedProvider,
        },
      });
      // SURCHARGE em after() (pós-resposta — não atrasa o batch do cron).
      after(async () => {
        try {
          await applyAcquirerSurchargePostDispatch({
            transactionId: tx.id,
            amountCents: sub.amountCents,
            baseFeeCents: split.feeCents,
            acquirerId: dispatch.acquirerId,
            acquirerCode: dispatch.acquirerCode ?? null,
          });
        } catch (e) {
          console.error(
            "[cron/process-subscriptions] surcharge post-dispatch falhou:",
            e,
          );
        }
      });

      // Sucesso: incrementa billings. nextBillingAt/currentPeriodStart já
      // foram avançados no CLAIM atômico acima (período devido, não `now`).
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          billingsCount: { increment: 1 },
          lastTransactionId: tx.id,
          failedAttempts: 0,
          status: "active",
        },
      });
      // UTMify/webhook: renovação recorrente também é uma venda GERADA —
      // dispara waiting_payment igual aos demais caminhos. Faltava: renovações
      // só apareciam na UTMify quando pagas, nunca como geradas. (notify já
      // agenda utmifyScheduledAt como rede de segurança do cron dispatch-utmify.)
      after(() => notifyTransactionCreated(tx.id).catch(() => {}));
      processed++;
    } catch (e) {
      console.error(
        "[cron/process-subscriptions] error processing sub:",
        sub.id,
        e,
      );
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    completed,
    totalDue: due.length,
  });
}
