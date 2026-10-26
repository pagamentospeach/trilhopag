import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { requireUserId } from "@/lib/auth-helpers";
import { getDashboardMetrics } from "@/lib/metrics";
import {
  resolveDashboardMetrics,
  resolvePeriodRange,
  listUserProducts,
  listProductOffers,
  listUserBots,
  OVERVIEW_METRIC_KEYS,
} from "@/lib/dashboard-metrics";
import { brtHour, formatBRL } from "@/lib/utils";
import { getUserSettings } from "@/lib/user-settings";
import { prisma } from "@/lib/prisma";
import { SellerWarningsBanner } from "./seller-warnings-banner";
import { RevenueChart } from "@/components/dashboard/revenue-chart-lazy";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { MobileHome } from "@/components/dashboard/mobile-home";
import { getTranslations } from "next-intl/server";

/**
 * RESUMO (06/08/2026, davi): "vamos deixar a dashboard mais simples - copie
 * essa do print, tira TODAS as opcoes de editar, nao vai ter mais isso!"
 *
 * Foi embora: CustomizableDashboard (grid arrastável/redimensionável, modo de
 * edição, biblioteca de métricas, salvar/desfazer/resetar), o layout por seller
 * em UserSettings.dashboardLayout, o GoalTracker, a AchievementsStrip e o
 * AdsOverview — nenhum deles está no print.
 *
 * Ficou o que o print mostra: filtros, 4 KPIs, gráfico de receita e vendas ao
 * vivo. Layout igual pra todo seller.
 */

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;

  // Avisos do admin pra este seller (aparecem no topo da dashboard).
  const sellerWarnings = await prisma.sellerWarning.findMany({
    where: { userId, active: true },
    select: { id: true, message: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const productId = sp.prod || null;
  const period = sp.period ?? "today";
  const filters = {
    userId,
    period,
    productId,
    // Oferta só vale acompanhada de produto — o dropdown de ofertas nem é
    // montado sem produto, então um ?of solto na URL é ignorado de propósito.
    checkoutId: productId ? sp.of || null : null,
    botId: sp.bot || null,
    // Data específica (davi 06/08): ?from/?to só valem no período "custom".
    // Fora dele são ignorados — assim um intervalo esquecido na URL não
    // sequestra silenciosamente um preset. A validação do formato mora no
    // periodToRange.
    from: period === "custom" ? sp.from || null : null,
    to: period === "custom" ? sp.to || null : null,
  };

  const [
    m,
    settings,
    account,
    recentSales,
    products,
    offers,
    bots,
    values,
  ] = await Promise.all([
      getDashboardMetrics(userId),
      getUserSettings(userId),
      // Nome da CONTA — o displayName do UserSettings é opcional e fica nulo
      // pra quem nunca abriu /dashboard/perfil (ver bug da saudação abaixo).
      prisma.user.findUnique({
        where: { id: userId },
        // `createdAt` entra por causa do período "Tudo": ele começa no epoch,
        // e 01/01/1970 no campo de datas não diz nada. O começo real do
        // histórico do seller é o dia em que ele abriu a conta.
        // `balanceCents` entra por causa do cartao de saldo da home no
        // celular. Coluna a mais na consulta que ja existia — nao e query nova.
        select: {
          name: true,
          email: true,
          createdAt: true,
          balanceCents: true,
          // Decide se o atalho "Nova cobrança" existe: /dashboard/cobrancas
          // só vale no modo black (mesma regra da sidebar).
          pixOpsMode: true,
        },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          provider: { not: "test" },
          status: "PAID",
          divertedToAcquirer: false,
          divertedToReferrer: false,
          sellerNotifiedAt: { not: null },
        },
        orderBy: { paidAt: "desc" },
        take: 10,
        include: { product: { select: { name: true } } },
      }),
      listUserProducts(userId),
      // Filtro de OFERTA em cascata (davi): a lista de checkouts só é buscada
      // quando há produto escolhido — sem produto o filtro nem existe.
      productId ? listProductOffers(userId, productId) : Promise.resolve([]),
      listUserBots(userId),
      // Resolve SÓ os 4 KPIs do print (antes resolvia os 8 do layout salvo).
      resolveDashboardMetrics(filters, [...OVERVIEW_METRIC_KEYS]),
    ]);

  const t = await getTranslations("dashboard");
  const greeting = await getGreetingI18n();
  // 06/08/2026 (davi): "troque esse bem-vindo por: Boa tarde, (primeiro nome
  // do seller)" — só o PRIMEIRO nome, o displayName costuma vir completo.
  //
  // FIX 06/08/2026 (davi: "Ainda esta escrito Boa tarde, produtor / Era para
  // estar: Boa tarde, David - que é o primeiro nome da conta"):
  // antes olhava SÓ pra settings.displayName, que é um campo opcional do
  // /dashboard/perfil — quem nunca editou o perfil tem ele nulo e caía na
  // palavra genérica "produtor". Agora usa a mesma cascata do topbar/layout:
  // apelido do perfil → nome DA CONTA → parte local do e-mail. A palavra
  // "produtor" só sobra pro caso impossível de conta sem nome e sem e-mail.
  const name = firstName(
    settings.displayName ??
      account?.name ??
      account?.email?.split("@")[0] ??
      null,
  ) || t("produtor");

  const initialFeed = recentSales.map((t) => ({
    id: t.id,
    amount_cents: t.amountCents,
    net_cents: t.netCents,
    product: t.product.name,
    customer_name: t.customerName,
    method: t.method,
    paid_at: t.paidAt!.toISOString(),
  }));

  // As duas sections grandes são RENDERIZADAS NO SERVER (dados resolvidos aqui
  // mesmo) e passadas como React node pro client só posicionar no grid. Mantém
  // o fluxo de dados server-side intacto.
  // 06/08/2026 (davi, três rodadas: 'esses campos de metricas nao ficam legais
  // transparentes... opaco mas com elegancia' → 'ficou cinza, totalmente
  // diferente da estetica do gateway, tinha que ser preto elegante com
  // detalhes' → 'queria algo mais preto'): painel de receita com a mesma
  // superfície dos MetricCard — `bg-black`, um degrau mais escuro que a
  // página (#050505), sem o gradiente de luz que puxava o topo pro cinza.
  // Token do Tailwind e não hex porque o themes.css inverte --color-black pra
  // #ffffff no daylight, então o modo claro sai de graça.
  const revenueSection = (
    // HOVER (06/08/2026, davi): "Esse efeitinho quando passa o mouse em cima
    // na dashboard, faz esse mesmo efeito para o grafico e o vendas ao vivo".
    // Mesmas classes dos MetricCard — borda ciano, sombra ciano, sobe 2px e o
    // brilho difuso no canto.
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-black p-6 shadow-[0_16px_40px_-24px_rgba(0,0,0,1)] ring-1 ring-inset ring-white/[0.04] transition-all duration-300 ease-out will-change-transform hover:border-cyan-400/30 hover:shadow-[0_18px_44px_-20px_rgba(34, 211, 238,0.28)] motion-safe:hover:-translate-y-0.5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {/* Halo maior que o dos KPIs: o painel é bem mais largo e alto, o
          size-28 deles viraria um pontinho aqui. */}
      <span className="pointer-events-none absolute -right-14 -top-14 size-40 rounded-full bg-cyan-400/20 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
      {/* `relative` porque o overlay de luz acima é absolute e pintaria por
          cima de um filho não-posicionado. */}
      <div className="relative mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-white">
            {t("receita30Dias")}
          </h2>
          <p className="text-xs text-zinc-500">
            {formatBRL(m.grossCents)} {t("bruto")} · {m.salesCount}{" "}
            {t("vendasLabel")}
          </p>
        </div>
        <Link
          href="/dashboard/financeiro"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-cyan-300"
        >
          {t("verTodas")} <ArrowUpRight className="size-3" />
        </Link>
      </div>
      <div className="relative">
        <RevenueChart data={m.series} />
      </div>
    </div>
  );

  const liveFeedSection = (
    <LiveFeed initial={initialFeed} soundEnabled={settings.soundEnabled} />
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Entry animations (07/07/2026 v2): stagger automatico via .bp-page-in
          no PageTransition (layout). Cada filho top-level entra em cascata.
          Zero classes manuais. */}
      {/* 08/08/2026 (davi): "apaga essa notificacao da dashboard!" — o convite
          pro grupo de WhatsApp saiu daqui. O suporte continua no botão fixo do
          canto inferior direito e na aba Suporte, que é onde ele deve estar. */}
      <SellerWarningsBanner warnings={sellerWarnings} />

      {/* ===================== CELULAR ===================== */}
      {/* 08/08/2026 (davi): "faça uma versao da trilho para celular estilo app
          de banco (...) com tudo diferente da versao de PC". Abaixo de `md` a
          home inteira e outra: saldo primeiro, acoes, e o extrato. O painel de
          analise abaixo fica escondido — os dois nunca aparecem juntos.

          As duas arvores saem do MESMO conjunto de dados ja carregado acima:
          nenhuma consulta a mais roda por causa desta tela. */}
      <div className="md:hidden">
        <MobileHome
          greeting={greeting}
          name={name}
          balanceCents={account?.balanceCents ?? 0}
          values={values}
          periodLabel={periodLabel(filters.period)}
          sales={initialFeed}
        />
      </div>

      {/* ===================== DESKTOP ===================== */}
      {/* 06/08/2026 (davi): "Tira esse emoji da dash board, troque esse
          bem-vindo por: Boa tarde, (primeiro nome do seller)". A saudação
          virou o próprio título — a linha "BOA TARDE" em caixa alta que ficava
          por cima saiu junto, senão apareceria duas vezes. */}
      <div className="hidden space-y-6 md:block">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {name}
          </h1>
          <p className="text-sm text-zinc-400">
            {t("resumoOperacao")}
          </p>
        </div>

        {/* DashboardOverview é client (os filtros escrevem na URL) e usa
            useSearchParams — no App Router isso exige Suspense boundary. */}
        <Suspense fallback={null}>
        <DashboardOverview
          filters={{
            period: filters.period,
            productId: filters.productId,
            checkoutId: filters.checkoutId,
            botId: filters.botId,
          }}
          // 06/08/2026 (davi): "Deixa esse filtro de data especifica sempre
          // aparecendo! (...) quando seleciona ali no outro campo ultimos 7
          // dias, no outro aparece a data certinho de quando ate quando".
          // Resolvido NO SERVER com a mesma função que monta a query, então o
          // que aparece no campo é exatamente a janela consultada.
          resolvedRange={resolvePeriodRange(filters, account?.createdAt)}
          values={values}
          products={products}
          offers={offers}
          bots={bots}
          // privacyMode não desce mais por prop — o <DashboardOverview> lê do
          // PrivacyModeProvider (layout) pra borrar no clique, sem round-trip.
          revenueSection={revenueSection}
          liveFeedSection={liveFeedSection}
        />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Rotulo do recorte, pra home do celular.
 *
 * Ela nao tem a linha de filtros do desktop, entao o normal e cair no padrao
 * "today" — mas os filtros moram na URL, e um link compartilhado do desktop
 * abre no celular com o recorte do remetente. Sem este rotulo os tres numeros
 * ficariam sem legenda nenhuma e "Hoje" chapado poderia estar mentindo.
 */
function periodLabel(period: string): string {
  const MAP: Record<string, string> = {
    today: "Hoje",
    yesterday: "Ontem",
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
    month: "Este mês",
    ytd: "Este ano",
    all: "Todo o período",
    custom: "Período escolhido",
  };
  return MAP[period] ?? "Hoje";
}

/**
 * Primeiro nome, capitalizado.
 *
 * O `name` da conta vem do cadastro e chega em qualquer caixa ("DAVID SILVA",
 * "david silva"). Na saudação isso vira "Boa tarde, DAVID" — parece grito.
 * Normaliza pra "David". Se a origem foi o e-mail, a parte local pode ter
 * ponto/underscore ("david.souza"), então esses também contam como separador.
 */
function firstName(raw: string | null): string {
  const first = (raw ?? "").trim().split(/[\s._-]+/)[0] ?? "";
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Saudação pela hora de BRASÍLIA, não do servidor.
 *
 * `new Date().getHours()` roda em UTC na Vercel: às 22h de Brasília dava 01h e
 * o seller via "Boa madrugada" no meio do horário nobre de venda.
 */
async function getGreetingI18n(): Promise<string> {
  const t = await getTranslations("dashboard");
  const h = brtHour();
  if (h < 6) return t("boaMadrugada");
  if (h < 12) return t("bomDia");
  if (h < 18) return t("boaTarde");
  return t("boaNoite");
}
