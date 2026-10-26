import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
// 08/08/2026: o `where` de visibilidade e o mapeamento dos ~35 campos saíram
// daqui pro módulo compartilhado — a rota de paginação usava cópias à mão dos
// dois e já tinha divergido. Ver lib/vendas-query.ts.
import {
  VENDAS_INCLUDE,
  entradasVisiveis,
  serializeTx,
} from "@/lib/vendas-query";
import { requireUserId } from "@/lib/auth-helpers";
import { EmptyState } from "@/components/empty-state";
import { parseEmvMerchantName } from "@/lib/pix-emv";
import { MIN_WITHDRAWAL_CENTS } from "@/lib/withdrawals";
import { getSellerBalanceBuckets } from "@/lib/holding-release";
import { VendasClient } from "../vendas/client";
import { FinanceiroHero } from "../saques/financeiro-hero";
import { AutoWithdrawConfig } from "../saques/auto-withdraw-config";
import { ReleaseCalendar } from "../saques/release-calendar";
import { HistoryList } from "../saques/history-list";
import { FinanceiroTabs } from "./tabs";

/**
 * FINANCEIRO UNIFICADO (06/08/2026, davi).
 *
 * "Junte a aba VENDAS e FINANCEIRO (entradas e saidas) em uma aba so
 *  (financeiro) mas sem perder nenhuma funcao / filtro que tem na aba vendas!"
 *
 * Esta página é a fusão de /dashboard/vendas + /dashboard/saques. As duas
 * rotas antigas viraram redirect pra cá.
 *
 * COMO A GARANTIA DE "NÃO PERDER NADA" FOI FEITA: nada foi reescrito. Os
 * componentes originais são importados e montados do jeito que já eram —
 * VendasClient inteiro em Entradas (todos os filtros: status, método, período
 * + calendário custom, produto, oferta, busca livre, só-comprovantes, limpar
 * filtros, resumo A/B, paginação "ver mais 50", modal de detalhe com as 3 abas
 * e o editor de template do WhatsApp) e o trio Saques em Saídas (auto-saque,
 * calendário de liberação, histórico com filtro/busca/paginação). Se algum
 * filtro sumir daqui, sumiu do componente — não da fusão.
 *
 * Os dois lados carregam no MESMO request: o seller troca de aba sem round-trip
 * e sem perder o filtro que já tinha aplicado (o Tabs esconde em vez de
 * desmontar). As duas queries já rodavam antes em páginas separadas, então o
 * custo é o mesmo — só ficou paralelo.
 */

// Herdado de /dashboard/saques: a server action requestWithdrawal (PIX AUTO)
// lê saldo das contas SafePix em paralelo + chama API de transferência.
export const maxDuration = 60;

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  const userId = await requireUserId();
  const { highlight } = await searchParams;

  const [
    // ===== ENTRADAS (ex-/dashboard/vendas) =====
    transactions,
    checkouts,
    allProducts,
    // ===== SAÍDAS (ex-/dashboard/saques) =====
    user,
    withdrawals,
    destinations,
    buckets,
    paidAggregate,
  ] = await Promise.all([
    // Pega 51 pra saber se ha MAIS que 50 (hasMore). Ordena por createdAt
    // + id (tiebreaker) — mesma ordem que a API /api/dashboard/vendas-more
    // usa no cursor. Determinismo total pra paginacao.
    prisma.transaction.findMany({
      where: entradasVisiveis(userId),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      include: VENDAS_INCLUDE,
    }),
    // 29/07/2026 (davi 'filtro por produto + oferta'): busca TODOS os
    // checkouts ativos do seller (ate 300) pra popular o dropdown do
    // filtro 'Oferta'. Antes limitava a 10 (usado so pra EmptyState CTA).
    prisma.checkout.findMany({
      where: { userId, active: true },
      select: {
        id: true,
        slug: true,
        productId: true,
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    // Todos os produtos ativos do seller (exceto ghost API defaults) —
    // popula o dropdown do filtro 'Produto'.
    prisma.product.findMany({
      where: {
        userId,
        active: true,
        NOT: { slug: { startsWith: "__api_default_" } },
      },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappQuickTemplate: true,
        withdrawalFeeCents: true,
        // 08/08/2026: o saque passou a EXIGIR o segundo fator quando o seller
        // ligou (antes o painel prometia e a action nunca checava). Isto aqui
        // so decide se o campo aparece na revisao; quem valida e a action.
        twoFactorEnabled: true,
        scheduledWithdrawEnabled: true,
        scheduledWithdrawThresholdCents: true,
        scheduledWithdrawDestId: true,
      },
    }),
    // 17/07/2026 (davi: "so puxa ate 50 saques, tira isso, ele deve puxar
    // TODOS sempre... Total pago: x - deve sempre aparecer INTEIRO de tudo que
    // o seller ja sacou"): sem `take` → histórico completo (o client pagina
    // localmente em 25/página + filtra + busca).
    prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payoutDestination.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    getSellerBalanceBuckets(userId),
    // `paidAggregate` SEMPRE representa o total lifetime — vem de sum() no DB,
    // independente do que está carregado no cliente. Fonte da verdade pra
    // "Total pago: X" no header do histórico.
    prisma.withdrawal.aggregate({
      where: { userId, status: "PAID" },
      _sum: { amountCents: true },
    }),
  ]);

  const totalPaidCents = paidAggregate._sum.amountCents ?? 0;
  const withdrawalFee = user?.withdrawalFeeCents ?? 990;
  const totalPending =
    buckets.pendingPixCents +
    buckets.pendingCardCents +
    buckets.retainedCardCents;

  /**
   * A transação apontada pelo `?highlight=` do push, quando ela não está nas
   * 50 primeiras.
   *
   * O push de venda paga leva o seller direto pra venda que acabou de cair.
   * Nas 50 mais recentes ela quase sempre está — mas "quase sempre" abre um
   * caso feio: quem vende muito abre a notificação e cai numa lista onde a
   * venda não existe, sem explicação. Uma consulta a mais, só quando há
   * highlight e só quando ela faltou.
   *
   * O `where` é o MESMO das entradas, por isso a constante: um id de
   * transação desviada colado na URL não pode virar uma janela pro que o
   * seller não deveria ver.
   */
  const primeiras = transactions.slice(0, 50);
  const destacadaFaltando =
    highlight && !primeiras.some((t) => t.id === highlight)
      ? await prisma.transaction.findFirst({
          where: { ...entradasVisiveis(userId), id: highlight },
          include: VENDAS_INCLUDE,
        })
      : null;

  // Entra no fim da lista pra não bagunçar a ordem cronológica do topo; quem
  // abre o modal é o cliente, não a posição na tabela.
  const visiveis = destacadaFaltando
    ? [...primeiras, destacadaFaltando]
    : primeiras;

  const entradas =
    transactions.length === 0 ? (
      <EmptyState
        title="Nenhuma venda registrada ainda"
        description="Crie um produto e adicione um checkout pra começar a vender."
        cta={
          checkouts.length === 0
            ? { label: "Criar produto / checkout", href: "/dashboard/produtos" }
            : undefined
        }
      />
    ) : (
      <VendasClient
        whatsappTemplate={user?.whatsappQuickTemplate ?? null}
        highlightId={highlight ?? null}
        hasMore={transactions.length > 50}
        initialCursor={
          transactions.length > 50 ? (transactions[49]?.id ?? null) : null
        }
        products={allProducts.map((p) => ({ id: p.id, name: p.name }))}
        checkouts={checkouts.map((c) => ({
          id: c.id,
          slug: c.slug,
          productId: c.productId,
          productName: c.product.name,
        }))}
        transactions={visiveis.map(serializeTx)}
      />
    );

  const saidas = (
    <div className="space-y-5">
      {/* Auto-saque programado (accordion no próprio component) */}
      <AutoWithdrawConfig
        enabled={user?.scheduledWithdrawEnabled ?? false}
        thresholdCents={user?.scheduledWithdrawThresholdCents ?? 0}
        destId={user?.scheduledWithdrawDestId ?? null}
        pixDestinations={destinations
          .filter((d) => d.type === "pix")
          .map((d) => ({ id: d.id, label: d.label, pixKey: d.pixKey }))}
        minWithdrawalCents={MIN_WITHDRAWAL_CENTS}
      />

      {/* Calendário de liberações (só mostra se tiver algo agendado) */}
      {buckets.upcomingReleases.length > 0 && (
        <ReleaseCalendar releases={buckets.upcomingReleases} />
      )}

      {/* Histórico (cards com filtro + busca + paginação local). */}
      <HistoryList
        totalPaidCents={totalPaidCents}
        items={withdrawals.map((w) => ({
          id: w.id,
          status: w.status,
          amountCents: w.amountCents,
          feeCents: w.feeCents,
          method: w.method,
          pixKey: w.pixKey,
          pixKeyType: w.pixKeyType,
          walletAddress: w.walletAddress ?? null,
          createdAt: w.createdAt.toISOString(),
          failReason: w.failReason ?? null,
        }))}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Financeiro
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Tudo que entra e tudo que sai: vendas, saldo e saques.
        </p>
      </header>

      {/* Saldo grande + CTA "Sacar agora" + buckets — fica ACIMA do toggle,
          visível dos dois lados (é o número que o seller vem ver). */}
      <FinanceiroHero
        twoFactorEnabled={user?.twoFactorEnabled ?? false}
        availableCents={buckets.availableCents}
        pendingPixCents={buckets.pendingPixCents}
        pendingCardCents={buckets.pendingCardCents}
        retainedCardCents={buckets.retainedCardCents}
        totalPendingCents={totalPending}
        pixFeeCents={withdrawalFee}
        destinations={destinations.map((d) => ({
          id: d.id,
          type: d.type as "pix" | "usdt_solana",
          label: d.label,
          pixKey: d.pixKey,
          pixKeyType: d.pixKeyType,
          walletAddress: d.walletAddress,
          isDefault: d.isDefault,
        }))}
      />

      {/* useSearchParams (?tab=saidas) exige Suspense boundary no App Router. */}
      <Suspense fallback={null}>
        <FinanceiroTabs
        entradas={entradas}
        saidas={saidas}
      />
      </Suspense>
    </div>
  );
}
