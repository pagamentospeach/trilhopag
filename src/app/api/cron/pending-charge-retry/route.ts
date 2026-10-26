import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchPixCharge, normalizeAcquirerCodeToProvider } from "@/lib/acquirers";
import { buildPostbackUrl } from "@/lib/security/webhook-secret";
import { ensureValidCustomer } from "@/lib/fake-customer";
import { WHITE_LIMIT_ERROR_CODE } from "@/lib/pix-limits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * RETRY DE CHARGE PENDENTE (07/07/2026 — david): "isso nao pode acontecer
 * NUNCA, nao pode dar failed, tem que gerar em alguma adquirente po, tentar
 * ate gerar".
 *
 * Contexto: se o dispatchPixCharge falha TODAS as adquirentes na 1a chamada
 * (mesmo apos 4 retries internos com backoff), a tx antes virava FAILED e
 * ficava perdida. Agora fica em PENDING com providerPayload.dispatch_pending_
 * since setado, e este cron pega e re-tenta o dispatch em segundos.
 *
 * Estrategia:
 *   - Roda a cada minuto (schedule "* * * * *" no vercel.json)
 *   - Pega tx PENDING criadas nos ultimos 30min, sem providerId (charge
 *     ainda nao gerado), com dispatch_pending_since setado
 *   - Re-tenta dispatchPixCharge (que ja faz seus proprios 4 retries)
 *   - Success → grava provider/providerId/QR e a tx passa a mostrar QR
 *     pro cliente (que faz polling em /api/transactions/[id]/status)
 *   - Failure → incrementa retry_count no providerPayload; a cada retry
 *     falhado dobra o intervalo (backoff exponencial via last_retry_at)
 *   - Apos 10 retries falhados (~20min) → aceita a derrota, seta FAILED
 *     e loga o incidente pro admin investigar
 */

// AGGRESSIVO (08/07/2026, david: "todo pix deve sempre ser gerado, nenhum
// cliente pode ficar pra tras"). Antes: 10 retries em ~20min. Agora: 20
// retries com backoff em segundos (8s primeiro, dobra ate 4min). Isso da
// ~30min total de janela — cobre downtime longo de multipla PSP simultanea
// sem nunca desistir do cliente.
const MAX_RETRIES = 20;
const BATCH_SIZE = 40; // dobra o batch — cron roda a cada min, quer processar mais

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  // Busca tx PENDING criadas nos ultimos 60 min sem providerId. Janela extendida
  // (08/07/2026) porque downtimes prolongados de PSPs (30min+) acontecem — nao
  // vamos abandonar cliente que gerou PIX no minuto errado. Alem disso, os
  // 20 retries com backoff exponencial dao ~30min de tentativas totais.
  const stuck = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      providerId: null,
      createdAt: { gt: new Date(now - 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE * 3, // pega mais e depois filtra por dispatch_pending_since no providerPayload
    include: {
      user: { select: { id: true, name: true, email: true, cpfCnpj: true } },
      product: { select: { id: true, name: true, priceCents: true } },
    },
  });

  let retriedOk = 0;
  let retriedFail = 0;
  let markedFinalFail = 0;

  for (const tx of stuck) {
    const payload = (tx.providerPayload as Record<string, unknown> | null) ?? {};
    const pendingSince =
      typeof payload.dispatch_pending_since === "string"
        ? new Date(payload.dispatch_pending_since as string).getTime()
        : null;
    if (!pendingSince) continue; // nao foi marcada por dispatch failure — ignora

    const retryCount =
      typeof payload.retry_count === "number" ? (payload.retry_count as number) : 0;
    const lastRetryAt =
      typeof payload.last_retry_at === "string"
        ? new Date(payload.last_retry_at as string).getTime()
        : pendingSince;

    // Backoff exponencial AGRESSIVO (08/07/2026): 8s, 16s, 32s, 1min, 2min,
    // 4min (cap). Primeira retry em 8s — se PSP soluçou, ja resolve.
    // O total do backoff acumulado ate MAX_RETRIES=20 fica em ~30min de janela
    // de tentativas. Nao desistir cedo demais.
    const backoffMs = Math.min(8_000 * Math.pow(2, retryCount), 4 * 60_000);
    if (now - lastRetryAt < backoffMs) continue; // ainda esperando backoff

    // FALHA DETERMINISTICA (01/08/2026): tx acima do teto de R$1.000 do modo
    // white. Re-tentar 20x nao muda o valor da tx — so queima cron e ainda
    // abriria AdminNotification de falso positivo no fim. Marca FAILED de
    // cara, SEM notificar o admin (nao e incidente, e regra funcionando).
    if (String(payload.last_error ?? "").includes(WHITE_LIMIT_ERROR_CODE)) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "FAILED",
          providerPayload: {
            ...payload,
            final_fail_at: new Date().toISOString(),
            final_fail_reason: WHITE_LIMIT_ERROR_CODE,
          } as never,
        },
      });
      markedFinalFail++;
      continue;
    }

    if (retryCount >= MAX_RETRIES) {
      // Aceita a derrota apos 20 retries em ~30min sem sucesso. Loga incidente
      // + cria AdminNotification (aparece no alerts bar do admin) pra ele
      // investigar manualmente. NAO deixa cliente sem atendimento silencioso.
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "FAILED",
          providerPayload: {
            ...payload,
            final_fail_at: new Date().toISOString(),
          } as never,
        },
      });
      // Cria notificacao pro admin — evita que a falha vire "PIX perdido
      // silencioso". Aparece no /api/admin/alerts (polling do topo do admin).
      await prisma.adminNotification
        .create({
          data: {
            type: "pix_dispatch_final_fail",
            targetUserId: tx.userId,
            message: `PIX nao gerou apos ${MAX_RETRIES} retries — tx=${tx.id} user=${tx.user.email ?? tx.userId} amount=R$${(tx.amountCents / 100).toFixed(2)}. Ultima falha: ${String(payload.last_error ?? "?").slice(0, 200)}`,
            payload: {
              transaction_id: tx.id,
              user_id: tx.userId,
              amount_cents: tx.amountCents,
              last_error: payload.last_error ?? null,
            } as never,
          },
        })
        .catch((e) => {
          console.error(`[cron/pending-charge-retry] falha ao criar admin notif:`, e);
        });
      console.error(
        `[cron/pending-charge-retry] MAX RETRIES atingido — tx=${tx.id} user=${tx.userId} amount=${tx.amountCents} — investigue`,
      );
      markedFinalFail++;
      continue;
    }

    // Re-tenta o dispatch. Passa o phone original da tx pro ensureValidCustomer
    // — se for esquisito, phoneForProvider vira fake mas o customerPhone salvo
    // no DB nao muda (nao tocamos aqui).
    const customer = ensureValidCustomer({
      name: tx.customerName ?? tx.user.name,
      email: tx.customerEmail ?? tx.user.email,
      cpf: tx.customerCpf ?? tx.user.cpfCnpj,
      phone: tx.customerPhone,
    });
    const cpfDigits = customer.cpf.replace(/\D/g, "");
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";

    try {
      const charge = await dispatchPixCharge({
        userId: tx.userId,
        productId: tx.productId ?? undefined,
        input: {
          amountCents: tx.amountCents,
          postbackUrl: buildPostbackUrl(`${appUrl}/api/webhooks/safepix`, tx.id), // whs específico por tx
          customer: {
            name: customer.name,
            email: customer.email,
            document: {
              number: cpfDigits,
              type: (cpfDigits.length === 14 ? "cnpj" : "cpf") as "cpf" | "cnpj",
            },
            phone: customer.phoneForProvider,
          },
          items: [
            {
              title: tx.product?.name ?? "Cobrança",
              unit_price: tx.amountCents,
              quantity: 1,
              tangible: false,
              external_ref: tx.id,
            },
          ],
          metadata: { transaction_id: tx.id },
        },
      });
      if (charge.ok && charge.charge) {
        const acquirerCode = charge.acquirerCode ?? "safepix";
        const normalizedProvider = normalizeAcquirerCodeToProvider(acquirerCode);
        const cleanPayload = { ...payload };
        delete cleanPayload.dispatch_pending_since;
        delete cleanPayload.last_error;
        delete cleanPayload.retry_count;
        delete cleanPayload.last_retry_at;
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            provider: normalizedProvider,
            providerId: charge.charge.id,
            pixCopyPaste: charge.charge.qrCode,
            pixQrCode: charge.charge.qrCode,
            pixExpiresAt: charge.charge.expiresAt
              ? new Date(charge.charge.expiresAt)
              : null,
            providerPayload: {
              ...cleanPayload,
              acquirer_id: charge.acquirerId,
              retried_by_cron: true,
              retried_at: new Date().toISOString(),
              retry_count_when_ok: retryCount + 1,
            } as never,
          },
        });
        retriedOk++;
        console.log(
          `[cron/pending-charge-retry] OK tx=${tx.id} acquirer=${acquirerCode} apos retry ${retryCount + 1}`,
        );
        continue;
      }
      throw new Error(charge.finalError ?? "dispatch !ok");
    } catch (e) {
      // Falhou de novo — incrementa retry_count.
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          providerPayload: {
            ...payload,
            retry_count: retryCount + 1,
            last_retry_at: new Date().toISOString(),
            last_error: e instanceof Error ? e.message.slice(0, 200) : String(e),
          } as never,
        },
      });
      retriedFail++;
    }
  }

  return NextResponse.json({
    ok: true,
    inspected: stuck.length,
    retriedOk,
    retriedFail,
    markedFinalFail,
  });
}
