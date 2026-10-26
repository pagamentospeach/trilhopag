"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  X,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Tag,
  User as UserIcon,
  CreditCard,
  Activity,
  ExternalLink,
  Paperclip,
  MessageCircle,
  Pencil,
  Loader2,
  Search,
  Calendar,
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/utils";
import { Timeline, montarEventos } from "./timeline";
import { saveWhatsappQuickTemplate } from "./actions";

/**
 * Template padrão da mensagem do WhatsApp por venda. Placeholders:
 * {nome} {produto} {valor} {status}.
 */
const DEFAULT_WA_TEMPLATE =
  "Olá {nome}! Tudo bem? Vi que você gerou um PIX para *{produto}* no valor de {valor}. Posso te ajudar a finalizar o pagamento? 😊";

/**
 * Normaliza um telefone BR pra E.164 (só dígitos, com DDI 55). Retorna null
 * se não der pra montar um número válido (curto demais / vazio).
 */
function normalizeBrPhone(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = "55" + d;
  // 55 + DDD(2) + número(8 ou 9) = 12 ou 13 dígitos
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

function fillTemplate(tpl: string, tx: Tx): string {
  return tpl
    .replaceAll("{nome}", tx.customerName?.trim() || "tudo bem")
    .replaceAll("{produto}", tx.productName)
    .replaceAll("{valor}", formatBRL(tx.amountCents))
    .replaceAll("{status}", tx.status);
}

function buildWaLink(tx: Tx, template: string): string | null {
  const phone = normalizeBrPhone(tx.customerPhone);
  if (!phone) return null;
  const msg = fillTemplate(template || DEFAULT_WA_TEMPLATE, tx);
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

const statusStyles: Record<string, string> = {
  PAID: "bg-cyan-400/15 text-cyan-300",
  PENDING: "bg-yellow-400/15 text-yellow-300",
  PROCESSING: "bg-blue-400/15 text-blue-300",
  EXPIRED: "bg-zinc-700/40 text-zinc-400",
  REFUNDED: "bg-purple-400/15 text-purple-300",
  CHARGEBACK: "bg-red-500/15 text-red-300",
  FAILED: "bg-red-500/15 text-red-300",
  CANCELED: "bg-zinc-700/40 text-zinc-400",
};

/** Formata CEP 12345678 → 12345-678. Lida com strings ja formatadas. */
function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return raw;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Nominal = nome do recebedor gravado no QR do PIX (tag EMV 59) — o nome
 * que aparece no extrato do cliente. É o que o seller quer ver por venda.
 * Pode ser null (cartão/teste sem QR PIX) → mostra "—".
 */
function NominalBadge({ nominal }: { nominal: string | null }) {
  if (!nominal) return <span className="text-[10px] text-zinc-600">—</span>;
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-200"
      title={`Nominal: ${nominal}`}
    >
      {nominal}
    </span>
  );
}

type Tx = {
  id: string;
  // 29/07/2026 (davi): filtro por produto/oferta na tela vendas
  productId: string | null;
  checkoutId: string | null;
  createdAt: string;
  paidAt: string | null;
  customerName: string | null;
  customerEmail: string;
  customerPhone: string | null;
  customerCpf: string | null;
  customerIp: string | null;
  customerCep: string | null;
  customerAddress: string | null;
  customerNumber: string | null;
  customerComplement: string | null;
  customerNeighborhood: string | null;
  customerCity: string | null;
  customerState: string | null;
  productName: string;
  method: string;
  nominal: string | null;
  amountCents: number;
  netCents: number;
  feeCents: number;
  status: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
  originHost: string | null;
  originPath: string | null;
  pixCopyPaste: string | null;
  providerId: string | null;
  // 09/08/2026: carimbos pra linha do tempo do detalhe. Vêm do serializador
  // compartilhado (lib/vendas-query.ts), então chegam pelos dois caminhos.
  pixCopiedAt: string | null;
  expiredAt: string | null;
  refundedAt: string | null;
  sellerNotifiedAt: string | null;
  availableAt: string | null;
  releasedToBalance: boolean;
  receiptUrl: string | null;
  abVariant: string | null;
  abTemplate: string | null;
};

/**
 * "1.234,56" ou "1234.56" → 123456 centavos. `null` quando não dá pra ler.
 *
 * Aceita os dois separadores porque o seller digita como está acostumado, e
 * um campo que só entende vírgula devolve lista vazia pra quem digitou ponto
 * — o que parece "não tenho venda nessa faixa".
 */
function reaisParaCents(v: string): number | null {
  const limpo = v.trim().replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  // Se tem os dois, o ÚLTIMO é o decimal e o outro é separador de milhar.
  const normalizado =
    limpo.includes(",") && limpo.includes(".")
      ? limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
        ? limpo.replace(/\./g, "").replace(",", ".")
        : limpo.replace(/,/g, "")
      : limpo.replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function VendasClient({
  transactions: initialTransactions,
  whatsappTemplate,
  highlightId,
  hasMore: initialHasMore,
  initialCursor,
  products,
  checkouts,
}: {
  transactions: Tx[];
  whatsappTemplate: string | null;
  /**
   * Id vindo do `?highlight=` do push de venda paga. A página garante que
   * essa transação está em `transactions`, buscando ela à parte se não
   * estiver nas 50 primeiras.
   */
  highlightId: string | null;
  hasMore: boolean;
  initialCursor: string | null;
  // 29/07/2026 (davi): opções pros dropdowns de filtro produto/oferta.
  products: Array<{ id: string; name: string }>;
  checkouts: Array<{
    id: string;
    slug: string;
    productId: string;
    productName: string;
  }>;
}) {
  /**
   * A venda aberta no modal de detalhe.
   *
   * O valor inicial vem do `?highlight=` do push de venda paga (08/08/2026: o
   * push mandava esse parâmetro desde sempre e ninguém lia — o redirect de
   * /dashboard/vendas ainda jogava a query fora antes de chegar aqui, então
   * toda notificação terminava numa lista genérica).
   *
   * Inicializar o estado em vez de abrir por efeito faz o modal existir já no
   * PRIMEIRO paint: quem toca a notificação não vê a lista aparecer e o modal
   * saltar por cima depois. E como é só valor inicial, fechar não reabre e
   * paginar com "Ver mais" também não.
   */
  const [selected, setSelected] = useState<Tx | null>(
    () => initialTransactions.find((t) => t.id === highlightId) ?? null,
  );
  const [onlyReceipts, setOnlyReceipts] = useState(false);
  /**
   * Faixa de valor, em REAIS como o seller digita. A conversão pra centavos
   * acontece só na hora de montar a query — guardar centavos no estado faria
   * o campo brigar com quem está no meio de digitar "1", "10", "100".
   */
  const [minReais, setMinReais] = useState("");
  const [maxReais, setMaxReais] = useState("");
  // Estado local acumulado — inicia com o SSR e cresce a cada "Ver mais".
  // FIX 08/07/2026 (seller reclamou "so vejo 50"): antes vinha 50 fixo do
  // server; agora tem paginacao cursor-based via /api/dashboard/vendas-more.
  const [transactions, setTransactions] = useState<Tx[]>(initialTransactions);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);


  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      // Os filtros vão JUNTO com o cursor. Sem isso o "Ver mais" pagina o
      // conjunto sem filtro e despeja no meio da lista filtrada linhas que
      // não casam com o que está selecionado na tela.
      const sp = filtrosParaQuery();
      sp.set("cursor", nextCursor);
      sp.set("take", "50");
      const res = await fetch(`/api/dashboard/vendas-more?${sp.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setLoadMoreError("Não deu pra carregar mais vendas agora. Tenta de novo.");
        return;
      }
      const data = (await res.json()) as {
        items: Tx[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      setTransactions((prev) => {
        // Dedup por id (na hipotese remota de a lista ter mudado entre fetches)
        const seen = new Set(prev.map((t) => t.id));
        const fresh = data.items.filter((t) => !seen.has(t.id));
        return [...prev, ...fresh];
      });
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch {
      setLoadMoreError("Erro de rede. Tenta de novo.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Contagens antes de qualquer filtro — usadas pra decidir o default do
  // statusFilter e pra mostrar contagem nas pills.
  const receiptCount = transactions.filter((t) => t.receiptUrl).length;
  const paidCount = transactions.filter((t) => t.status === "PAID").length;
  const pendingCount = transactions.filter(
    (t) => t.status === "PENDING",
  ).length;

  // Filtro por status — DEFAULT "ALL" (08/07/2026, david: "sempre comece com
  // o filtro em TODAS as vendas e nao nas pagas"). Antes o default era PAID
  // se paidCount>0 — mudado pra sempre TODAS.
  const [statusFilter, setStatusFilter] = useState<
    "PAID" | "PENDING" | "ALL"
  >("ALL");
  // Busca livre em: cliente (nome/email/cpf), produto, ID da tx.
  const [query, setQuery] = useState("");
  // Filtro por metodo de pagamento — pix / card / all.
  const [methodFilter, setMethodFilter] = useState<"ALL" | "pix" | "card">(
    "ALL",
  );
  // Filtro por periodo — "today"/"7d"/"30d"/"all"/"custom" (data especifica).
  const [periodFilter, setPeriodFilter] = useState<
    "today" | "7d" | "30d" | "all" | "custom"
  >("all");
  // Data especifica (YYYY-MM-DD) — quando o seller escolhe no calendario.
  const [customDate, setCustomDate] = useState<string>("");
  // 29/07/2026 (davi): filtro por produto + oferta (checkout).
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [checkoutFilter, setCheckoutFilter] = useState<string>("ALL");
  // Ao trocar de produto, reseta o filtro de checkout (checkouts pertencem
  // a produto — se muda de produto, a oferta antiga nao faz sentido).
  useEffect(() => {
    setCheckoutFilter("ALL");
  }, [productFilter]);
  // Checkouts disponiveis pra o dropdown de oferta:
  //  - Se ALL produto → esconde dropdown de oferta (seller precisa escolher produto primeiro).
  //  - Se produto especifico → mostra so os checkouts daquele produto.
  const checkoutOptions =
    productFilter === "ALL"
      ? []
      : checkouts.filter((c) => c.productId === productFilter);
  // Controle do popover do calendario custom (BpDatePicker).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [template, setTemplate] = useState<string>(
    whatsappTemplate ?? DEFAULT_WA_TEMPLATE,
  );
  const [editorOpen, setEditorOpen] = useState(false);

  /**
   * Traduz o filtro de período para um intervalo ISO, no fuso do NAVEGADOR.
   *
   * Mantém letra por letra a semântica que a cadeia de `.filter` tinha antes:
   * "hoje" era `agora - 24h` (janela móvel, não meia-noite), e o dia escolhido
   * no calendário cobre 00:00 → 23:59:59.999 locais.
   */
  function periodoParaIntervalo(): { from: string | null; to: string | null } {
    if (periodFilter === "custom") {
      if (!customDate) return { from: null, to: null };
      return {
        from: new Date(customDate + "T00:00:00").toISOString(),
        to: new Date(customDate + "T23:59:59.999").toISOString(),
      };
    }
    if (periodFilter === "all") return { from: null, to: null };
    const janelas: Record<"today" | "7d" | "30d", number> = {
      today: 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    return {
      from: new Date(Date.now() - janelas[periodFilter]).toISOString(),
      to: null,
    };
  }

  function filtrosParaQuery(): URLSearchParams {
    const sp = new URLSearchParams();
    if (statusFilter !== "ALL") sp.set("status", statusFilter);
    if (methodFilter !== "ALL") sp.set("method", methodFilter);
    if (productFilter !== "ALL") sp.set("productId", productFilter);
    if (checkoutFilter !== "ALL") sp.set("checkoutId", checkoutFilter);
    if (onlyReceipts) sp.set("receipts", "1");
    const min = reaisParaCents(minReais);
    const max = reaisParaCents(maxReais);
    if (min !== null) sp.set("min", String(min));
    if (max !== null) sp.set("max", String(max));
    if (query.trim()) sp.set("q", query.trim());
    const { from, to } = periodoParaIntervalo();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    return sp;
  }

  /**
   * Contador de retentativa. Entra na assinatura dos filtros pra o botão
   * "Tentar de novo" refazer a MESMA consulta — mexer na busca pra forçar o
   * efeito mudaria o que está sendo perguntado.
   */
  const [retry, setRetry] = useState(0);

  /** Assinatura dos filtros: só refaz a busca quando algo de fato mudou. */
  const filtrosKey = [
    statusFilter,
    methodFilter,
    productFilter,
    checkoutFilter,
    onlyReceipts ? "1" : "0",
    minReais,
    maxReais,
    periodFilter,
    customDate,
    query.trim(),
    retry,
  ].join("|");

  const semFiltro =
    statusFilter === "ALL" &&
    methodFilter === "ALL" &&
    productFilter === "ALL" &&
    checkoutFilter === "ALL" &&
    !onlyReceipts &&
    !minReais.trim() &&
    !maxReais.trim() &&
    periodFilter === "all" &&
    !query.trim();

  const [filtrando, setFiltrando] = useState(false);
  const [filtroError, setFiltroError] = useState<string | null>(null);
  /** Guarda o primeiro render: o SSR já veio sem filtro, não refazer à toa. */
  const primeiraRenderizacao = useRef(true);
  /** Sequência da requisição, pra descartar resposta de filtro já abandonado. */
  const reqSeq = useRef(0);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }

    // 350ms: a busca é a única fonte que dispara por tecla. Sem isto, digitar
    // "joao" viraria quatro consultas no banco e quatro respostas fora de
    // ordem competindo pela tela.
    //
    // O caso "limpou tudo" também mora aqui dentro, e não como early return no
    // corpo do efeito: setState síncrono ali dispara render em cascata (o
    // react-hooks/set-state-in-effect reclama, com razão). Dentro do timeout é
    // assíncrono e o resultado é o mesmo.
    const id = setTimeout(async () => {
      const seq = ++reqSeq.current;

      // Sem nenhum filtro, o payload é idêntico ao que o servidor já mandou no
      // render inicial — restaurar dele evita um roundtrip só pra receber de
      // volta o que já está na tela.
      if (semFiltro) {
        setTransactions(initialTransactions);
        setNextCursor(initialCursor);
        setHasMore(initialHasMore);
        setFiltrando(false);
        setFiltroError(null);
        return;
      }

      setFiltrando(true);
      setFiltroError(null);
      try {
        const sp = filtrosParaQuery();
        sp.set("take", "50");
        const res = await fetch(`/api/dashboard/vendas-more?${sp.toString()}`, {
          cache: "no-store",
        });
        // Chegou atrasada: outro filtro já foi pedido depois deste. Descartar,
        // senão a tela pisca com o resultado de uma pergunta antiga.
        if (seq !== reqSeq.current) return;
        if (!res.ok) {
          setFiltroError("Não deu pra aplicar o filtro agora. Tenta de novo.");
          return;
        }
        const data = (await res.json()) as {
          items: Tx[];
          hasMore: boolean;
          nextCursor: string | null;
        };
        if (seq !== reqSeq.current) return;
        setTransactions(data.items);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch {
        if (seq === reqSeq.current) {
          setFiltroError("Erro de rede ao filtrar. Tenta de novo.");
        }
      } finally {
        if (seq === reqSeq.current) setFiltrando(false);
      }
    }, 350);

    return () => clearTimeout(id);
    // `filtrosKey` resume todos os filtros numa string; as funções acima só
    // leem estado que já está nela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey]);

  /**
   * ─── OS FILTROS AGORA RODAM NO BANCO ───
   *
   * 08/08/2026. Até aqui existia uma cadeia de `list.filter(...)` neste ponto
   * do arquivo, aplicada sobre `transactions` — ou seja, sobre as 50 linhas
   * carregadas. Filtrar por "PAID" varria 50 e devolvia o resultado com a cara
   * de resposta completa. Buscar um cliente pelo nome devolvia "nada
   * encontrado" quando a venda dele era a de número 200.
   *
   * Agora cada mudança de filtro refaz a consulta pelo /api/dashboard/
   * vendas-more, que aplica tudo no `where` do Postgres e devolve a primeira
   * página do recorte. `list` passa a ser exatamente o que o servidor mandou.
   *
   * O QUE NÃO MUDOU DE PROPÓSITO: o corte de data continua sendo calculado
   * AQUI, no fuso do navegador, e vai pro servidor como um intervalo pronto.
   * O comportamento sempre foi "o dia do seller", e o servidor roda em UTC —
   * mandar a palavra "hoje" pra ele interpretar mudaria o que o seller vê
   * perto da meia-noite, silenciosamente.
   */
  const q = query.trim();
  const list = transactions;

  // Resumo do teste A/B: vendas por braço (A vs B). Aparece só se houver.
  const abA = transactions.filter((t) => t.abVariant === "A").length;
  const abB = transactions.filter((t) => t.abVariant === "B").length;

  const activeFiltersCount =
    (statusFilter !== "ALL" ? 1 : 0) +
    (methodFilter !== "ALL" ? 1 : 0) +
    (periodFilter !== "all" ? 1 : 0) +
    (onlyReceipts ? 1 : 0) +
    (minReais.trim() || maxReais.trim() ? 1 : 0) +
    (productFilter !== "ALL" ? 1 : 0) +
    (checkoutFilter !== "ALL" ? 1 : 0) +
    (q.length > 0 ? 1 : 0);
  return (
    <>
      {/* ─── BARRA DE BUSCA + FILTROS ─── */}
      <div className="mb-3 space-y-2">
        {/* Linha 1: busca livre */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail, CPF, produto ou ID da venda…"
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 py-2 pl-9 pr-9 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Linha 2: pills de filtro */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status pills — Pagas / Pendentes / Todas */}
          <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 p-1">
            {(
              [
                { key: "PAID" as const, label: "Pagas", count: paidCount },
                {
                  key: "PENDING" as const,
                  label: "Pendentes",
                  count: pendingCount,
                },
                {
                  key: "ALL" as const,
                  label: "Todas",
                  count: transactions.length,
                },
              ]
            ).map((opt) => {
              const active = statusFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? opt.key === "PAID"
                        ? "bg-cyan-400/15 text-cyan-300"
                        : opt.key === "PENDING"
                          ? "bg-amber-400/15 text-amber-300"
                          : "bg-white/[0.08] text-white"
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${
                      active ? "bg-black/25" : "bg-white/[0.05]"
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Metodo pills — PIX / Cartão / Todos */}
          <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 p-1">
            {(
              [
                { key: "ALL" as const, label: "Todos" },
                { key: "pix" as const, label: "PIX" },
                { key: "card" as const, label: "Cartão" },
              ]
            ).map((opt) => {
              const active = methodFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMethodFilter(opt.key)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? opt.key === "pix"
                        ? "bg-emerald-400/15 text-emerald-300"
                        : opt.key === "card"
                          ? "bg-sky-400/15 text-sky-300"
                          : "bg-white/[0.08] text-white"
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  {opt.key === "pix" ? (
                    <Activity className="size-3.5" />
                  ) : opt.key === "card" ? (
                    <CreditCard className="size-3.5" />
                  ) : null}
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Periodo pills — Calendario / Hoje / 7d / 30d / Tudo */}
          <div className="relative inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 p-1">
            {/* Icone de calendario clicavel — abre BpDatePicker custom
                com tema do gateway (08/07/2026 david: "crie um calendario
                com a tema do gateway e nao esse que parece algum qualquer").
                Antes usava input[type=date].showPicker() nativo. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                title="Escolher data específica"
                aria-label="Escolher data específica"
                className={`ml-1 inline-flex size-7 items-center justify-center rounded-full transition ${
                  periodFilter === "custom" || pickerOpen
                    ? "bg-cyan-400/15 text-cyan-300"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Calendar className="size-3.5" />
              </button>
              {pickerOpen && (
                <BpDatePicker
                  value={customDate}
                  onChange={(v) => {
                    setCustomDate(v);
                    if (v) setPeriodFilter("custom");
                    else if (periodFilter === "custom") setPeriodFilter("all");
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
            {periodFilter === "custom" && customDate && (
              <button
                type="button"
                onClick={() => {
                  setCustomDate("");
                  setPeriodFilter("all");
                }}
                className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white transition"
                title="Limpar data especifica"
              >
                {new Date(customDate + "T00:00:00").toLocaleDateString(
                  "pt-BR",
                  { day: "2-digit", month: "2-digit", year: "2-digit" },
                )}
                <X className="size-3" />
              </button>
            )}
            {(
              [
                { key: "today" as const, label: "Hoje" },
                { key: "7d" as const, label: "7 dias" },
                { key: "30d" as const, label: "30 dias" },
                { key: "all" as const, label: "Tudo" },
              ]
            ).map((opt) => {
              const active = periodFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPeriodFilter(opt.key);
                    setCustomDate("");
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* 29/07/2026 (davi): filtro por PRODUTO */}
          {products.length > 0 && (
            <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 pr-1 pl-3">
              <span className="text-[11px] text-zinc-500">Produto:</span>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className={`rounded-full bg-transparent py-1.5 pl-1 pr-2 text-xs focus:outline-none max-w-[180px] truncate ${
                  productFilter !== "ALL"
                    ? "text-white font-semibold"
                    : "text-zinc-400"
                }`}
              >
                <option value="ALL">Todos</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 29/07/2026 (davi): filtro por OFERTA (checkout) — so aparece
              quando produto especifico ta selecionado */}
          {productFilter !== "ALL" && checkoutOptions.length > 0 && (
            <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 pr-1 pl-3">
              <span className="text-[11px] text-zinc-500">Oferta:</span>
              <select
                value={checkoutFilter}
                onChange={(e) => setCheckoutFilter(e.target.value)}
                className={`rounded-full bg-transparent py-1.5 pl-1 pr-2 text-xs focus:outline-none max-w-[200px] truncate ${
                  checkoutFilter !== "ALL"
                    ? "text-white font-semibold"
                    : "text-zinc-400"
                }`}
              >
                <option value="ALL">Todas</option>
                {checkoutOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    /{c.slug}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro: só vendas com comprovante (aparece se houver ao menos 1). */}
          {receiptCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyReceipts((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                onlyReceipts
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Paperclip className="size-3.5" />
              Com comprovante ({receiptCount})
            </button>
          )}

          {/* Faixa de valor (seção 5). Dois campos curtos na mesma barra das
              pills, pra não virar outro bloco de filtros com visual próprio —
              a seção 35 pede um padrão só. */}
          <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-1">
            <span className="pl-1 text-[11px] text-zinc-500">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={minReais}
              onChange={(e) => setMinReais(e.target.value)}
              placeholder="mín"
              aria-label="Valor mínimo"
              className="w-14 bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
            />
            <span className="text-[11px] text-zinc-600">–</span>
            <input
              type="text"
              inputMode="decimal"
              value={maxReais}
              onChange={(e) => setMaxReais(e.target.value)}
              placeholder="máx"
              aria-label="Valor máximo"
              className="w-14 bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>

          {/* Botao "Limpar filtros" — aparece so se tem 2+ filtros ativos */}
          {activeFiltersCount >= 2 && (
            <button
              type="button"
              onClick={() => {
                // Reset volta pro DEFAULT "ALL" (Todas), igual carga inicial.
                setStatusFilter("ALL");
                setMethodFilter("ALL");
                setPeriodFilter("all");
                setCustomDate("");
                setOnlyReceipts(false);
                setMinReais("");
                setMaxReais("");
                setProductFilter("ALL");
                setCheckoutFilter("ALL");
                setQuery("");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            >
              <X className="size-3" /> Limpar filtros
            </button>
          )}

          {/* Contador de resultado — subtil */}
          <span className="ml-auto text-[11px] text-zinc-500 tabular-nums">
            {list.length} de {transactions.length}
          </span>
        </div>
      </div>
      {/* Resumo do teste A/B — vendas por braço. Indica qual converte mais. */}
      {abA + abB > 0 && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs">
          <span className="font-semibold text-zinc-400">Teste A/B:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 font-semibold text-sky-300">
            A {abA}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-300">
            B {abB}
          </span>
          {abA !== abB && (
            <span className="text-zinc-500">
              · {abB > abA ? "B" : "A"} na frente
            </span>
          )}
        </div>
      )}
      {/* overflow-x-auto + min-w-[760px] no inner: em mobile o layout
        * vira flex coluna (col-span-* sao md:); em md+ a tabela grid
        * sempre tem espaco minimo pra nao cortar colunas (data/cliente
        * /produto/etc) em laptops com sidebar aberta.
        * bp-in-rows (07/07/2026, david): cascata nas linhas — header + 12
        * primeiras linhas entram em ondas depois que a pagina materializou. */}
      {/* `filtrando` esmaece a tabela em vez de trocar por spinner: a consulta
          leva alguns centésimos e substituir a lista por um vazio faria a tela
          piscar a cada tecla digitada na busca. */}
      <div
        className={`bp-in-rows rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto transition-opacity ${
          filtrando ? "opacity-50" : ""
        }`}
      >
        {filtroError && (
          <div className="flex items-center justify-between gap-3 border-b border-red-400/20 bg-red-400/[0.06] px-5 py-2.5 text-[12px] text-red-300">
            <span>{filtroError}</span>
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Tentar de novo
            </button>
          </div>
        )}
        {/* Header (tabela) — escondido em mobile */}
        <div className="hidden md:grid md:min-w-[760px] grid-cols-12 gap-4 border-b border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <span className="col-span-2">Data</span>
          <span className="col-span-2">Cliente</span>
          <span className="col-span-2">Produto</span>
          <span className="col-span-1">Método</span>
          <span className="col-span-2">Nominal</span>
          <span className="col-span-1">Valor</span>
          <span className="col-span-1">UTM</span>
          <span className="col-span-1 text-right">Status</span>
        </div>
        {list.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-400">
              {activeFiltersCount === 0
                ? "Nenhuma venda registrada ainda."
                : q.length > 0
                  ? `Nenhuma venda combina com "${query}".`
                  : "Nenhuma venda combina com os filtros aplicados."}
            </p>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setMethodFilter("ALL");
                  setPeriodFilter("all");
                  setCustomDate("");
                  setOnlyReceipts(false);
                  setQuery("");
                }}
                className="mt-3 text-xs text-cyan-300 hover:text-cyan-200 underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
        {list.map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(t)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelected(t);
              }
            }}
            className="w-full cursor-pointer border-b border-white/[0.04] text-sm last:border-b-0 hover:bg-white/[0.025] transition text-left
              flex flex-col gap-2 px-4 py-3
              md:grid md:min-w-[760px] md:grid-cols-12 md:gap-4 md:px-5 md:items-center"
          >
            {/* MOBILE: top row — valor + status (proeminentes), data à direita */}
            <div className="flex items-center justify-between gap-3 md:hidden">
              <span className="font-mono text-base font-bold text-white">
                {formatBRL(t.amountCents)}
              </span>
              <span className="flex items-center gap-1.5">
                {t.receiptUrl && (
                  <Paperclip
                    className="size-3.5 text-cyan-400"
                    aria-label="Comprovante enviado"
                  />
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${statusStyles[t.status] ?? "bg-zinc-700/40 text-zinc-400"}`}
                >
                  {t.status}
                </span>
              </span>
            </div>
            {/* MOBILE: cliente + produto (+ botão WhatsApp do lead) */}
            <div className="md:hidden flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white truncate font-medium">{t.customerName ?? "—"}</p>
                <p className="text-xs text-zinc-500 truncate">{t.customerEmail}</p>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{t.productName}</p>
              </div>
              <WhatsappRowButtons
                tx={t}
                template={template}
                onEdit={() => setEditorOpen(true)}
              />
            </div>
            {/* MOBILE: footer — método + adquirente + data + utm */}
            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 md:hidden">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="rounded-full bg-white/[0.05] px-2 py-0.5 uppercase">{t.method}</span>
                <NominalBadge nominal={t.nominal} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.utmSource && (
                  <span className="rounded-full bg-blue-400/15 px-2 py-0.5 text-blue-300">
                    {t.utmSource}
                  </span>
                )}
                <span>{formatDate(new Date(t.createdAt))}</span>
              </div>
            </div>

            {/* DESKTOP: layout tabular original */}
            <div className="hidden md:block col-span-2 text-xs text-zinc-400">
              {formatDate(new Date(t.createdAt))}
            </div>
            <div className="hidden md:flex col-span-2 min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white truncate">{t.customerName ?? "—"}</p>
                <p className="text-xs text-zinc-500 truncate">{t.customerEmail}</p>
              </div>
              <WhatsappRowButtons
                tx={t}
                template={template}
                onEdit={() => setEditorOpen(true)}
              />
            </div>
            <div className="hidden md:block col-span-2 text-zinc-300 truncate">{t.productName}</div>
            <div className="hidden md:block col-span-1 text-zinc-400 text-xs">{t.method}</div>
            <div className="hidden md:flex col-span-2 min-w-0">
              <NominalBadge nominal={t.nominal} />
            </div>
            <div className="hidden md:block col-span-1 font-mono text-xs text-white">
              {formatBRL(t.amountCents)}
            </div>
            <div className="hidden md:block col-span-1 text-xs truncate">
              {t.utmSource ? (
                <span className="rounded-full bg-blue-400/15 px-2 py-0.5 text-[10px] text-blue-300">
                  {t.utmSource}
                </span>
              ) : (
                <span className="text-zinc-700">—</span>
              )}
            </div>
            <div className="hidden md:flex col-span-1 justify-end items-center gap-1">
              {t.receiptUrl && (
                <Paperclip
                  className="size-3 text-cyan-400"
                  aria-label="Comprovante enviado"
                />
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${statusStyles[t.status] ?? "bg-zinc-700/40 text-zinc-400"}`}
              >
                {t.status}
              </span>
              <ChevronRight className="size-3 text-zinc-600" />
            </div>
          </div>
        ))}
        {/* PAGINAÇÃO: botão "Ver mais".
            08/08/2026: o comentário antigo dizia que o botão sumia quando
            havia filtro ativo, "pra não confundir ver mais com encontrar em
            não carregadas". Essa confusão deixou de existir quando o filtro
            passou a rodar no banco: `hasMore` agora descreve o RECORTE, e
            "ver mais" traz a próxima página do que está filtrado. */}
        {hasMore && list.length > 0 && (
          <div className="border-t border-white/[0.04] px-4 py-4 md:px-5">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Carregando…
                  </>
                ) : (
                  <>
                    Ver mais 50 vendas
                    <ChevronRight className="size-3.5" />
                  </>
                )}
              </button>
              <p className="text-[10px] text-zinc-600">
                {transactions.length} carregadas · há mais no histórico
              </p>
              {loadMoreError && (
                <p className="text-[11px] text-red-300">{loadMoreError}</p>
              )}
            </div>
          </div>
        )}
        {!hasMore && transactions.length > 50 && (
          <div className="px-4 py-3 md:px-5 text-center text-[10px] text-zinc-600">
            Fim do histórico · {transactions.length} vendas carregadas
          </div>
        )}
      </div>

      {selected && (
        <TransactionDetailModal
          tx={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {editorOpen && (
        <WhatsappTemplateEditor
          initial={template}
          onClose={() => setEditorOpen(false)}
          onSaved={(tpl) => {
            setTemplate(tpl ?? DEFAULT_WA_TEMPLATE);
            setEditorOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Botão WhatsApp (abre conversa com o lead) + lápis pra editar a mensagem. */
function WhatsappRowButtons({
  tx,
  template,
  onEdit,
}: {
  tx: Tx;
  template: string;
  onEdit: () => void;
}) {
  const link = buildWaLink(tx, template);
  return (
    <span className="flex shrink-0 items-center gap-1">
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Abrir conversa no WhatsApp com o lead"
          className="inline-flex size-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300 transition hover:bg-emerald-500/25"
        >
          <MessageCircle className="size-3.5" />
        </a>
      ) : (
        <span
          title="Sem telefone válido nesta venda"
          className="inline-flex size-7 cursor-not-allowed items-center justify-center rounded-md bg-white/[0.03] text-zinc-700"
        >
          <MessageCircle className="size-3.5" />
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        title="Configurar a mensagem do WhatsApp"
        className="inline-flex size-7 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
      >
        <Pencil className="size-3" />
      </button>
    </span>
  );
}

/** Modal pra editar o template da mensagem do WhatsApp (salva no perfil). */
function WhatsappTemplateEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: string;
  onClose: () => void;
  onSaved: (tpl: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const PLACEHOLDERS = ["{nome}", "{produto}", "{valor}", "{status}"];

  function insert(ph: string) {
    setValue((v) => (v.endsWith(" ") || v.length === 0 ? v + ph : v + " " + ph));
  }

  function save() {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await saveWhatsappQuickTemplate(value);
        onSaved(res.template);
      } catch {
        setErr("Não foi possível salvar. Tente novamente.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-lg flex-col rounded-t-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
              <MessageCircle className="size-4 text-emerald-300" />
              Mensagem do WhatsApp
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Essa mensagem é enviada ao abrir o WhatsApp do lead em cada venda.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-6">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder={DEFAULT_WA_TEMPLATE}
            className="w-full resize-none rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-400/40"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-zinc-500">Inserir:</span>
            {PLACEHOLDERS.map((ph) => (
              <button
                key={ph}
                type="button"
                onClick={() => insert(ph)}
                className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-zinc-300 transition hover:bg-white/[0.12]"
              >
                {ph}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-600">
            {"{nome}"} = nome do cliente · {"{produto}"} = produto · {"{valor}"} =
            valor da venda · {"{status}"} = status (PAID, PENDING…)
          </p>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Salvar mensagem
          </button>
        </div>
      </div>
    </div>
  );
}

function TransactionDetailModal({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const [tab, setTab] = useState<"venda" | "cliente" | "tracking">("venda");
  const [copied, setCopied] = useState<string | null>(null);

  function copy(key: string, val: string) {
    navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col rounded-t-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl sm:rounded-2xl sm:max-h-[90vh]">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4 shrink-0">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Detalhes da transação
            </p>
            <p className="mt-0.5 font-mono text-sm text-yellow-300">
              #{tx.id.slice(-10)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex border-b border-white/[0.06] shrink-0">
          {(
            [
              { key: "venda" as const, label: "Venda", Icon: CreditCard },
              { key: "cliente" as const, label: "Cliente", Icon: UserIcon },
              { key: "tracking" as const, label: "Tracking", Icon: Activity },
            ]
          ).map((t) => {
            const Icon = t.Icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition ${
                  tab === t.key
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-zinc-400 hover:text-white"
                }`}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {tab === "venda" && (
            <>
              {/* 09/08/2026, seção 5: "copiar ID". Os dois IDs eram texto
                  puro e o seller selecionava na mão — num id de 25 caracteres
                  isso erra uma letra e a busca no PSP não acha nada. A função
                  `copy` já existia aqui, usada só pro copia-e-cola do PIX. */}
              <Row label="ID da Transação">
                <CopiarId
                  valor={tx.id}
                  copiado={copied === "txid"}
                  onCopiar={() => copy("txid", tx.id)}
                />
              </Row>
              {/* Provider ID VOLTOU 21/07/2026 (david: sempre mostrar).
                  Usado pra bater a venda no painel do PSP em auditoria. */}
              {tx.providerId && (
                <Row label="ID no Provedor">
                  <CopiarId
                    valor={tx.providerId}
                    copiado={copied === "provid"}
                    onCopiar={() => copy("provid", tx.providerId!)}
                  />
                </Row>
              )}
              <Row label="Status">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[tx.status] ?? "bg-zinc-700/40 text-zinc-400"}`}
                >
                  {tx.status}
                </span>
              </Row>
              <Row label="Produto">
                <span className="text-white">{tx.productName}</span>
              </Row>
              <Row label="Método">
                <span className="text-zinc-200">{tx.method}</span>
              </Row>
              <Row label="Nominal">
                <NominalBadge nominal={tx.nominal} />
              </Row>
              <Row label="Valor Bruto">
                <span className="font-mono text-white">{formatBRL(tx.amountCents)}</span>
              </Row>
              <Row label="Taxa">
                <span className="font-mono text-zinc-400">{formatBRL(tx.feeCents)}</span>
              </Row>
              <Row label="Valor Líquido">
                <span className="font-mono text-cyan-300 font-semibold">
                  {formatBRL(tx.netCents)}
                </span>
              </Row>
              <Row label="Data de Criação">
                <span className="text-zinc-200">
                  {formatDate(new Date(tx.createdAt))}
                </span>
              </Row>
              {tx.paidAt && (
                <Row label="Data do Pagamento">
                  <span className="text-zinc-200">
                    {formatDate(new Date(tx.paidAt))}
                  </span>
                </Row>
              )}
              {tx.pixCopyPaste && (
                <div className="pt-2 border-t border-white/[0.04]">
                  <p className="text-xs text-zinc-400 mb-1.5">PIX Copia e Cola</p>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={tx.pixCopyPaste}
                      rows={3}
                      className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-[11px] text-zinc-300 font-mono resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => copy("pix", tx.pixCopyPaste!)}
                      className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] text-zinc-200 hover:bg-white/[0.12]"
                    >
                      {copied === "pix" ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {copied === "pix" ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}
              {tx.receiptUrl && (
                <div className="pt-2 border-t border-white/[0.04]">
                  <p className="text-xs text-zinc-400 mb-1.5">
                    Comprovante enviado pelo cliente
                  </p>
                  <a
                    href={tx.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-3 rounded-lg border border-white/[0.08] bg-black/30 p-2 hover:bg-white/[0.04] transition"
                  >
                    {/\.pdf(\?|$)/i.test(tx.receiptUrl) ? (
                      <span className="inline-flex size-12 items-center justify-center rounded-md bg-white/[0.06] text-zinc-300 text-[10px] font-bold">
                        PDF
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={tx.receiptUrl}
                        alt="Comprovante"
                        className="size-12 rounded-md object-cover bg-white/[0.06]"
                      />
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-cyan-300 group-hover:underline">
                      <ExternalLink className="size-3.5" /> Abrir comprovante
                    </span>
                  </a>
                </div>
              )}
              {tx.abVariant && (
                <div className="pt-2 border-t border-white/[0.04]">
                  <p className="text-xs text-zinc-400 mb-1.5">Teste A/B</p>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
                      tx.abVariant === "B"
                        ? "bg-violet-500/15 text-violet-300"
                        : "bg-sky-500/15 text-sky-300"
                    }`}
                  >
                    Braço {tx.abVariant}
                    {tx.abTemplate ? ` · ${tx.abTemplate}` : ""}
                  </span>
                </div>
              )}

              {/* LINHA DO TEMPO (seção 5). Derivada dos carimbos que a própria
                  transação já tem — não é log de eventos. O porquê está em
                  ./timeline.tsx. */}
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Linha do tempo
                </p>
                <Timeline eventos={montarEventos(tx)} />
              </div>
            </>
          )}

          {tab === "cliente" && (
            <>
              <Row label="Nome">
                <span className="text-white">{tx.customerName ?? "—"}</span>
              </Row>
              <Row label="Email">
                <span className="text-zinc-200">{tx.customerEmail}</span>
              </Row>
              <Row label="Telefone">
                <span className="text-zinc-200">{tx.customerPhone ?? "—"}</span>
              </Row>
              <Row label="CPF / CNPJ">
                <span className="font-mono text-zinc-300">
                  {tx.customerCpf ?? "—"}
                </span>
              </Row>
              <Row label="IP">
                <span className="font-mono text-zinc-400 text-xs">
                  {tx.customerIp ?? "—"}
                </span>
              </Row>
              {/* Endereco — produtos digitais nao coletam, fica "—" */}
              <Row label="CEP">
                <span className="font-mono text-zinc-200">
                  {tx.customerCep ? formatCep(tx.customerCep) : "—"}
                </span>
              </Row>
              {(tx.customerAddress ||
                tx.customerCity ||
                tx.customerState) && (
                <>
                  <Row label="Endereço">
                    <span className="text-zinc-200 text-right">
                      {[
                        tx.customerAddress,
                        tx.customerNumber,
                        tx.customerComplement,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </Row>
                  <Row label="Bairro / Cidade">
                    <span className="text-zinc-200 text-right">
                      {[
                        tx.customerNeighborhood,
                        tx.customerCity,
                        tx.customerState,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </Row>
                </>
              )}
            </>
          )}

          {tab === "tracking" && (
            <>
              <SectionTitle>UTMs</SectionTitle>
              <Row label="utm_source">
                <UtmBadge value={tx.utmSource} />
              </Row>
              <Row label="utm_medium">
                <UtmBadge value={tx.utmMedium} />
              </Row>
              <Row label="utm_campaign">
                <UtmBadge value={tx.utmCampaign} />
              </Row>
              <Row label="utm_content">
                <UtmBadge value={tx.utmContent} />
              </Row>
              <Row label="utm_term">
                <UtmBadge value={tx.utmTerm} />
              </Row>

              <SectionTitle>Click IDs</SectionTitle>
              <Row label="fbclid (Facebook)">
                <span className="font-mono text-xs text-zinc-300 break-all">
                  {tx.fbclid ?? "—"}
                </span>
              </Row>
              <Row label="ttclid (TikTok)">
                <span className="font-mono text-xs text-zinc-300 break-all">
                  {tx.ttclid ?? "—"}
                </span>
              </Row>
              <Row label="gclid (Google)">
                <span className="font-mono text-xs text-zinc-300 break-all">
                  {tx.gclid ?? "—"}
                </span>
              </Row>

              <SectionTitle>Origem</SectionTitle>
              <Row label="Domínio">
                <span className="font-mono text-xs text-zinc-300 break-all">
                  {tx.originHost ?? "—"}
                </span>
              </Row>
              <Row label="Path / slug">
                <span className="font-mono text-xs text-zinc-300 break-all">
                  {tx.originPath ?? "—"}
                </span>
              </Row>
              {tx.originHost && tx.originPath &&
                !tx.originPath.startsWith("api:") &&
                !tx.originPath.startsWith("cron:") &&
                !tx.originPath.startsWith("dashboard:") && (
                  <Row label="URL completa">
                    <a
                      href={`https://${tx.originHost}${tx.originPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-cyan-300 hover:text-cyan-200 break-all underline"
                    >
                      https://{tx.originHost}{tx.originPath}
                    </a>
                  </Row>
                )}

              {!tx.utmSource &&
                !tx.fbclid &&
                !tx.ttclid &&
                !tx.gclid && (
                  <div className="mt-4 rounded-lg border border-yellow-400/30 bg-yellow-400/[0.04] p-3 text-xs text-yellow-100/80">
                    💡 Sem UTMs capturadas. Verifique se sua landing page tem o
                    script <code className="text-cyan-300">utm-persist.js</code>{" "}
                    e se os anúncios estão usando os templates da aba Tutorial.
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold pt-2 inline-flex items-center gap-1">
      <Tag className="size-3" />
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-3 last:border-b-0">
      <span className="text-xs text-zinc-500 shrink-0">{label}</span>
      <span className="text-right max-w-[60%]">{children}</span>
    </div>
  );
}

function UtmBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-zinc-700 text-xs">—</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-blue-400/15 px-2 py-0.5 text-[11px] font-medium text-blue-300 font-mono">
      {value}
    </span>
  );
}

/**
 * Calendario custom com tema do gateway (08/07/2026, david: "crie um
 * calendario com a tema do gateway e nao esse que parece algum qualquer").
 * Antes usava input[type=date].showPicker() nativo — visual branco/azul
 * do browser destoava do dashboard preto+verde.
 *
 * Comportamento:
 * - Popover ancorado no botao de calendario, tema neon verde.
 * - Nav de mes (prev/next) + ano.
 * - Semanas em pt-BR (D S T Q Q S S — inicio domingo).
 * - Dia atual: circulo ciano discreto.
 * - Dia selecionado: bg ciano + texto preto.
 * - Click fora fecha. Escape fecha.
 * - Botoes "Hoje" e "Limpar" no rodape.
 */
function BpDatePicker({
  value,
  onChange,
  onClose,
}: {
  value: string; // YYYY-MM-DD ou ""
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Mes/ano em vista (default: mes do value selecionado, ou mes atual).
  const initial = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0-11

  // Click fora + escape fecha.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    // Delay 0 pra nao capturar o click que abriu o popover.
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      clearTimeout(t);
    };
  }, [onClose]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" },
  );

  // Primeiro dia do mes (day of week) — 0=Sunday.
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  // Grid de 6 semanas × 7 dias (42 celulas). Preenche com dias do
  // mes anterior/proximo pra mostrar o mes inteiro sem "buracos".
  const cells: Array<{ day: number; inMonth: boolean; iso: string }> = [];
  for (let i = 0; i < firstDay; i++) {
    const d = daysInPrevMonth - firstDay + 1 + i;
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({
      day: d,
      inMonth: false,
      iso: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      inMonth: true,
      iso: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({
      day: d,
      inMonth: false,
      iso: `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  const todayIso = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }
  function goToday() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    onChange(todayIso);
    onClose();
  }
  function clear() {
    onChange("");
    onClose();
  }

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-2xl border border-cyan-400/25 bg-black/95 p-3 shadow-[0_20px_60px_-15px_rgba(34, 211, 238,0.25)] backdrop-blur-md animate-bp-popover-in-top"
    >
      {/* Header: mes/ano + navegacao */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="text-[13px] font-semibold text-white capitalize">
          {monthLabel}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={prevMonth}
            className="inline-flex size-7 items-center justify-center rounded-full text-zinc-400 hover:bg-cyan-400/[0.08] hover:text-cyan-300 transition"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="inline-flex size-7 items-center justify-center rounded-full text-zinc-400 hover:bg-cyan-400/[0.08] hover:text-cyan-300 transition"
            aria-label="Proximo mes"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Cabecalho dos dias (D S T Q Q S S) */}
      <div className="grid grid-cols-7 gap-1 px-1 pb-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 gap-1 px-1">
        {cells.map((c, i) => {
          const isSelected = c.iso === value;
          const isToday = c.iso === todayIso;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(c.iso);
                onClose();
              }}
              className={`h-8 rounded-lg text-[12px] font-medium tabular-nums transition ${
                isSelected
                  ? "bg-cyan-400 text-black shadow-[0_0_16px_-2px_rgba(34, 211, 238,0.6)]"
                  : c.inMonth
                    ? isToday
                      ? "text-cyan-300 ring-1 ring-inset ring-cyan-400/40 hover:bg-cyan-400/[0.12]"
                      : "text-zinc-200 hover:bg-cyan-400/[0.08] hover:text-cyan-300"
                    : "text-zinc-600 hover:bg-white/[0.03]"
              }`}
              aria-label={c.iso}
            >
              {c.day}
            </button>
          );
        })}
      </div>

      {/* Rodape: Hoje + Limpar */}
      <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2 px-1">
        <button
          type="button"
          onClick={clear}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-white transition"
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={goToday}
          className="rounded-full bg-cyan-400/15 px-3 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-400/25 transition"
        >
          Hoje
        </button>
      </div>
    </div>
  );
}

/**
 * Id com botão de copiar.
 *
 * O retorno visual troca o ícone por um check por 2s — sem isso o clique não
 * dá sinal nenhum e a pessoa clica de novo achando que falhou.
 */
function CopiarId({
  valor,
  copiado,
  onCopiar,
}: {
  valor: string;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopiar}
      title="Copiar"
      aria-label={copiado ? "Copiado" : `Copiar ${valor}`}
      className="group inline-flex max-w-full items-center gap-1.5 rounded text-left transition hover:text-cyan-300"
    >
      <span className="truncate font-mono text-xs text-white">{valor}</span>
      {copiado ? (
        <Check className="size-3 shrink-0 text-cyan-400" />
      ) : (
        <Copy className="size-3 shrink-0 text-zinc-600 transition group-hover:text-cyan-400" />
      )}
    </button>
  );
}
