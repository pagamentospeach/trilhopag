"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  Box,
  Wallet,
  Store,
  Cable,
  Plug,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  QrCode,
  Repeat,
  Search,
  X,
} from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import { SidebarBalanceLive } from "@/components/dashboard/sidebar-balance-live";
import type { AccountSwitch } from "@/lib/effective-user";

type Item = {
  label: string;
  /** href é obrigatório pra items normais; ausente pra items com children (grupo expansível) */
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: "Beta" | "Novo" | "REC";
  external?: boolean;
  /** Sub-items — quando presente, este item vira grupo expansível (ex: Sua Loja) */
  children?: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
    badge?: "Beta" | "Novo" | "REC";
    /** Abre em nova aba (ex: Documentação, que mora fora do dashboard). */
    external?: boolean;
    /** Card "$" de divulgação paga com tooltip (não usado atualmente). */
    adBadge?: boolean;
  }>;
};

type Group = {
  key: string;
  label: string;
  items: Item[];
};

/**
 * SIDEBAR ENXUTA (06/08/2026, davi) — modelo PinguPag.
 *
 * "vamos copiar essa aba da PinguPag (outro gateway white label da trilho) ...
 *  TUDO QUE NAO FOI CITADO AI PODE APAGAR (todas as sidebars nao citadas)
 *  ex: sugestoes, aparencias TUDO QUE NAO FOI CITADO!"
 *
 * Fica SÓ o que ele citou: Resumo, Financeiro, Sua Loja (Produtos, Cobranças,
 * Adquirentes, Domínios, Minha Rede) e Integração (Conectores, Documentação).
 *
 * Saíram da sidebar: Vendas e Saques (fundidas em Financeiro), Reembolsos,
 * Ferramentas inteira (Best Tracker, Hospedagem VSL, Camuflagens, Área de
 * Membros), Aparência e Sugestões.
 *
 * Minha Rede VOLTOU em 06/08/2026 ("volta com a aba de minha rede abaixo da
 * aba dominios em sua loja!") — agora dentro de Sua Loja, embaixo de Domínios.
 *
 * AS ROTAS CONTINUAM VIVAS — só sumiram do menu. Emails, push e links
 * internos antigos apontam pra várias delas (/dashboard/vendas está em
 * email-templates.ts e push.ts, por ex). Matar os arquivos quebraria esses
 * links num gateway em produção; tirar do menu entrega o que ele pediu
 * ("todas as sidebars nao citadas") sem risco.
 *
 * Um grupo só, sem cabeçalho (label ""), igual ao print: os items ficam
 * soltos no topo e "Sua Loja"/"Integração" são expansíveis.
 *
 * ⚠️ 08/08/2026 — CLIENTES ENTROU. Isto CONTRARIA em parte o "tudo que não foi
 * citado pode apagar" de 06/08, e é deliberado: veio do prompt de revamp que o
 * davi encaminhou depois ("Clientes: essa deve ser uma área completa (...) isso
 * transforma o Trilho em uma plataforma de gestão, e não apenas um gateway").
 * Instrução mais recente ganha da anterior, mas fica registrado que houve
 * conflito, pra ninguém achar que a limpeza foi desfeita por descuido.
 *
 * O que NÃO mudou de propósito: nenhuma rota foi renomeada. O prompt propõe
 * caminhos em inglês (/dashboard/sales/transactions, /dashboard/customers). O
 * painel está em produção há meses e essas URLs aparecem em email
 * (lib/email-templates.ts), em push (lib/push.ts) e no que os sellers têm
 * salvo. Renomear entregaria uma árvore mais bonita e uma pilha de links
 * mortos. A hierarquia que o prompt pede é de MENU, e menu a gente reagrupa
 * sem tocar em href.
 */
const GROUPS: Group[] = [
  {
    key: "main",
    label: "",
    items: [
      { label: "Resumo", href: "/dashboard", icon: LayoutDashboard, exact: true },
      { label: "Financeiro", href: "/dashboard/financeiro", icon: Wallet },
      // Fora de "Sua Loja" e no primeiro nível: Clientes responde "quem está
      // comprando", que é pergunta de operação, não de catálogo. Enfiar dentro
      // da loja custaria um clique a mais na aba que o prompt aponta como uma
      // das cinco que mais mudam a percepção do produto.
      // Ao lado de Clientes e nao dentro de "Sua Loja": Analytics responde
      // "como foi", que e pergunta de operacao. Mesma logica que pos Clientes
      // no primeiro nivel.
      {
        label: "Sua Loja",
        icon: Store,
        children: [
          { label: "Produtos", href: "/dashboard/produtos", icon: Box },
          // Logo abaixo de Produtos porque assinatura É um produto vendendo
          // em ciclo — a pergunta que ela responde ("o que estou vendendo de
          // recorrente") é de catálogo, não de operação. Por isso fica aqui e
          // Clientes fica no primeiro nível.
          { label: "Assinaturas", href: "/dashboard/assinaturas", icon: Repeat },
          { label: "Cobranças", href: "/dashboard/cobrancas", icon: QrCode },
          // Links de pagamento e uma VISAO sobre os checkouts que ja existem
          // (nao ha entidade nova). Fica em "Sua Loja" porque a pergunta que
          // responde e "o que estou vendendo e por onde".
          { label: "Domínios", href: "/dashboard/dominios", icon: Globe },
          // 06/08/2026 (davi): "volta com a aba de minha rede abaixo da aba
          // dominios em sua loja!". Tinha saído na limpeza do modelo PinguPag
        ],
      },
      // Configuracoes por ultimo, que e onde se procura ajuste: e indice, nao
      {
        label: "Integração",
        icon: Plug,
        children: [
          // Renomeada de "Integrações" pra "Conectores" (davi). Rota igual.
          { label: "Conectores", href: "/dashboard/integracoes", icon: Cable },
          {
            label: "Documentação",
            href: "https://trilhopag.com/docs",
            icon: FileText,
            external: true,
          },
        ],
      },
    ],
  },
];

const MIN_WIDTH = 64;
const COLLAPSED_WIDTH = 64;
/**
 * 06/08/2026 (davi, 2ª rodada): "Aumenta mais um pouco tudo dessa barra
 * lateral, ta muito pequeninho!". Subiu de 256 → 288 porque o texto dos items
 * foi pra 17px: na largura antiga "Documentação" e "Adquirentes" começavam a
 * truncar (`truncate` no span) e o remédio ficava pior que a doença.
 */
const DEFAULT_WIDTH = 288;
const MAX_WIDTH = 400;
/**
 * v3 (não v2): a largura mora no localStorage, então quem já usou a dashboard
 * tem `{"width":256}` gravado e continuaria vendo a sidebar velha por mais que
 * o DEFAULT_WIDTH mudasse — foi exatamente o que fez a 1ª tentativa de aumentar
 * parecer que não tinha sido feita. Trocar a chave descarta o estado antigo uma
 * única vez; o seller redimensiona de novo se quiser.
 */
const LS_KEY = "tp_sidebar_v3";

type SidebarState = {
  width: number;
  collapsed: boolean;
  collapsedGroups: Record<string, boolean>;
  /** Items expansíveis (children) — true = expandido */
  expandedItems: Record<string, boolean>;
};

function loadState(): SidebarState {
  if (typeof window === "undefined") {
    return {
      width: DEFAULT_WIDTH,
      collapsed: false,
      collapsedGroups: {},
      expandedItems: {},
    };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        width: Math.min(Math.max(parsed.width ?? DEFAULT_WIDTH, MIN_WIDTH), MAX_WIDTH),
        collapsed: !!parsed.collapsed,
        collapsedGroups: parsed.collapsedGroups ?? {},
        expandedItems: parsed.expandedItems ?? {},
      };
    }
  } catch {
    // ignore
  }
  return {
    width: DEFAULT_WIDTH,
    collapsed: false,
    collapsedGroups: {},
    expandedItems: {},
  };
}

function saveState(s: SidebarState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

/**
 * Mapa label em pt-BR (hardcoded em GROUPS) → chave i18n. Quando o user
 * troca o idioma, lookup aqui pra traduzir. Se a chave não existir, mantém
 * o label original (gracioso fallback).
 */
const LABEL_TO_I18N_KEY: Record<string, string> = {
  "Resumo": "inicio",
  // 10/08/2026 (davi): "Tira isso de / bots. Deixa somente produtos!" — o
  // texto voltou a ser só "Produtos" em messages/pt-BR (sidebar.produtos).
  // A chave deste mapa continua sendo o label CRU de GROUPS; renomear ela
  // quebraria o lookup e a aba cairia no fallback sem tradução.
  "Produtos": "produtos",
  "Adquirentes": "adquirentes",
  "Domínios": "dominios",
  "Minha Rede": "minhaRede",
  // Sellers em pixOpsMode=hot veem "Produtos" renomeado pra "Bots" — override
  // mais específico que o "Produtos / Bots" geral, e continua valendo: quem
  // está em hot só tem bots ali dentro mesmo.
  "Bots": "bots",
};
/**
 * A sidebar enxuta tem UM grupo sem cabeçalho ("main"), então não há label de
 * grupo pra traduzir. O map fica só pra busca continuar casando por grupo.
 */
const GROUP_KEY_TO_I18N: Record<string, string> = {};

export function Sidebar({
  email,
  balanceCents,
  accounts,
  acquirerMode = "black",
  isPlayerDivulgador = false,
  isFriendAccount = false,
}: {
  email: string;
  balanceCents: number;
  accounts: AccountSwitch[];
  /** Modo de adquirente ativo (black/white/hot) — exibido no card da conta. */
  acquirerMode?: string;
  /** Quando true, renderiza item "Player Mode" no grupo Conta. */
  isPlayerDivulgador?: boolean;
  /** Quando true, mostra um selo discreto de conta amigo (tudo grátis). */
  isFriendAccount?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("sidebar");
  const tr = (label: string) => {
    const key = LABEL_TO_I18N_KEY[label];
    if (!key) return label;
    try {
      return t(key);
    } catch {
      return label;
    }
  };
  const trGroup = (groupKey: string) => {
    const key = GROUP_KEY_TO_I18N[groupKey];
    if (!key) return groupKey;
    try {
      return t(key);
    } catch {
      return groupKey;
    }
  };
  const [state, setState] = useState<SidebarState>(() => loadState());
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 06/08/2026 (davi): o modo de edição da sidebar (lápis → reordenar +
  // renomear abas) foi REMOVIDO junto com o editor da dashboard. Com 4 entradas
  // fixas não há o que reordenar, e ele foi explícito: "tira TODAS as opcoes
  // de editar, nao vai ter mais isso!".

  // Escuta o evento global disparado pelo hamburguer do topbar
  useEffect(() => {
    function onOpen() {
      setMobileOpen(true);
    }
    window.addEventListener("bp:sidebar-open", onOpen);
    return () => window.removeEventListener("bp:sidebar-open", onOpen);
  }, []);

  // Fecha o drawer quando muda de rota (navegação dentro do menu)
  useEffect(() => {
    setMobileOpen(false);
    setSearchQuery("");
  }, [pathname]);

  // Bloqueia scroll do body quando drawer aberto
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  const GROUPS_DYN: Group[] = useMemo(() => {
    let groups = GROUPS;
    // 30/07/2026 (davi): "Só aparece a aba de cobranças se o modo da conta
    // estiver black, na white / hot a aba de cobranças não aparece". Cobrança
    // avulsa é PIX gerado na mão pelo próprio seller — só faz sentido no
    // black. Escondido aqui E bloqueado no server (page + action), senão a
    // rota continuava acessível digitando a URL.
    //
    // 06/08/2026: Cobranças virou FILHA de "Sua Loja", então o filtro precisa
    // descer nos children — antes só olhava o nível de cima e a aba vazava
    // pra seller white/hot.
    if (acquirerMode !== "black") {
      groups = groups.map((g): Group => ({
        ...g,
        items: g.items
          .filter((i) => i.href !== "/dashboard/cobrancas")
          .map((i) =>
            i.children
              ? {
                  ...i,
                  children: i.children.filter(
                    (c) => c.href !== "/dashboard/cobrancas",
                  ),
                }
              : i,
          ),
      }));
    }
    // 23/07/2026 (davi): "Quando algum seller estiver no modo hot nas
    // adquirentes troca o nome da sidebar de produtos para Bots". Sellers
    // em pixOpsMode=hot usam a mesma rota /dashboard/produtos, mas listam
    // BOTS ali dentro (nao "produtos" de checkout tradicional).
    return groups;
  }, [acquirerMode]);

  // Índice ACHATADO de todas as abas (items + children) pra busca rápida.
  const flatItems = useMemo(
    () =>
      GROUPS_DYN.flatMap((g) =>
        g.items.flatMap((i) =>
          i.children
            ? i.children.map((c) => ({
                label: c.label,
                href: c.href,
                icon: c.icon,
                groupKey: g.key,
              }))
            : i.href
              ? [{ label: i.label, href: i.href, icon: i.icon, groupKey: g.key }]
              : [],
        ),
      ),
    [GROUPS_DYN],
  );

  // Busca: normaliza (sem acento, minúsculo) e casa por label da aba OU do
  // grupo — assim "dominio", "domínios", "catalogo" etc. todos acham.
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  const q = normalize(searchQuery);
  const filtered = q
    ? flatItems.filter(
        (it) =>
          normalize(tr(it.label)).includes(q) ||
          normalize(it.label).includes(q) ||
          normalize(trGroup(it.groupKey)).includes(q),
      )
    : [];

  // Best-match path detection (achata items + children)
  const allHrefs = GROUPS_DYN.flatMap((g) =>
    g.items.flatMap((i) =>
      i.children
        ? i.children.map((c) => c.href).filter(Boolean)
        : i.href
          ? [i.href]
          : [],
    ),
  ).filter((h): h is string => !!h);
  const bestMatch = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  function toggleGroup(key: string) {
    setState((s) => ({
      ...s,
      collapsedGroups: { ...s.collapsedGroups, [key]: !s.collapsedGroups[key] },
    }));
  }

  function toggleItem(label: string) {
    setState((s) => ({
      ...s,
      expandedItems: { ...s.expandedItems, [label]: !s.expandedItems[label] },
    }));
  }

  function toggleCollapse() {
    setState((s) => ({ ...s, collapsed: !s.collapsed }));
  }

  // Resize drag handle
  const dragging = useRef(false);
  function onDragStart(e: React.MouseEvent) {
    if (state.collapsed) return;
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const next = Math.min(Math.max(ev.clientX, MIN_WIDTH + 80), MAX_WIDTH);
      setState((s) => ({ ...s, width: next }));
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const collapsed = hydrated && state.collapsed;
  const width = collapsed ? COLLAPSED_WIDTH : state.width;

  return (
    <>
      {/* Backdrop mobile — só quando drawer aberto */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm md:hidden animate-in fade-in duration-150"
        />
      )}
      <aside
        className={cn(
          // ============ DESKTOP (md+) — sticky lateral, IDENTICO ao original ============
          // 29/07/2026 (davi): z-30 → z-40 pra ficar acima de qualquer coisa
          // absoluta que uma pagina child (ex: bot funnel canvas) crie.
          // 30/07/2026 (seller reincidente: sidebar nao clica dentro do funil):
          //   z-40 → z-[60]. O canvas do ReactFlow (bot funil) ganha
          //   pointer-capture com touch-action:none pra pan/zoom, e em
          //   algumas resolucoes a captura vazava por baixo da sidebar
          //   engolindo os cliques. z-60 + `isolation:isolate` no <aside>
          //   forcam a sidebar a ficar SEMPRE clicavel independente do que
          //   o canvas child fizer.
          // Modais internos (z-[100]+) continuam por cima da sidebar.
          "sticky top-0 z-[60] flex h-screen max-h-screen shrink-0 flex-col self-start border-r border-white/[0.06] bg-black/40 backdrop-blur transition-[width,transform,opacity] duration-150 isolate",
          // ============ MOBILE (<md) — overrides p/ virar drawer flutuante ============
          // Sai do flow do flex, vira fixed, slide via translate-x
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[60] max-md:!w-72 max-md:bg-black/95 max-md:transition-transform max-md:duration-200",
          mobileOpen
            ? "max-md:translate-x-0 max-md:shadow-2xl"
            : "max-md:-translate-x-full",
        )}
        style={{
          width,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
      {/* Resize handle (right edge) */}
      {!collapsed && (
        <div
          onMouseDown={onDragStart}
          className="group absolute -right-1 top-0 z-40 h-full w-2 cursor-ew-resize"
          aria-label="Redimensionar sidebar"
        >
          <div className="ml-0.5 h-full w-px bg-transparent transition group-hover:bg-cyan-400/40" />
        </div>
      )}

      {/* Header: logo + collapse toggle.
          `h-16` casa EXATO com a topbar (também h-16), que começa na mesma
          linha do topo. Antes era `pt-5 pb-3` + logo de 48px = 80px, e a marca
          ficava 16px abaixo do resto do cabeçalho.
          08/08/2026 (davi): "Diminua o tamanho tambem pra ficar alinhado com a
          barra superior". */}
      <div
        className={cn(
          "flex h-16 items-center gap-1.5 px-4",
          collapsed && "px-2 justify-center",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 font-semibold tracking-tight"
          title="Voltar pro dashboard"
        >
          {/* trilhopag-mark.png, NÃO logo2.png.
              08/08/2026 (davi): "A logo ainda ta com fundo no modo whitezao,
              era pra estar sem fundo". O logo2 é um disco: no escuro o fundo
              some no preto da sidebar, mas a variante clara (trocada por CSS
              em themes.css) tem disco BRANCO e anel ciano desenhados dentro do
              próprio PNG — nenhuma classe apaga isso. O mark é a marca sozinha
              com fundo transparente, então serve nos dois temas e o
              `rounded-full` deixa de fazer sentido.
              Sem o disco a marca ocupa a área toda, então 32px aqui lê maior
              que os 48px de antes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/trilhopag-mark.png"
            alt="Trilho"
            className={cn("shrink-0 object-contain", collapsed ? "size-7" : "size-8")}
          />
          {!collapsed && <span className="text-xl">Trilho</span>}
        </Link>
        {/* 06/08/2026 (davi): "esse icone para recolher a barra, troque ele por
            um icone de setinha de abrir e fechar!" — era PanelLeftClose, agora
            é a setinha: aponta pra esquerda pra fechar, pra direita pra abrir. */}
        {!collapsed && (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={toggleCollapse}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white transition"
              title="Recolher sidebar"
              aria-label="Recolher sidebar"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Collapsed: expand button below logo */}
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapse}
          className="mx-2 mb-2 rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.05] hover:text-white transition"
          title="Expandir sidebar"
          aria-label="Expandir sidebar"
        >
          <ChevronRight className="size-4 mx-auto" />
        </button>
      )}

      {/* Balance display */}
      <Link
        href="/dashboard/financeiro?tab=saidas"
        className={cn(
          "group relative block overflow-hidden transition",
          collapsed
            ? "mx-2 mb-3 rounded-lg border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-cyan-400/[0.02] p-2 hover:border-cyan-400/40 hover:from-cyan-400/15"
            : "mx-3 mb-3 rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/15 via-cyan-400/[0.06] to-transparent p-4 shadow-[0_0_24px_-8px_rgba(34, 211, 238,0.25)] hover:border-cyan-400/50 hover:shadow-[0_0_24px_-4px_rgba(34, 211, 238,0.4)]",
        )}
        title={collapsed ? `Saldo: ${formatBRL(balanceCents)}` : undefined}
      >
        {collapsed ? (
          <div className="flex justify-center">
            <Wallet className="size-5 text-cyan-300" />
          </div>
        ) : (
          <>
            <span className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-cyan-400/20 blur-2xl" />
            {/* 06/08/2026 (davi): "aumenta o tamanho do campo de saldo
                disponivel" — card p-3→p-4, valor xl→2xl (no
                SidebarBalanceLive).
                Logo em seguida: "pode dar uma diminuidinha nesse texto do
                campo de disponivel". O rótulo tinha ido pra 13px e, em caixa
                alta com tracking, "SALDO DISPONÍVEL" passou a encostar nas
                duas bordas do card. Voltou pra 11px — o card continua maior,
                só o texto que recuou. */}
            <p className="relative flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-cyan-300/90">
              <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Saldo disponível
            </p>
            <div className="relative">
              {/* privacyMode saiu da prop: o <SidebarBalanceLive> lê direto do
                  PrivacyModeProvider pra borrar no clique do olho, sem esperar
                  o server (davi, 06/08: "delay bizarro para censurar tudo"). */}
              <SidebarBalanceLive initialCents={balanceCents} />
            </div>
          </>
        )}
      </Link>

      {/* Selo discreto de conta amigo (tudo grátis no gateway) */}
      {isFriendAccount && !collapsed && (
        <div
          className="mx-3 mb-3 rounded-lg border border-pink-400/20 bg-pink-400/[0.05] px-3 py-2 text-[10px] font-medium text-pink-200/80"
          title="Conta amigo: todas as features pagas liberadas, sem cobrança."
        >
          Conta Especial para meus grandes amigos ❤️
        </div>
      )}

      {/* 🔎 Busca de abas — digite e vá direto pra aba que quer acessar */}
      {!collapsed && (
        <div className="mx-3 mb-3">
          <div className="group relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500 transition group-focus-within:text-cyan-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Enter" && filtered[0]) {
                  router.push(filtered[0].href);
                  setSearchQuery("");
                }
              }}
              placeholder="Buscar aba…"
              aria-label="Buscar aba"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-2.5 pl-9 pr-7 text-[15px] text-white placeholder:text-zinc-500 outline-none transition focus:border-cyan-400/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-cyan-400/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 06/08/2026 (davi: "pode tirar essa bolinha"): sem indicador de aba
          ativa nenhum. Quem marca a aba atual agora é só o próprio item —
          fundo ciano/10 e texto cyan-300. O `relative` saiu junto: ele existia
          só pra ancorar a bolinha (position: absolute) e não sobrou nenhum
          filho posicionado aqui dentro. */}
      <nav className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {!collapsed && searchQuery.trim() ? (
          filtered.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <Search className="mx-auto size-5 text-zinc-600" />
              <p className="mt-2 text-xs text-zinc-500">Nenhuma aba encontrada</p>
              <p className="mt-0.5 text-[11px] text-zinc-600">
                pra “{searchQuery}”
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((it) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setSearchQuery("")}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[17px] text-zinc-300 transition hover:bg-cyan-400/10 hover:text-cyan-300"
                  >
                    <Icon className="size-[22px] shrink-0 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3" />
                    <span className="flex-1 truncate text-left">
                      {tr(it.label)}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600 transition group-hover:text-cyan-400/60">
                      {trGroup(it.groupKey)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )
        ) : (
          GROUPS_DYN.map((group) => {
          const groupCollapsed = !!state.collapsedGroups[group.key];
          return (
            <div key={group.key}>
              {/* Grupo sem label (o "main" da sidebar enxuta) não desenha
                  cabeçalho — os items ficam soltos no topo, igual ao print. */}
              {!collapsed && group.label !== "" && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="group flex w-full items-center justify-between px-3 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.15em] text-zinc-500 hover:text-zinc-300 transition"
                >
                  <span>{trGroup(group.key)}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 transition",
                      groupCollapsed ? "-rotate-90" : "",
                    )}
                  />
                </button>
              )}
              <AnimatePresence initial={false}>
                {(!groupCollapsed || collapsed) && (
                  <motion.div
                    key="group-items"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    // Item com children = grupo expansível ("Extras")
                    if (item.children) {
                      const Icon = item.icon;
                      // SEMPRE pré-recolhido. Só expande se o user clicou.
                      // (Auto-expand quando bestMatch era child estava bugando
                      // o toggle — não conseguia recolher.)
                      const expanded = !!state.expandedItems[item.label];
                      const childActive = item.children.some(
                        (c) => c.href === bestMatch,
                      );
                      return (
                        <div key={item.label}>
                          <button
                            type="button"
                            onClick={() => toggleItem(item.label)}
                            title={collapsed ? tr(item.label) : undefined}
                            className={cn(
                              "group flex w-full items-center rounded-lg text-[17px] transition hover:scale-[1.03]",
                              collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                              childActive && !expanded
                                ? "bg-cyan-400/10 text-cyan-300"
                                : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
                            )}
                          >
                            <Icon className="size-[22px] shrink-0 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3" />
                            {!collapsed && (
                              <>
                                <span className="flex-1 truncate text-left">
                                  {item.label}
                                </span>
                                <ChevronDown
                                  className={cn(
                                    "size-4 shrink-0 text-zinc-500 transition-transform",
                                    expanded ? "" : "-rotate-90",
                                  )}
                                />
                              </>
                            )}
                          </button>
                          <AnimatePresence initial={false}>
                            {!collapsed && expanded && (
                              <motion.div
                                key="extras-children"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  duration: 0.22,
                                  ease: [0.4, 0, 0.2, 1],
                                }}
                                className="overflow-hidden"
                              >
                            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-2">
                              {item.children.map((child) => {
                                const cActive =
                                  child.exact
                                    ? pathname === child.href
                                    : child.href === bestMatch;
                                const CIcon = child.icon;
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    target={child.external ? "_blank" : undefined}
                                    rel={
                                      child.external
                                        ? "noopener noreferrer"
                                        : undefined
                                    }
                                    className={cn(
                                      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[16px] transition hover:scale-[1.03]",
                                      cActive
                                        ? "bg-cyan-400/10 text-cyan-300"
                                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
                                    )}
                                  >
                                    <CIcon className="size-5 shrink-0 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3" />
                                    <span className="flex-1 truncate">
                                      {tr(child.label)}
                                    </span>
                                    {child.external && (
                                      <ExternalLink className="size-4 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                                    )}
                                    {child.adBadge && (
                                      <span
                                        title="Divulgação paga de SaaS. Pra anunciar aqui, fale com um gerente na aba Suporte."
                                        className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0 text-[10px] font-bold text-amber-300 ring-1 ring-inset ring-amber-400/20"
                                      >
                                        $
                                      </span>
                                    )}
                                  </Link>
                                );
                              })}
                            </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    }

                    // Item normal — href é obrigatório aqui
                    if (!item.href) return null;
                    const active = item.exact
                      ? pathname === item.href
                      : item.href === bestMatch;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        title={collapsed ? tr(item.label) : undefined}
                        className={cn(
                          "group relative flex items-center rounded-lg text-[17px] transition hover:scale-[1.03]",
                          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                          active
                            ? "bg-cyan-400/10 text-cyan-300"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
                        )}
                      >
                        <Icon className="size-[22px] shrink-0 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-3" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">
                              {tr(item.label)}
                            </span>
                            {item.external && (
                              <ExternalLink className="size-4 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                            )}
                            {item.badge && (
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
                                  item.badge === "Novo"
                                    ? "bg-cyan-400/20 text-cyan-300"
                                    : "bg-yellow-400/15 text-yellow-200",
                                )}
                              >
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
        )}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        {/* Conta / sub-contas — movida do topo; "Sair da conta" vive no
            dropdown dela (account-switcher). Some quando recolhida.
            (Suporte saiu daqui — virou botão flutuante de suporte.) */}
        {!collapsed && (
          <AccountSwitcher accounts={accounts} />
        )}
      </div>
    </aside>
    </>
  );
}
