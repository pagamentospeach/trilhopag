import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { getEffectiveUserId } from "@/lib/effective-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Polling do widget "Vendas ao vivo" (home do dashboard), a cada 8s.
 *
 * O SEED inicial do MESMO widget vem do server component em
 * /dashboard/page.tsx (`initialFeed`). Os dois precisam usar o MESMO filtro —
 * senao a venda pisca no polling e some no primeiro reload.
 */
export async function GET(request: Request) {
  await requireSession();
  // 03/08/2026 (davi: "seller falando que caia venda aprovada no vendas ao
  // vivo dela mas n pingava na aba vendas e no saldo").
  //
  // Usava session.user.id (conta ORIGINAL logada) em vez do effectiveUserId
  // (sub-conta ativa via ACTIVE_ACCOUNT_COOKIE). Dentro de uma sub-conta a aba
  // /vendas usa requireUserId() → effective, mas este feed devolvia as vendas
  // do PAI: a venda aparecia no "ao vivo" e nao existia na aba. Mesmo fix que
  // o toast-feed levou em 27/07 e que este endpoint nao recebeu.
  const userId = await getEffectiveUserId();
  if (!userId) {
    return NextResponse.json({
      events: [],
      server_time: new Date().toISOString(),
    });
  }
  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 60 * 60 * 1000);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      status: "PAID",
      paidAt: { gt: sinceDate },
      // CRITICAL (02/07): filtrar tx desviadas — Paulo reclamou de "venda
      // aprovada aparece no feed mas nao vira saldo disponivel". Bug era
      // esse endpoint: nao gated por divertedTo*. Todas as outras views
      // seller-facing ja filtram; o feed vazava. Paulo com skim 30% via
      // R$80,27 piscando aqui, ficava esperando o saldo subir, nao subia.
      divertedToAcquirer: false,
      divertedToReferrer: false,
      // ====== GATE QUE FALTAVA (03/08/2026) ======
      // O cron release-paid-to-seller declara a invariante: "SELLER NAO ve a
      // tx (filtro sellerNotifiedAt IS NOT NULL em TODAS as views
      // seller-facing)". Este endpoint era o unico sem — o divertedTo* de
      // 02/07 tratou o sintoma, nao a corrida.
      //
      // markTransactionPaid grava status=PAID num updateMany LOGO NO INICIO e
      // so DEPOIS roda o sorteio de desvio (skim); o sellerNotifiedAt e
      // escrito por ULTIMO. Entre um e outro tem findUniqueOrThrow, hook de
      // A/B test, lookup de referrer, credito de saldo e calculo de retencao —
      // facil passar de 1s sob carga. Nessa fresta a tx esta PAID, com
      // divertedTo* AINDA false e sellerNotifiedAt null: passa direto pelo
      // filtro acima.
      //
      // Com polling de 8s e 1940 sellers com webhookDeviationPercent > 0, o
      // feed pegava a tx nessa janela. Se o sorteio desse HIT logo em seguida,
      // ela virava desviada: sumia do proprio feed, nunca aparecia na aba
      // /vendas e nunca creditava saldo. E exatamente o relato.
      //
      // Como o sellerNotifiedAt so e escrito depois do sorteio ja ter gravado
      // a flag, gatear por ele fecha a corrida na raiz.
      sellerNotifiedAt: { not: null },
      // Alinha com o seed SSR do widget (dashboard/page.tsx), que ja filtra.
      provider: { not: "test" },
    },
    orderBy: { paidAt: "desc" },
    take: 20,
    // EGRESS: feed é pollado a cada 8s por dashboard aberto. Selecionar só os
    // campos usados evita transferir o providerPayload (~4-6 KB) e demais
    // colunas a cada venda nova. Antes puxava a linha inteira.
    select: {
      id: true,
      amountCents: true,
      netCents: true,
      customerName: true,
      method: true,
      paidAt: true,
      product: { select: { name: true } },
    },
  });

  return NextResponse.json({
    events: transactions.map((t) => ({
      id: t.id,
      amount_cents: t.amountCents,
      net_cents: t.netCents,
      product: t.product.name,
      customer_name: t.customerName,
      method: t.method,
      paid_at: t.paidAt?.toISOString(),
    })),
    server_time: new Date().toISOString(),
  });
}
