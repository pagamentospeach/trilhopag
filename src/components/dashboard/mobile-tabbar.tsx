"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ArrowDownLeft, QrCode, Box, Menu } from "lucide-react";

/**
 * BARRA DE ABAS DE BAIXO — a navegacao do painel no celular.
 *
 * 08/08/2026 (davi): "faça uma versao da trilho para celular estilo app de
 * banco algo realmente FODA e diferente pelo celular, com tudo diferente da
 * versao de PC".
 *
 * Ate aqui o celular era o desktop espremido: a mesma sidebar de 288px virava
 * uma gaveta atras de um hamburger no canto superior esquerdo. Ou seja, TODA
 * navegacao do painel morava no ponto da tela mais longe do polegar. Nenhum
 * app de banco faz isso — eles poem os destinos embaixo, onde a mao ja esta.
 *
 * Quatro destinos e um botao. Quatro porque com cinco o rotulo comeca a
 * truncar num aparelho de 320px, e porque estes sao os quatro lugares onde o
 * seller realmente passa o dia: ver o resumo, conferir o extrato, cadastrar
 * produto e cobrar. O resto do menu nao sumiu: o quinto slot abre a gaveta
 * que ja existia, com a arvore completa.
 *
 * "Cobrar" fica no meio, redondo e levantado, porque e a unica acao de
 * escrita da barra — as outras quatro sao lugares pra onde se vai. Elevar o
 * botao e o que separa visualmente "criar" de "navegar".
 *
 * A barra so existe abaixo de `md`. No desktop a sidebar continua sendo a
 * navegacao, sem mudanca nenhuma.
 */

type TabItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Só casa com o pathname exato. Vale pra /dashboard, que é prefixo de
   *  TODAS as outras rotas do painel — sem isso "Início" ficaria aceso o
   *  tempo inteiro, em cima de qualquer outra aba. */
  exact?: boolean;
};

const TABS: readonly TabItem[] = [
  { href: "/dashboard", label: "Início", icon: LayoutGrid, exact: true },
  // 10/08/2026 (davi): a aba Extrato saiu do Financeiro ("somente entradas /
  // saidas"). Este atalho aponta pro que sobrou e e o que o seller procura
  // aqui: o dinheiro que entrou.
  {
    href: "/dashboard/financeiro",
    label: "Entradas",
    icon: ArrowDownLeft,
  },
];

const TABS_RIGHT: readonly TabItem[] = [
  { href: "/dashboard/produtos", label: "Produtos", icon: Box },
];

export function MobileTabBar() {
  const pathname = usePathname();

  /**
   * ⚠️ Compara só o CAMINHO do href.
   *
   * 09/08/2026: o item de Extrato passou a apontar pra
   * `/dashboard/financeiro?tab=extrato`, e `usePathname()` devolve o caminho
   * SEM query. Comparando a string inteira, esse item nunca acenderia — o
   * seller estaria no extrato com a barra sem nenhuma aba marcada.
   */
  const isActive = (href: string, exact?: boolean) => {
    const caminho = href.split("?")[0];
    return exact
      ? pathname === caminho
      : pathname === caminho || pathname.startsWith(caminho + "/");
  };

  return (
    <nav
      aria-label="Navegação principal"
      // `fixed` e nao `sticky`: a barra tem que ficar parada enquanto a pagina
      // rola, que e o comportamento de barra de app. O respiro do conteudo
      // acima dela vem do padding-bottom do <main> (layout do painel).
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/[0.07] bg-black/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-between px-1">
        {TABS.map((t) => (
          <Tab key={t.href} {...t} active={isActive(t.href, t.exact)} />
        ))}

        {/* O botao de cobrar. Sobe pra fora da barra — por isso a barra nao
         *  tem overflow-hidden e o item nao tem altura propria. */}
        <div className="relative flex w-16 shrink-0 justify-center">
          <Link
            href="/dashboard/cobrancas"
            aria-label="Criar cobrança"
            className="absolute -top-5 flex size-14 flex-col items-center justify-center rounded-full bg-cyan-400 text-black shadow-[0_10px_28px_-8px_rgba(34,211,238,0.9)] ring-4 ring-black transition active:scale-95"
          >
            <QrCode className="size-6" strokeWidth={2.2} />
          </Link>
          <span className="mt-auto pb-2 text-[10px] font-medium text-zinc-500">
            Cobrar
          </span>
        </div>

        {TABS_RIGHT.map((t) => (
          <Tab key={t.href} {...t} active={isActive(t.href)} />
        ))}

        {/* A gaveta que ja existia. O evento e o mesmo que o hamburger do
         *  topbar dispara — a sidebar escuta `bp:sidebar-open`. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("bp:sidebar-open"))}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-zinc-500 transition active:scale-95"
        >
          <Menu className="size-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 transition active:scale-95 ${
        active ? "text-cyan-300" : "text-zinc-500"
      }`}
    >
      {/* Risco de aba ativa colado no topo da barra. */}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-cyan-400"
        />
      ) : null}
      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
