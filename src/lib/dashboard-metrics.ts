/**
 * Métricas da dashboard.
 *
 * 06/08/2026 (davi): "Pode tirar isso 100%, nao teremos mais tracker no
 * gateway! nenhuma metrica que tem a ver com ads, gastos em ads tem sentido
 * mais!"
 *
 * Foi embora daqui: gasto_ads, roas, roi, cpa, lucro (era líquido − gasto de
 * ads), imposto_meta_ads, o filtro de conta de anúncio (`adAccount`), o filtro
 * de plataforma de tráfego (`utmSource` + PLATFORM_UTM_ALIASES/TRAFFIC_PLATFORMS)
 * e todo o encanamento que puxava gasto da Meta/TikTok (sumUserAdSpendCents,
 * getAdAccountCampaignMatchers, periodToISORange, txWhereAsync). O best-tracker
 * inteiro (/dashboard/tracking, crons ad-*, OAuth de ad account) foi apagado no
 * mesmo commit.
 *
 * Também sumiram as métricas que NINGUÉM renderizava: desde que a dashboard
 * virou fixa (4 KPIs, sem biblioteca de métricas nem modo de edição), o único
 * consumidor de METRICS é `resolveDashboardMetrics(filters, OVERVIEW_METRIC_KEYS)`.
 * O resto do array era código morto de verdade — não tinha tela pra chamar.
 *
 * Filtros que existem hoje: período, produto, OFERTA (checkout do produto) e
 * BOT (funil de bot que gerou a venda).
 */
import { prisma } from "./prisma";
import { startOfBrtDay, startOfBrtMonth, startOfBrtYear } from "./utils";

/**
 * Os 4 KPIs fixos da home, nesta ordem. O server resolve exatamente estes e
 * nada mais.
 *
 * ⚠️ MORA AQUI, NÃO no dashboard-overview.tsx. Aquele arquivo é `"use client"`,
 * e quando um Server Component importa um valor de um módulo client o Next
 * troca o export por um proxy de referência — o array deixa de ser array no
 * server. Foi exatamente o que derrubou a /dashboard em produção com
 * "OVERVIEW_METRIC_KEYS is not iterable" (06/08/2026). Este módulo é neutro,
 * então os dois lados importam o mesmo array de verdade.
 */
export const OVERVIEW_METRIC_KEYS = [
  "faturamento_liquido",
  "vendas_pagas",
  "arpu",
  "taxa_aprovacao_pix",
] as const;

export type MetricFilters = {
  userId: string;
  /// "today" | "yesterday" | "7d" | "30d" | "90d" | "all" | "month" | "ytd" | "custom"
  period: string;
  /// Data inicial `YYYY-MM-DD` (BRT), inclusiva. Só vale com period === "custom".
  from?: string | null;
  /// Data final `YYYY-MM-DD` (BRT), inclusiva (o dia inteiro entra).
  to?: string | null;
  /// productId — null = qualquer
  productId?: string | null;
  /// Checkout.id ("oferta") — só é oferecido quando um produto está escolhido
  checkoutId?: string | null;
  /// SaleBot.id — casa com Transaction.botFunnelTrace ("botId|chatId")
  botId?: string | null;
};

export type MetricValue = {
  value: string;
  sub?: string;
  subColor?: string;
  available: boolean;
};

export type MetricDef = {
  key: string;
  label: string;
  group: "Geral" | "Vendas" | "Conversão";
  description?: string;
  /// Se o tile tem ícone preferencial (string lucide-react)
  icon?: string;
  /// Se a métrica usa dado disponível hoje
  available: boolean;
  /// função resolve (chamada server-side com prisma)
  resolve: (f: MetricFilters) => Promise<MetricValue>;
};

/* ----------------- Helpers ----------------- */

/** `YYYY-MM-DD` — o formato que o `<input type="date">` devolve. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ⚠️ EXPORTADO desde 08/08/2026 (antes era privado deste módulo).
 *
 * A página de Analytics precisa exatamente da mesma janela que as métricas da
 * home usam. A alternativa era reescrever a tradução de "7d"/"month"/"ytd" lá,
 * e é justamente o tipo de cópia que já mordeu este repo três vezes nesta
 * sessão. Aqui a armadilha seria pior que nas outras: toda a lógica de fuso de
 * Brasília abaixo (o `-03:00` que faz a venda das 21h cair no dia certo) teria
 * que ser reproduzida à mão, e uma divergência silenciosa faria o Analytics
 * mostrar números diferentes da Visão Geral pro MESMO período — sem nenhuma
 * pista de qual dos dois está certo.
 */
export function periodToRange(f: MetricFilters): { since: Date; until?: Date } {
  const now = new Date();
  // Limites de calendário NO FUSO DE BRASÍLIA (UTC-3). Antes usava
  // setHours(0,0,0,0) / new Date(y,m,d) = meia-noite UTC = 21h de Brasília,
  // fazendo o "dia"/"mês"/"ano" do seller virar às 21h. Janelas móveis
  // (7d/30d/90d/all) não dependem de fuso e ficam como estão.
  const startOfDay = startOfBrtDay(now);
  /** Janela padrão. Usada pelo "30d" e por qualquer período que não resolva. */
  const last30 = { since: new Date(now.getTime() - 30 * 24 * 3600 * 1000) };
  switch (f.period) {
    // DATA ESPECÍFICA (06/08/2026, davi). As duas pontas são INCLUSIVAS: o
    // seller que escolhe 01/08 → 01/08 espera o dia 01 inteiro, não uma janela
    // de duração zero. Por isso `until` é a meia-noite do dia SEGUINTE (o
    // `txWhere` usa `lt`).
    //
    // O sufixo "-03:00" é o que amarra a data ao fuso de Brasília: sem ele o
    // Date nasceria em UTC e as vendas das 21h–23h59 caíriam no dia errado —
    // o mesmo bug de fuso que os presets já corrigiam.
    case "custom": {
      // Datas ausentes/malformadas (?from chutado na URL) caem na janela
      // padrão em vez de virar `Invalid Date`, que passaria pro Prisma e
      // estouraria a query inteira.
      if (!f.from || !f.to || !ISO_DATE.test(f.from) || !ISO_DATE.test(f.to)) {
        return last30;
      }
      const since = new Date(`${f.from}T00:00:00.000-03:00`);
      const endDay = new Date(`${f.to}T00:00:00.000-03:00`);
      if (Number.isNaN(since.getTime()) || Number.isNaN(endDay.getTime())) {
        return last30;
      }
      return {
        since,
        until: new Date(endDay.getTime() + 24 * 3600 * 1000),
      };
    }
    case "today":
      return { since: startOfDay };
    case "yesterday": {
      const y = new Date(startOfDay.getTime() - 24 * 3600 * 1000);
      return { since: y, until: startOfDay };
    }
    case "7d":
      return { since: new Date(now.getTime() - 7 * 24 * 3600 * 1000) };
    case "month": {
      const m = startOfBrtMonth(now);
      return { since: m };
    }
    case "ytd": {
      const y = startOfBrtYear(now);
      return { since: y };
    }
    case "90d":
      return { since: new Date(now.getTime() - 90 * 24 * 3600 * 1000) };
    case "all":
      return { since: new Date(0) };
    case "30d":
    default:
      return last30;
  }
}

/** `YYYY-MM-DD` de um instante, lido no fuso de Brasília. */
function brtISODate(d: Date): string {
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * PERÍODO → AS DUAS DATAS QUE ELE REPRESENTA (06/08/2026, davi).
 *
 * "Deixa esse filtro de data especifica sempre aparecendo! assim o seller
 *  consegue ir vendo o dia que pegando, tipo, quando seleciona ali no outro
 *  campo ultimos 7 dias, no outro aparece a data certinho de quando ate quando"
 *
 * O campo de datas passou a viver ao lado do seletor de período MOSTRANDO o
 * recorte, não só editando ele. Pra isso o client precisa saber em que dias
 * "Últimos 7 dias" cai — e essa conta só existe aqui.
 *
 * Reaproveita o MESMO `periodToRange` que monta a query, então o que o seller
 * lê é literalmente a janela consultada. Se um dia o preset mudar, o rótulo
 * muda junto sozinho.
 *
 * Duas conversões pra ponta final: `until` é EXCLUSIVO (o `txWhere` usa `lt`),
 * então o último dia visível é `until - 1 dia`; e período sem `until` é aberto
 * até agora, logo termina hoje.
 */
export function resolvePeriodRange(
  f: MetricFilters,
  accountCreatedAt?: Date | null,
): { from: string; to: string } {
  const r = periodToRange(f);
  const today = brtISODate(new Date());
  // "Tudo" começa no epoch — mostrar 01/01/1970 não diz nada pro seller. A
  // data de criação da conta é o começo real do histórico dele.
  const from =
    f.period === "all"
      ? brtISODate(accountCreatedAt ?? new Date())
      : brtISODate(r.since);
  const to = r.until
    ? brtISODate(new Date(r.until.getTime() - 24 * 3600 * 1000))
    : today;
  // Conta criada hoje com período "tudo" pode inverter as pontas por causa do
  // arredondamento pra dia. Achata em vez de mostrar um intervalo negativo.
  return { from: from > to ? to : from, to };
}

/**
 * Constrói o where pra Transaction. Por padrão filtra por `createdAt`.
 * Quando `dateField="paidAt"` é passado, filtra por `paidAt` — usar nas
 * métricas de PAID pra contabilizar a venda no dia em que foi paga, não
 * no dia em que o Pix foi gerado.
 */
function txWhere(
  f: MetricFilters,
  dateField: "createdAt" | "paidAt" = "createdAt",
): Record<string, unknown> {
  const r = periodToRange(f);
  const where: Record<string, unknown> = {
    userId: f.userId,
    [dateField]: r.until ? { gte: r.since, lt: r.until } : { gte: r.since },
    // IMPORTANTE: exclui transações de teste das métricas do dashboard
    provider: { not: "test" },
    // GATE DE DESVIADAS (05/07/2026, mesmo padrao do fix full-sweep 5bebb02):
    // metrica seller-facing NAO pode contar tx skimadas — o denominador da
    // "taxa de aprovacao pix" inflava com tx desviadas → deletar PENDING
    // parecia nao mexer em nada. Bug reportado no dashboard MATHEUS BIAGE
    // ("continua igual").
    divertedToAcquirer: false,
    divertedToReferrer: false,
  };
  if (f.productId) where.productId = f.productId;
  // Oferta = o checkout que originou a venda. Transaction.checkoutId é
  // indexado, então o recorte por oferta é tão barato quanto o por produto.
  if (f.checkoutId) where.checkoutId = f.checkoutId;
  // Bot: `botFunnelTrace` guarda "botId|chatId" (ver bot-funnel-pix.ts). O
  // prefixo até o "|" identifica o bot — por isso `startsWith` com o pipe,
  // senão um id que é prefixo de outro contaminaria o recorte.
  if (f.botId) where.botFunnelTrace = { startsWith: `${f.botId}|` };
  return where;
}

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* ----------------- Definições ----------------- */

export const METRICS: MetricDef[] = [
  {
    /**
     * O card "Total em vendas" da home.
     *
     * 06/08/2026 (davi): "Erro grave, o total em vendas da dashboard ta
     * aparecendo o faturamento bruto sem as taxas! É para aparecer COM AS
     * TAXAS!"
     *
     * Somava `amountCents` — o que o CLIENTE pagou. Agora soma `netCents` — o
     * que o seller RECEBE, já com a taxa do gateway descontada. Conferido
     * contra a base antes de trocar: em 11.011 vendas pagas dos últimos 30d,
     * `SUM(amountCents) - SUM(feeCents)` bate exatamente com `SUM(netCents)`
     * (R$ 596.950,58) e nenhuma transação tem netCents zerado. Na conta do
     * maior seller o card saía R$ 181.230,89 e passa a sair R$ 166.412,32 —
     * R$ 14.818 de taxa que ele estava contando como receita.
     *
     * A chave mudou de `faturamento_bruto` junto: deixar uma chave chamada
     * "bruto" devolvendo líquido é armadilha pra quem mexer aqui depois. Ela
     * não é persistida em lugar nenhum (só existe no OVERVIEW_METRIC_KEYS e no
     * CARDS do dashboard-overview), então renomear é seguro. O
     * `faturamento_bruto` do /dashboard/divulgador é outra coisa: tem
     * resolvedor próprio naquele arquivo, não passa por aqui, e continua
     * bruto de propósito — lá é o que o divulgador exibe pro público.
     *
     * O bruto não sumiu da tela: o painel "Receita 30 dias", logo abaixo,
     * continua mostrando "R$ X bruto".
     */
    key: "faturamento_liquido",
    label: "Faturamento Líquido",
    group: "Geral",
    icon: "trending-up",
    available: true,
    resolve: async (f) => {
      const agg = await prisma.transaction.aggregate({
        where: { ...txWhere(f, "paidAt"), status: "PAID" },
        _sum: { netCents: true },
        _count: { _all: true },
      });
      return {
        value: fmtBRL(agg._sum.netCents ?? 0),
        sub: `${agg._count._all} venda${agg._count._all !== 1 ? "s" : ""}`,
        available: true,
      };
    },
  },
  {
    key: "vendas_pagas",
    label: "Vendas Pagas",
    group: "Vendas",
    icon: "shopping-bag",
    available: true,
    resolve: async (f) => {
      const n = await prisma.transaction.count({
        where: { ...txWhere(f, "paidAt"), status: "PAID" },
      });
      return { value: String(n), available: true };
    },
  },
  {
    /**
     * 06/08/2026, mesma leva do "Total em vendas" acima: virou líquido também.
     *
     * Não é firula de consistência — o ticket médio é, por definição, o total
     * dividido pelo número de vendas, e os dois cards ficam LADO A LADO na
     * mesma linha. Com o total em líquido e o ticket em bruto, "Total em
     * vendas" ÷ "Vendas pagas" não daria "Ticket médio" e a tela se
     * contradiria sozinha: R$ 596.950,58 / 11.011 = R$ 54,21, mas o card
     * mostraria R$ 59,68 (a média do bruto). Quem confere no papel acha que a
     * dashboard está errada.
     */
    key: "arpu",
    label: "ARPU (ticket médio)",
    group: "Vendas",
    icon: "dollar-sign",
    available: true,
    resolve: async (f) => {
      const agg = await prisma.transaction.aggregate({
        where: { ...txWhere(f, "paidAt"), status: "PAID" },
        _avg: { netCents: true },
      });
      return {
        value: fmtBRL(Math.round(agg._avg.netCents ?? 0)),
        sub: "ticket médio",
        available: true,
      };
    },
  },
  {
    key: "taxa_aprovacao_pix",
    label: "Taxa de Aprovação Pix",
    group: "Conversão",
    icon: "zap",
    available: true,
    resolve: async (f) => {
      const [generated, paid] = await Promise.all([
        prisma.transaction.count({
          where: { ...txWhere(f), method: "PIX" },
        }),
        prisma.transaction.count({
          where: { ...txWhere(f, "paidAt"), method: "PIX", status: "PAID" },
        }),
      ]);
      const pct = generated > 0 ? (paid / generated) * 100 : 0;
      return {
        value: `${pct.toFixed(1)}%`,
        sub: `${paid} de ${generated} Pix`,
        subColor:
          pct >= 50
            ? "text-cyan-300"
            : pct >= 30
              ? "text-yellow-300"
              : "text-zinc-500",
        available: true,
      };
    },
  },
];

/** Resolve TODAS as métricas selecionadas em paralelo. */
export async function resolveDashboardMetrics(
  filters: MetricFilters,
  keys: string[],
): Promise<Record<string, MetricValue>> {
  const wanted = METRICS.filter((m) => keys.includes(m.key));
  const results = await Promise.all(
    wanted.map(async (m) => {
      try {
        const v = await m.resolve(filters);
        return [m.key, v] as const;
      } catch {
        return [
          m.key,
          { value: "—", sub: "Erro", available: m.available } as MetricValue,
        ] as const;
      }
    }),
  );
  return Object.fromEntries(results);
}

/** Lista de produtos do usuário para o filtro. */
export async function listUserProducts(
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const ps = await prisma.product.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return ps;
}

/**
 * 06/08/2026 (davi): "Esse filtro de produtos, quando seleciona um produto em
 * especifico, abre outro campo de filtro de OFERTA".
 *
 * "Oferta" no Trilho é o Checkout — cada produto tem N checkouts (`/slug`),
 * cada um com seu preço próprio (`priceCentsOverride`) pra testar campanha.
 * Não existe coluna `name` no Checkout: a tela de ofertas do produto rotula
 * pelo próprio slug (`/{slug}`), então o dropdown segue a mesma convenção pro
 * seller reconhecer na hora, sem inventar um segundo jeito de nomear.
 *
 * Só devolve algo quando há produto escolhido — sem produto, "oferta" não tem
 * como ser desambiguada (dois produtos podem ter checkouts parecidos).
 */
export async function listProductOffers(
  userId: string,
  productId: string,
): Promise<Array<{ id: string; label: string }>> {
  const cs = await prisma.checkout.findMany({
    // userId no where além do productId: impede que um productId chutado na
    // URL liste checkout de outro seller.
    where: { userId, productId },
    select: { id: true, slug: true, priceCentsOverride: true },
    orderBy: { createdAt: "asc" },
  });
  return cs.map((c) => ({
    id: c.id,
    label:
      c.priceCentsOverride && c.priceCentsOverride > 0
        ? `/${c.slug} · ${fmtBRL(c.priceCentsOverride)}`
        : `/${c.slug}`,
  }));
}

/**
 * 06/08/2026 (davi): "Add um filtro por bot especifico tambem!".
 *
 * Vendas de funil de bot carregam `Transaction.botFunnelTrace = "botId|chatId"`.
 * Lista os bots do seller pro dropdown; o recorte em si é o `startsWith` do
 * txWhere.
 *
 * Só entram bots QUE TÊM FUNIL. Bot de categoria "sales" (o que só avisa venda
 * no Telegram/Discord) nunca aparece em botFunnelTrace — se ele estivesse no
 * dropdown, escolher ele zeraria os 4 KPIs e o seller ia achar que sumiram as
 * vendas dele.
 */
export async function listUserBots(
  userId: string,
): Promise<Array<{ id: string; name: string; type: string }>> {
  const bots = await prisma.saleBot.findMany({
    where: { userId, funnels: { some: {} } },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
  return bots;
}
