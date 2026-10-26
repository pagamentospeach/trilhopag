import { prisma } from "./prisma";

/**
 * Números de um produto (seção 8 do prompt de revamp: "Mostrar métricas:
 * faturamento, vendas, ticket médio, conversão, assinaturas ativas").
 *
 * Até aqui a área de Produtos não tinha UM ÚNICO valor em reais. O único
 * número por produto era a contagem de transações no card da lista — o seller
 * sabia que vendeu 40 vezes e não sabia quanto isso deu.
 *
 * ⚠️ O MESMO FILTRO DE VISIBILIDADE DO RESTO DO PAINEL.
 *
 * Faturamento por produto é onde o desvio mais teria como aparecer: se este
 * total somasse as vendas desviadas, ele não bateria com o extrato nem com o
 * Analytics, e a diferença denunciaria que existe venda escondida. As quatro
 * condições são as mesmas de lib/analytics.ts e do detalhe do cliente.
 *
 * SEM RECORTE DE PERÍODO, de propósito: aqui a pergunta é "quanto este produto
 * já me deu", que é vitalícia. Quem quer o recorte por período tem o Analytics,
 * que filtra e compara. Dois lugares com a mesma métrica e janelas diferentes
 * é como se cria a dúvida de qual dos dois está certo.
 */
export async function getProductMetrics(userId: string, productId: string) {
  const visivel = {
    userId,
    productId,
    provider: { not: "test" as const },
    divertedToAcquirer: false,
    divertedToReferrer: false,
    sellerNotifiedAt: { not: null },
  };

  const [pagas, geradas, assinaturas, visitas] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...visivel, status: "PAID" },
      _sum: { amountCents: true, netCents: true },
      _count: { _all: true },
    }),
    // Denominador da aprovação: tudo que foi criado pra este produto.
    prisma.transaction.count({ where: visivel }),
    prisma.subscription.count({
      where: { userId, productId, status: "active" },
    }),
    // Visitas dos checkouts DESTE produto. `checkout.productId` e não
    // `checkout.userId`, senão contaria a loja inteira e a conversão sairia
    // ridiculamente baixa pra todo produto.
    prisma.checkoutVisit.count({
      where: { checkout: { productId, userId } },
    }),
  ]);

  const faturamentoCents = pagas._sum.amountCents ?? 0;
  const vendas = pagas._count._all;

  return {
    faturamentoCents,
    liquidoCents: pagas._sum.netCents ?? 0,
    vendas,
    ticketMedioCents: vendas > 0 ? Math.round(faturamentoCents / vendas) : 0,
    // `null` e não 0 quando não houve tentativa nenhuma: "0% aprovou" e
    // "ninguém tentou" são coisas diferentes, e a tela mostra travessão pro
    // segundo caso.
    aprovacaoPct: geradas > 0 ? (vendas / geradas) * 100 : null,
    conversaoPct: visitas > 0 ? (vendas / visitas) * 100 : null,
    visitas,
    assinaturasAtivas: assinaturas,
  };
}
