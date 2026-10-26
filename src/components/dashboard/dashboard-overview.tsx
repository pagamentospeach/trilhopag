"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Calendar,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  Tag,
  Bot,
  Loader2,
} from "lucide-react";
import {
  OVERVIEW_METRIC_KEYS,
  type MetricValue,
} from "@/lib/dashboard-metrics";
import { PixIcon } from "@/components/icons/pix-icon";
import { usePrivacyMode } from "@/components/dashboard/privacy-mode";
import { cn } from "@/lib/utils";

/**
 * RESUMO FIXO (06/08/2026, davi) — modelo PinguPag.
 *
 * "vamos deixar a dashboard mais simples - copie essa do print, tira TODAS as
 *  opcoes de editar, nao vai ter mais isso!"
 *
 * Substitui o CustomizableDashboard, que trazia modo de edição (arrastar,
 * redimensionar, adicionar/remover métricas, biblioteca lateral, desfazer,
 * salvar, resetar) e persistia layout por seller em UserSettings.dashboardLayout.
 * Nada disso existe mais: o layout é o mesmo pra todo mundo e não é editável.
 *
 * O que ficou, exatamente como no print: linha de filtros, 4 KPIs, gráfico de
 * receita e o painel de vendas ao vivo do lado.
 *
 * Os FILTROS continuam todos — eles não são "opção de editar", são leitura de
 * dado. Só mudaram de selects rotulados pra pills compactas (o visual do
 * print). Continuam vivendo na URL (?period/?prod/?of/?bot), então link
 * compartilhado e refresh preservam o recorte.
 *
 * FILTROS (06/08/2026, davi):
 *  - saíram plataforma de tráfego (?utm) e conta de anúncio (?acc) junto com o
 *    best-tracker: "nenhuma metrica que tem a ver com ads (...) tem sentido mais";
 *  - entrou OFERTA (?of), que só aparece depois de escolher um produto —
 *    "quando seleciona um produto em especifico, abre outro campo de filtro
 *    de OFERTA";
 *  - entrou BOT (?bot), pras vendas que saíram de funil de bot;
 *  - entrou DATA ESPECÍFICA (?from/?to) — "Cria um campo de filtro de data
 *    especifica ex da imagem!". Hoje ele fica SEMPRE na linha, mostrando as
 *    datas que o período escolhido resolve, e abre um calendário de intervalo
 *    no clique (ver DateRangePill).
 */

/**
 * 06/08/2026 (davi): "TIra isso de ultimos 90 dias e tira esse de data
 * especifica".
 *
 * "Últimos 90 dias" ficava espremido entre "Este ano" e "Tudo" sem responder
 * nada que os dois vizinhos já não respondessem. E "Data específica" virou
 * redundante quando o campo de datas passou a ficar sempre na linha: clicar
 * nele já abre o calendário, então ter o mesmo comando escondido num dropdown
 * era um caminho a mais pro mesmo lugar.
 *
 * O período `custom` continua EXISTINDO (é o que o calendário aplica) — ver
 * `periodOptions`, que devolve o rótulo "Personalizado" quando ele está ativo.
 * Sem isso o select ficaria em branco depois de aplicar um intervalo, porque
 * nenhuma <option> casaria com o value.
 */
const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "ytd", label: "Este ano" },
  { value: "all", label: "Tudo" },
];

const CARDS: Array<{
  key: (typeof OVERVIEW_METRIC_KEYS)[number];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  // 06/08/2026 (davi): "Erro grave, o total em vendas da dashboard ta
  // aparecendo o faturamento bruto sem as taxas! É para aparecer COM AS
  // TAXAS!" — o label continua "Total em vendas", quem mudou foi a métrica
  // por trás: `faturamento_bruto` (soma de amountCents, o que o cliente
  // pagou) → `faturamento_liquido` (soma de netCents, o que cai pro seller).
  { key: "faturamento_liquido", label: "Total em vendas", icon: TrendingUp },
  { key: "vendas_pagas", label: "Vendas pagas", icon: ShoppingBag },
  { key: "arpu", label: "Ticket médio", icon: DollarSign },
  // 06/08/2026 (davi): "Troca esse icone pelo icone do PIX mesmo e nao esse
  // flash!" — era o `Zap` do lucide.
  { key: "taxa_aprovacao_pix", label: "Aprovação geral", icon: PixIcon },
];

/** `YYYY-MM-DD` no fuso de Brasília — o mesmo que o server usa pro recorte. */
function todayBrtISO(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function DashboardOverview({
  filters,
  resolvedRange,
  values,
  products,
  offers,
  bots,
  revenueSection,
  liveFeedSection,
}: {
  filters: {
    period: string;
    productId: string | null;
    checkoutId: string | null;
    botId: string | null;
  };
  /**
   * As duas datas que o período escolhido representa DE FATO, resolvidas no
   * server (`resolvePeriodRange`) com a mesma função que monta a query.
   * É o que o campo de datas mostra mesmo em preset — davi: "quando seleciona
   * ali no outro campo ultimos 7 dias, no outro aparece a data certinho".
   */
  resolvedRange: { from: string; to: string };
  values: Record<string, MetricValue>;
  products: Array<{ id: string; name: string }>;
  /** Ofertas (checkouts) do produto selecionado. Vazio quando não há produto. */
  offers: Array<{ id: string; label: string }>;
  bots: Array<{ id: string; name: string; type: string }>;
  revenueSection: React.ReactNode;
  liveFeedSection: React.ReactNode;
}) {
  // 06/08/2026 (davi: "delay bizarro para censurar tudo"): os cards de métrica
  // recebiam privacyMode do server, então só borravam depois do round-trip +
  // re-render. Agora vem do contexto e o blur cai junto com o clique no olho.
  const { privacyMode } = usePrivacyMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Filtro vive na URL: o server component relê searchParams e re-resolve as
  // métricas. Sem estado duplicado no client, sem "salvar filtro".
  const updateFilter = useCallback(
    (key: "period" | "prod" | "of" | "bot" | "from" | "to", value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Trocar de produto zera a oferta: o checkout selecionado pertence ao
      // produto ANTERIOR, e mantê-lo cruzaria produto A com oferta de B —
      // resultado sempre zero, e o seller acharia que perdeu as vendas.
      if (key === "prod") next.delete("of");
      if (key === "period") {
        if (value === "custom") {
          // Entrar em "Data específica" sem datas mostraria o período inteiro.
          // Semeia HOJE nas duas pontas: o seller vê um recorte válido na hora
          // e só mexe na ponta que quer.
          const today = todayBrtISO();
          if (!next.get("from")) next.set("from", today);
          if (!next.get("to")) next.set("to", today);
        } else {
          // Voltar pra um preset apaga o intervalo — senão ?from/?to ficariam
          // pendurados na URL e voltariam a valer sozinhos no próximo "custom".
          next.delete("from");
          next.delete("to");
        }
      }
      // Datas invertidas ("de" depois de "até") dariam janela vazia e zero em
      // tudo. Em vez de erro, arrasta a outra ponta junto.
      if (key === "from" && value && (next.get("to") ?? "") < value) {
        next.set("to", value);
      }
      if (key === "to" && value && value < (next.get("from") ?? "")) {
        next.set("from", value);
      }
      startTransition(() => {
        router.replace(`/dashboard?${next.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  /**
   * Aplica um intervalo escolhido no calendário. Precisa ser UMA navegação só:
   * chamar `updateFilter` três vezes (period, from, to) partiria de
   * `searchParams` congelado nas três, e a última sobrescreveria as outras
   * duas — o clássico stale closure. Aqui os três params vão juntos.
   */
  const applyCustomRange = useCallback(
    (from: string, to: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("period", "custom");
      next.set("from", from);
      next.set("to", to);
      startTransition(() => {
        router.replace(`/dashboard?${next.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  /**
   * "Personalizado" só entra na lista quando é o período ATIVO. Um <select>
   * cujo `value` não bate com nenhuma <option> renderiza vazio — e é
   * exatamente o que aconteceria logo depois de aplicar um intervalo no
   * calendário, já que "Data específica" saiu do dropdown (davi).
   */
  const periodOptions = useMemo(
    () =>
      filters.period === "custom"
        ? [...PERIODS, { value: "custom", label: "Personalizado" }]
        : PERIODS,
    [filters.period],
  );

  const productOptions = useMemo(
    () => [
      { value: "", label: "Todos os produtos" },
      ...products.map((p) => ({ value: p.id, label: p.name })),
    ],
    [products],
  );

  const offerOptions = useMemo(
    () => [
      { value: "", label: "Todas as ofertas" },
      ...offers.map((o) => ({ value: o.id, label: o.label })),
    ],
    [offers],
  );

  const botOptions = useMemo(
    () => [
      { value: "", label: "Todos os bots" },
      ...bots.map((b) => ({
        value: b.id,
        label: `${b.name} (${b.type === "discord" ? "Discord" : "Telegram"})`,
      })),
    ],
    [bots],
  );

  return (
    <div className="space-y-4">
      {/* ===== Filtros (pills compactas, igual ao print) ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          icon={Calendar}
          value={filters.period}
          onChange={(v) => updateFilter("period", v)}
          options={periodOptions}
        />
        {/* SEMPRE VISÍVEL (06/08/2026, davi): "Deixa esse filtro de data
            especifica sempre aparecendo! assim o seller consegue ir vendo o
            dia que pegando". Antes só existia com "Data específica" escolhida;
            agora ele é o VISOR do recorte — em preset mostra as datas que o
            preset resolve, e clicar nele abre o calendário. */}
        <DateRangePill
          from={resolvedRange.from}
          to={resolvedRange.to}
          onApply={applyCustomRange}
        />
        <FilterPill
          icon={Package}
          value={filters.productId ?? ""}
          onChange={(v) => updateFilter("prod", v)}
          options={productOptions}
        />
        {/* Oferta = checkout do produto. Só abre depois de escolher um produto
            (davi), e some se o produto escolhido ainda não tem checkout. */}
        {filters.productId && offers.length > 0 && (
          <FilterPill
            icon={Tag}
            value={filters.checkoutId ?? ""}
            onChange={(v) => updateFilter("of", v)}
            options={offerOptions}
          />
        )}
        {/* Bot só aparece pra quem tem bot COM FUNIL — bot de notificação
            nunca gera venda rastreável (ver listUserBots). */}
        {bots.length > 0 && (
          <FilterPill
            icon={Bot}
            value={filters.botId ?? ""}
            onChange={(v) => updateFilter("bot", v)}
            options={botOptions}
          />
        )}
        {pending && (
          <Loader2 className="size-4 animate-spin text-cyan-400" aria-label="Atualizando" />
        )}
      </div>

      {/* ===== 4 KPIs ===== */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3 transition-opacity duration-200 lg:grid-cols-4",
          pending && "opacity-50",
        )}
      >
        {CARDS.map((c) => (
          <MetricCard
            key={c.key}
            label={c.label}
            icon={c.icon}
            value={values[c.key]}
            privacyMode={privacyMode}
          />
        ))}
      </div>

      {/* ===== Receita (2/3) + Vendas ao vivo (1/3) ===== */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">{revenueSection}</div>
        <div>{liveFeedSection}</div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  icon: Icon,
  value,
  privacyMode,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value?: MetricValue;
  privacyMode: boolean;
}) {
  return (
    // 06/08/2026 (davi): "Adciona algumas animacoes quando eu passo o mouse em
    // cima dos campos das metricas na dashboard!".
    //
    // O card sobe 2px, ganha borda/fundo ciano e uma sombra difusa. `group` +
    // `motion-safe:` — quem tem "reduzir movimento" ligado no SO fica só com a
    // mudança de cor, sem o deslocamento. `will-change-transform` evita o
    // repaint do texto tabular no meio da transição.
    // SUPERFÍCIE OPACA (06/08/2026, davi): "esses campos de metricas nao ficam
    // legais transparentes, quero que vc deixe eles opacus! (...) opaco mas
    // com elegancia".
    //
    // Era `bg-white/[0.02]` — 2% de branco, ou seja, o padrão de pontos do
    // wallpaper aparecia ATRAVÉS do card e o número da métrica ficava nadando
    // em cima da textura.
    //
    // PRETO, NÃO CINZA (06/08/2026, davi): "mas ficou cinza, totalmente
    // diferente da estetica do gateway, tinha que ser preto elegante com
    // detalhes!".
    //
    // Terceira rodada: "Ainda nao gostei desses campos assim, queria algo mais
    // preto!". O fill já era zinc-950 (#09090b), mas o gradiente de luz que eu
    // tinha posto pra dar volume clareava o topo pra ~#131316 — é ELE que
    // estava lendo como cinza. Saiu.
    //
    // Agora é `bg-black`. A página é #050505, então o card fica um degrau MAIS
    // ESCURO que o fundo, e não mais claro: em vez de um bloco pousado por
    // cima, vira um recorte. Preto de verdade, que é o que ele pediu nas três
    // tentativas.
    //
    // Continua sendo token do Tailwind e não hex: o daylight
    // (styles/themes.css) inverte --color-black pra #ffffff, então no modo
    // claro isso vira o card branco padrão, de graça.
    //
    // Sem gradiente, quem desenha a forma são só os DETALHES de borda:
    //   1. fio de luz na borda superior = acabamento;
    //   2. ring interno de 1px = corte limpo na curva;
    //   3. sombra funda por baixo = separa do fundo sem clarear nada.
    // O hover não clareia o fundo: acende a borda e o brilho ciano do canto.
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black p-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,1)] ring-1 ring-inset ring-white/[0.04] transition-all duration-300 ease-out will-change-transform hover:border-cyan-400/30 hover:shadow-[0_18px_44px_-20px_rgba(34, 211, 238,0.28)] motion-safe:hover:-translate-y-0.5 sm:p-5">
      {/* Fio de luz na borda de cima — é o que dá o acabamento "vidro" do
          exemplo que o davi mandou, sem custar transparência no card. */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      {/* Brilho ciano que acende no canto — puramente decorativo, e
          pointer-events-none pra não roubar o hover de nada. */}
      <span className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-cyan-400/20 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative flex items-center justify-between">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400 transition-all duration-300 ease-out group-hover:bg-cyan-400/20 group-hover:text-cyan-300 motion-safe:group-hover:scale-110">
          <Icon className="size-4" />
        </span>
        {value?.sub && (
          <span
            className={cn(
              "text-xs transition-transform duration-300 ease-out motion-safe:group-hover:-translate-x-0.5",
              value.subColor || "text-zinc-500",
            )}
          >
            {value.sub}
          </span>
        )}
      </div>
      <p className="relative mt-4 text-xs uppercase tracking-wider text-zinc-400 transition-colors duration-300 group-hover:text-zinc-300">
        {label}
      </p>
      <p className="relative mt-1 text-2xl font-semibold tabular-nums text-white">
        {privacyMode ? (
          // Modo privacidade: borra o número. Aqui o hover DESBORRA — é o gesto
          // natural pra espiar um valor sem desligar o modo (o `title` continua
          // pra quem chega por teclado).
          <span
            className="cursor-help select-none blur-sm transition-[filter] duration-300 group-hover:blur-none"
            title={value?.value}
          >
            {value?.value ?? "—"}
          </span>
        ) : (
          (value?.value ?? "—")
        )}
      </p>
    </div>
  );
}

/* ============================ CALENDÁRIO ============================ */

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
/** Domingo primeiro, igual ao print. */
const WEEKDAYS = ["DO", "SE", "TE", "QA", "QI", "SX", "SA"];

/** `YYYY-MM-DD` a partir de ano/mês(0-based)/dia. */
function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `2026-08-06` → `06/08/2026`. */
function fmtBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * As 42 células (6 semanas) da grade de um mês, incluindo as sobras do mês
 * anterior e do seguinte pra grade nunca "pular" de altura ao trocar de mês.
 *
 * Aritmética feita com `Date` LOCAL só pra descobrir dia-da-semana e quantos
 * dias tem o mês — nada aqui vira instante nem cruza fuso. O que sai são
 * strings `YYYY-MM-DD`, que é o formato que a URL e o server falam.
 */
function monthGrid(y: number, m: number): Array<{ iso: string; out: boolean }> {
  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();
  const cells: Array<{ iso: string; out: boolean }> = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const pm = m === 0 ? 11 : m - 1;
    cells.push({ iso: isoOf(m === 0 ? y - 1 : y, pm, d), out: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoOf(y, m, d), out: false });
  }
  let d = 1;
  while (cells.length < 42) {
    const nm = m === 11 ? 0 : m + 1;
    cells.push({ iso: isoOf(m === 11 ? y + 1 : y, nm, d), out: true });
    d++;
  }
  return cells;
}

/**
 * FILTRO DE DATA (06/08/2026, davi).
 *
 * Nasceu como dois `<input type="date">` ("Cria um campo de filtro de data
 * especifica ex da imagem!") e mudou de papel duas vezes no mesmo dia:
 *
 *  1. "Deixa esse filtro de data especifica sempre aparecendo! assim o seller
 *     consegue ir vendo o dia que pegando" → deixou de ser um formulário que
 *     só existia no modo "custom" e virou o VISOR do recorte. `from`/`to` vêm
 *     resolvidos do server, então em "Últimos 7 dias" ele mostra os 7 dias.
 *
 *  2. "Faz com que quando clique aqui abra um calendario para selecionar data
 *     certinho" → o picker nativo do navegador não serve mais. Ele abre UM
 *     campo por vez, não desenha intervalo, e o visual muda em cada SO. Agora
 *     é um calendário próprio: dois cliques (início → fim), faixa ciano ligando
 *     as pontas e Cancelar/Aplicar, igual ao print.
 *
 * Só ao APLICAR o filtro vai pra URL (?period=custom&from&to). Antes disso é
 * tudo rascunho — assim o seller navega meses sem disparar re-query a cada
 * clique, e "Cancelar" realmente cancela.
 *
 * Nenhuma data futura é selecionável: venda de amanhã não existe e o recorte
 * só devolveria zero.
 */
function DateRangePill({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const max = todayBrtISO();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  /** Qual ponta o próximo clique define. Reinicia em "from" a cada abertura. */
  const [picking, setPicking] = useState<"from" | "to">("from");
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(() => {
    const [y, m] = from.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const boxRef = useRef<HTMLDivElement>(null);

  // Reabrir sempre parte do que está valendo agora, não do rascunho de antes.
  function openPicker() {
    setDraftFrom(from);
    setDraftTo(to);
    setPicking("from");
    setHover(null);
    const [y, m] = from.split("-").map(Number);
    setView({ y, m: m - 1 });
    setOpen(true);
  }

  // Fecha no clique fora e no Esc. `mousedown` (não `click`) porque o clique
  // pode cair num elemento que some no meio do gesto.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(iso: string) {
    if (iso > max) return;
    if (picking === "from") {
      // Primeiro clique fecha o intervalo em si mesmo: se o seller aplicar
      // agora, o recorte é aquele dia — nunca um intervalo pela metade.
      setDraftFrom(iso);
      setDraftTo(iso);
      setPicking("to");
      return;
    }
    // Clicar ANTES do início não é erro, é o seller redesenhando o intervalo
    // de trás pra frente. Inverte as pontas em vez de recusar.
    if (iso < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(iso);
    } else {
      setDraftTo(iso);
    }
    setPicking("from");
  }

  // Prévia enquanto escolhe a ponta final — sem isso não dá pra ver o tamanho
  // do intervalo antes de clicar.
  const previewTo = picking === "to" && hover && hover > draftFrom ? hover : draftTo;
  const previewFrom = picking === "to" && hover && hover < draftFrom ? hover : draftFrom;

  const cells = useMemo(() => monthGrid(view.y, view.m), [view]);
  /** Mês seguinte só existe se ainda houver dia selecionável nele. */
  const canGoNext =
    (view.m === 11 ? isoOf(view.y + 1, 0, 1) : isoOf(view.y, view.m + 1, 1)) <=
    max;

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border bg-white/[0.03] px-3 py-2 text-sm transition hover:border-white/[0.14]",
          open ? "border-cyan-400/40" : "border-white/[0.08]",
        )}
      >
        <CalendarRange className="size-3.5 shrink-0 text-zinc-500" />
        <span className="tabular-nums text-white">{fmtBR(from)}</span>
        <span className="text-xs text-zinc-500">até</span>
        <span className="tabular-nums text-white">{fmtBR(to)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Selecionar intervalo de datas"
          // z-50 pra passar por cima dos cards; a linha de filtros fica no topo
          // da página, então abrir pra baixo nunca corta.
          className="absolute left-0 top-full z-50 mt-2 w-[19rem] rounded-2xl border border-white/[0.08] bg-zinc-950 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,1)] ring-1 ring-inset ring-white/[0.04]"
        >
          {/* Rascunho no topo: o seller confere o que escolheu sem fechar. */}
          <div className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm tabular-nums text-white">
            {fmtBR(draftFrom)}
            <span className="text-zinc-500">—</span>
            {fmtBR(draftTo)}
          </div>

          <div className="flex items-center justify-between px-1 py-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Mês anterior"
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/[0.06] hover:text-cyan-300"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-medium text-white">
              {MONTH_NAMES[view.m]} {view.y}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              disabled={!canGoNext}
              aria-label="Próximo mês"
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/[0.06] hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-[10px] font-medium text-zinc-500">
                {w}
              </span>
            ))}
            {cells.map(({ iso, out }) => {
              const future = iso > max;
              const isStart = iso === previewFrom;
              const isEnd = iso === previewTo;
              const inside = iso > previewFrom && iso < previewTo;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={future}
                  onClick={() => pick(iso)}
                  onMouseEnter={() => setHover(iso)}
                  className={cn(
                    "relative mx-auto flex size-8 items-center justify-center rounded-lg text-xs tabular-nums transition",
                    future
                      ? "cursor-not-allowed text-zinc-700"
                      : isStart || isEnd
                        ? "bg-cyan-400 font-semibold text-black"
                        : inside
                          ? "bg-cyan-400/15 text-cyan-200"
                          : out
                            ? "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
                            : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                    iso === max && !isStart && !isEnd && "ring-1 ring-inset ring-cyan-400/40",
                  )}
                >
                  {Number(iso.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl border border-white/[0.1] px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onApply(draftFrom, draftTo);
              }}
              className="flex-1 rounded-xl bg-cyan-400 px-3 py-2 text-sm font-semibold text-black transition hover:bg-cyan-300"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DROPDOWN DOS FILTROS (06/08/2026, davi): "deixa isso na estetica do
 * gateway!".
 *
 * Era um `<select>` nativo. A pill em si estava certa, mas a LISTA que abria
 * era desenhada pelo sistema operacional: no macOS um popup branco com o item
 * ativo em azul — nada a ver com um gateway preto e ciano. E isso não tem
 * conserto por CSS: `<option>` não aceita estilo em macOS/iOS, então
 * `appearance-none` e `[&>option]:bg-zinc-900` só maquiavam o campo fechado.
 *
 * Trocado por um listbox próprio, no mesmo desenho do calendário ao lado:
 * popover preto, borda 8%, item ativo em ciano com check e hover branco 6%.
 *
 * O que era de graça no nativo e teve que ser reescrito aqui:
 *  - fecha no clique fora e no Esc;
 *  - navegação por teclado (↑ ↓ Home End Enter), porque um <div role="listbox">
 *    não vem com nada disso;
 *  - `aria-selected`/`aria-expanded` pro leitor de tela continuar entendendo.
 *
 * A lista cresce além da pill (`w-max`) porque nome de produto é longo, e é
 * capada em max-h-72 com scroll pra quem tem catálogo grande.
 */
function FilterPill({
  icon: Icon,
  value,
  onChange,
  options,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  /** Item sob o cursor do TECLADO (o do mouse é só :hover). */
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options[selectedIdx];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Mantém o item do teclado visível quando a lista é maior que o popover.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [open, cursor]);

  function openList() {
    setCursor(selectedIdx);
    setOpen(true);
  }

  function commit(v: string) {
    setOpen(false);
    if (v !== value) onChange(v);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) {
      // Abrir com seta é o comportamento que o <select> nativo tinha.
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[cursor];
      if (o) commit(o.value);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border bg-white/[0.03] px-3 py-2 text-sm text-white transition hover:border-white/[0.14]",
          open ? "border-cyan-400/40" : "border-white/[0.08]",
        )}
      >
        <Icon className="size-3.5 shrink-0 text-zinc-500" />
        <span className="max-w-[13rem] truncate">{current?.label}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-zinc-500 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute left-0 top-full z-50 mt-2 max-h-72 w-max min-w-full max-w-[20rem] overflow-y-auto rounded-2xl border border-white/[0.08] bg-zinc-950 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,1)] ring-1 ring-inset ring-white/[0.04]"
        >
          {options.map((o, i) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => commit(o.value)}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                  active
                    ? "bg-cyan-400/10 text-cyan-300"
                    : i === cursor
                      ? "bg-white/[0.06] text-white"
                      : "text-zinc-300",
                )}
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
