import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { periodToRange, type MetricFilters } from "./dashboard-metrics";

/**
 * AGREGAÇÕES DA PÁGINA DE ANALYTICS (seção 12 do prompt de revamp).
 *
 * Tudo aqui sai de `Transaction`, `CheckoutVisit` e `Subscription`, que já
 * existem e já são populados. Nenhum model novo, nenhuma migration, nenhum
 * número inventado: métrica sem dado por trás não entra na tela — aparece como
 * ausente, o que é uma informação honesta.
 *
 * ── A JANELA VEM DO MESMO LUGAR QUE A DA HOME ────────────────────────────
 *
 * `periodToRange` foi exportado do dashboard-metrics pra isto. Reescrever a
 * tradução de período aqui significaria reescrever também a aritmética de fuso
 * de Brasília, e uma divergência faria Analytics e Visão Geral mostrarem
 * números diferentes pro mesmo "Últimos 7 dias" — o pior tipo de bug de
 * relatório, porque os dois parecem certos.
 *
 * ── O FILTRO DE VISIBILIDADE VALE AQUI TAMBÉM ────────────────────────────
 *
 * Relatório é onde o desvio mais teria como vazar: um total que não bate com a
 * soma do extrato denuncia que existe venda escondida. Todas as agregações
 * abaixo carregam as mesmas quatro condições do resto do painel.
 *
 * ── SOBRE `paidAt` vs `createdAt` ────────────────────────────────────────
 *
 * Faturamento é cortado por `paidAt`: a venda conta no dia em que o dinheiro
 * entrou, não no dia em que o PIX foi gerado. Já a taxa de aprovação é cortada
 * por `createdAt` nos dois lados — gerados e pagos —, senão o numerador e o
 * denominador falariam de conjuntos diferentes e a taxa passaria de 100% num
 * dia que herdou pagamento da véspera.
 */

/** As quatro condições que definem o que o seller pode ver. */
function visivel(userId: string) {
  return {
    userId,
    provider: { not: "test" },
    divertedToAcquirer: false,
    divertedToReferrer: false,
    sellerNotifiedAt: { not: null },
  };
}

export type AnalyticsData = {
  /** Janela efetivamente consultada, pra tela poder mostrar. */
  range: { since: Date; until: Date | null };
  faturamentoCents: number;
  liquidoCents: number;
  vendasPagas: number;
  ticketMedioCents: number;
  /** null quando não houve nenhuma cobrança criada no período. */
  aprovacaoPct: number | null;
  geradas: number;
  reembolsos: { count: number; cents: number };
  chargebacks: { count: number; cents: number };
  /** null quando não há registro de visita no período. */
  conversaoPct: number | null;
  visitas: number;
  metodos: Array<{ metodo: string; cents: number; count: number }>;
  status: Array<{ status: string; count: number }>;
  topProdutos: Array<{ nome: string; cents: number; count: number }>;
  /** Faturamento por dia, já no fuso de Brasília. */
  serie: Array<{ dia: string; cents: number }>;
  assinaturasAtivas: number;
  mrrCents: number;
};

export async function getAnalytics(f: MetricFilters): Promise<AnalyticsData> {
  const { userId } = f;
  const { since, until } = periodToRange(f);
  const base = visivel(userId);

  // `lt` e não `lte` no fim: `until` é exclusivo por convenção do periodToRange
  // (o dia final já vem somado de 24h).
  const janelaPaga = { paidAt: { gte: since, ...(until ? { lt: until } : {}) } };
  const janelaCriada = {
    createdAt: { gte: since, ...(until ? { lt: until } : {}) },
  };

  const [
    pagas,
    geradas,
    reembolsos,
    chargebacks,
    metodos,
    statusGrupos,
    topProdutosRaw,
    serieRaw,
    assinaturas,
    visitas,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...base, status: "PAID", ...janelaPaga },
      _sum: { amountCents: true, netCents: true },
      _count: { _all: true },
    }),
    // Denominador da aprovação: tudo que foi CRIADO na janela, pago ou não.
    prisma.transaction.count({ where: { ...base, ...janelaCriada } }),
    prisma.transaction.aggregate({
      where: { ...base, status: "REFUNDED", ...janelaCriada },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: { ...base, status: "CHARGEBACK", ...janelaCriada },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["method"],
      where: { ...base, status: "PAID", ...janelaPaga },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["status"],
      where: { ...base, ...janelaCriada },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["productId"],
      where: { ...base, status: "PAID", ...janelaPaga },
      _sum: { amountCents: true },
      _count: { _all: true },
      orderBy: { _sum: { amountCents: "desc" } },
      take: 5,
    }),
    // Série por dia. Feita em SQL e não em JS porque a alternativa seria
    // trazer TODA transação paga do período só pra agrupar por data no
    // servidor — cresce sem teto conforme o seller vende.
    //
    // `AT TIME ZONE`: o Postgres guarda em UTC e o corte de dia tem que ser o
    // de Brasília, senão a venda das 22h aparece no gráfico no dia seguinte.
    // `Prisma.sql` + `Prisma.empty` pra montar o pedaço condicional. Template
    // literal cru não compõe: interpolar o resultado de outro `$queryRaw` viria
    // como PARÂMETRO, não como SQL, e o Postgres receberia um placeholder onde
    // esperava uma cláusula. Todos os valores continuam parametrizados, então
    // não há concatenação de string com dado de usuário.
    prisma.$queryRaw<Array<{ dia: Date; cents: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "paidAt" AT TIME ZONE 'America/Sao_Paulo') AS dia,
             SUM("amountCents")::bigint AS cents
      FROM "Transaction"
      WHERE "userId" = ${userId}
        AND "status" = 'PAID'
        AND "provider" <> 'test'
        AND "divertedToAcquirer" = false
        AND "divertedToReferrer" = false
        AND "sellerNotifiedAt" IS NOT NULL
        AND "paidAt" >= ${since}
        ${until ? Prisma.sql`AND "paidAt" < ${until}` : Prisma.empty}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
    prisma.subscription.findMany({
      where: { userId, status: "active" },
      select: { amountCents: true, interval: true },
    }),
    prisma.checkoutVisit.count({
      where: { checkout: { userId }, ...janelaCriada },
    }),
  ]);

  const faturamentoCents = pagas._sum.amountCents ?? 0;
  const vendasPagas = pagas._count._all;

  const produtos = await prisma.product.findMany({
    where: { id: { in: topProdutosRaw.map((t) => t.productId) } },
    select: { id: true, name: true },
  });
  const nomePorId = new Map(produtos.map((p) => [p.id, p.name]));

  return {
    range: { since, until: until ?? null },
    faturamentoCents,
    liquidoCents: pagas._sum.netCents ?? 0,
    vendasPagas,
    ticketMedioCents:
      vendasPagas > 0 ? Math.round(faturamentoCents / vendasPagas) : 0,
    // null e não 0: "nenhuma cobrança criada" é diferente de "0% aprovou".
    // A tela mostra travessão num caso e o número no outro.
    aprovacaoPct: geradas > 0 ? (vendasPagas / geradas) * 100 : null,
    geradas,
    reembolsos: {
      count: reembolsos._count._all,
      cents: reembolsos._sum.amountCents ?? 0,
    },
    chargebacks: {
      count: chargebacks._count._all,
      cents: chargebacks._sum.amountCents ?? 0,
    },
    conversaoPct: visitas > 0 ? (vendasPagas / visitas) * 100 : null,
    visitas,
    metodos: metodos
      .map((m) => ({
        metodo: m.method,
        cents: m._sum.amountCents ?? 0,
        count: m._count._all,
      }))
      .sort((a, b) => b.cents - a.cents),
    status: statusGrupos
      .map((s) => ({ status: s.status, count: s._count._all }))
      .sort((a, b) => b.count - a.count),
    topProdutos: topProdutosRaw.map((t) => ({
      nome: nomePorId.get(t.productId) ?? "Produto removido",
      cents: t._sum.amountCents ?? 0,
      count: t._count._all,
    })),
    serie: serieRaw.map((r) => ({
      dia: new Date(r.dia).toISOString().slice(0, 10),
      // O SUM do Postgres volta bigint; JSON não serializa bigint.
      cents: Number(r.cents),
    })),
    assinaturasAtivas: assinaturas.length,
    mrrCents: Math.round(
      assinaturas.reduce((acc, s) => acc + mensalizar(s.amountCents, s.interval), 0),
    ),
  };
}

/** Dias médios de um mês, pra normalizar ciclos que não são mensais. */
const DIAS_MES = 30.44;

/**
 * Valor do ciclo → valor mensal equivalente.
 *
 * Mesma conta de /dashboard/assinaturas. Somar `amountCents` cru numa base com
 * ciclos misturados daria um número que não é receita de mês nenhum.
 */
function mensalizar(amountCents: number, interval: string): number {
  switch (interval) {
    case "weekly":
      return (amountCents * 52) / 12;
    case "monthly":
      return amountCents;
    case "quarterly":
      return amountCents / 3;
    case "yearly":
      return amountCents / 12;
    default: {
      const m = interval.match(/^days:(\d+)$/);
      const dias = m ? Number(m[1]) : null;
      return dias && dias > 0 ? (amountCents * DIAS_MES) / dias : amountCents;
    }
  }
}
