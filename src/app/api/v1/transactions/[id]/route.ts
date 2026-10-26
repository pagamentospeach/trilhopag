import { NextResponse } from "next/server";
import { withApiLog } from "@/lib/api-log";
import { prisma } from "@/lib/prisma";
import { authenticate, errorResponse, requireScope } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/* ============================================================
 * GET /api/v1/transactions/{id} — consulta uma transação por ID.
 *
 * Autenticada SÓ via API key (Bearer). NÃO precisa de produto. Usada pelo
 * seller pra fazer polling do status depois de criar a cobrança PIX/cartão.
 *
 * Aplica os MESMOS filtros de visibilidade da listagem (GET /transactions):
 *  - esconde tx desviadas (divertedToAcquirer/divertedToReferrer) — o desvio
 *    é 100% invisível na API pública;
 *  - esconde FAILED (erro de dispatcher, não é venda);
 *  - na janela de 60s, PAID só aparece depois de sellerNotifiedAt.
 * Se não passar nos filtros → 404 (como se não existisse).
 * ============================================================ */
async function GET_handler(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { record, response } = await authenticate(request);
  if (!record) return response!;

  // Gate de escopo (09/08/2026). Permissivo pra chave com `scopes` vazio,
  // que e o caso de TODAS as chaves emitidas ate hoje — nada quebra pra
  // quem ja integra. So recusa quando a chave foi criada escolhendo
  // escopos e este nao esta entre eles. Ver lib/api-scopes.ts.
  const scopeDenied = requireScope(record, "transactions");
  if (scopeDenied) return scopeDenied;

  const { id } = await ctx.params;
  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    return errorResponse(400, "invalid_id", "Transaction id is malformed");
  }

  const t = await prisma.transaction.findFirst({
    where: {
      id,
      userId: record.userId,
      divertedToAcquirer: false,
      divertedToReferrer: false,
      status: { not: "FAILED" },
      OR: [{ status: { not: "PAID" } }, { sellerNotifiedAt: { not: null } }],
    },
  });
  if (!t) {
    return errorResponse(
      404,
      "transaction_not_found",
      "No transaction with this id belongs to your account",
    );
  }

  // pix_status suporta o fluxo "PIX sempre gera" (08/07/2026): quando dispatch
  // falha na 1a tentativa, tx fica PENDING sem copy_paste e o cron
  // pending-charge-retry retenta. Seller pode fazer polling aqui ate ver
  // pix_status="ready" pra saber quando o QR ficou disponivel.
  const pixStatus =
    t.status === "PAID"
      ? "paid"
      : t.status === "EXPIRED"
        ? "expired"
        : t.method === "PIX" && t.pixCopyPaste
          ? "ready"
          : "generating";

  return NextResponse.json({
    id: t.id,
    object: "transaction",
    product_id: t.productId,
    checkout_id: t.checkoutId,
    customer: {
      email: t.customerEmail,
      name: t.customerName,
      cpf: t.customerCpf,
      phone: t.customerPhone,
    },
    amount_cents: t.amountCents,
    fee_cents: t.feeCents,
    net_cents: t.netCents,
    currency: t.currency,
    method: t.method,
    status: t.status,
    pix_status: pixStatus,
    // provider e provider_id REMOVIDOS 18/07/2026 (davi): PSP interno
    // NUNCA vaza pro seller. Todo PIX é da Trilho do ponto de vista dele.
    pix:
      t.method === "PIX"
        ? {
            qr_code: t.pixQrCode,
            copy_paste: t.pixCopyPaste,
            expires_at: t.pixExpiresAt?.toISOString() ?? null,
          }
        : null,
    card:
      t.method === "CARD"
        ? {
            last4: t.cardLast4,
            brand: t.cardBrand,
            installments: t.installments,
          }
        : null,
    tracking: {
      utm_source: t.utmSource,
      utm_medium: t.utmMedium,
      utm_campaign: t.utmCampaign,
      utm_content: t.utmContent,
      utm_term: t.utmTerm,
      fbclid: t.fbclid,
      ttclid: t.ttclid,
      gclid: t.gclid,
    },
    external_reference:
      ((t.providerPayload as Record<string, unknown> | null)?.[
        "external_reference"
      ] as string | undefined) ?? null,
    metadata: (() => {
      const m = (t.providerPayload as Record<string, unknown> | null)?.[
        "metadata"
      ];
      return m && typeof m === "object" ? m : null;
    })(),
    paid_at: t.paidAt?.toISOString() ?? null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  });
}

// 09/08/2026: log de requisicao (secao 13). O wrapper NAO bloqueia a
// resposta — a gravacao vai em after(). Ver lib/api-log.ts.
export const GET = withApiLog(GET_handler);
