"use client";

import { useEffect, useState } from "react";

/**
 * ÍNDICE DA DOCUMENTAÇÃO (06/08/2026, davi: "A documentacao da trilho ta MUITO
 * feia, deixa mais bonitnho e ta sem a logo").
 *
 * ⚠️ Aqui foi consertado um bug, não só o visual. O índice antigo (hardcoded no
 * layout.tsx) tinha 10 itens e NÃO batia com a página:
 *
 *   - `#intro` e `#transactions` não existem em lugar nenhum — clicar não
 *     levava a canto nenhum, a página só ficava parada.
 *   - 5 seções REAIS não estavam listadas: `#summary`, `#create-payment`,
 *     `#list-transactions`, `#fees` e `#quickstart`. Ou seja: o endpoint
 *     principal da API (criar cobrança) não tinha entrada no índice.
 *
 * Agora a lista espelha os `<Section id=...>` da page.tsx na ORDEM em que
 * aparecem, agrupada por assunto. Mexeu num id lá, mexe aqui junto.
 */
export const DOCS_GROUPS: {
  group: string;
  items: { id: string; label: string }[];
}[] = [
  {
    group: "Introdução",
    items: [
      { id: "summary", label: "Resumo rápido" },
      { id: "auth", label: "Autenticação" },
      { id: "errors", label: "Erros" },
    ],
  },
  {
    group: "Pagamentos",
    items: [
      { id: "create-payment", label: "Criar cobrança" },
      { id: "list-transactions", label: "Listar transações" },
    ],
  },
  {
    group: "Conta",
    items: [
      { id: "me", label: "Conta atual" },
      { id: "balance", label: "Saldo" },
      { id: "withdrawals", label: "Saques" },
    ],
  },
  {
    group: "Catálogo",
    items: [
      { id: "products", label: "Produtos" },
      { id: "checkouts", label: "Checkouts" },
    ],
  },
  {
    group: "Integração",
    items: [
      { id: "webhooks", label: "Webhooks" },
      { id: "fees", label: "Taxas" },
      { id: "quickstart", label: "Quickstart" },
    ],
  },
];

const ALL_IDS = DOCS_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/**
 * Marca no índice a seção que está sendo lida.
 *
 * A faixa do rootMargin (`-96px` no topo, `-70%` embaixo) recorta a viewport
 * numa tira fina logo abaixo do header sticky. Seção ativa = a primeira que
 * encosta nessa tira — não a que ocupa mais tela. Sem isso, uma seção enorme
 * (a de webhooks tem ~150 linhas) ficaria marcada como ativa quase o tempo
 * todo enquanto o leitor já está em outra.
 */
function useActiveSection() {
  const [active, setActive] = useState("");

  useEffect(() => {
    const els = ALL_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const onScreen = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (onScreen[0]) setActive(onScreen[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return active;
}

/** Índice da coluna da esquerda (desktop). */
export function DocsSidebarNav() {
  const active = useActiveSection();

  return (
    <nav className="space-y-6 text-sm">
      {DOCS_GROUPS.map((g) => (
        <div key={g.group}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            {g.group}
          </p>
          <div className="space-y-0.5">
            {g.items.map((it) => {
              const isActive = active === it.id;
              return (
                <a
                  key={it.id}
                  href={`#${it.id}`}
                  aria-current={isActive ? "location" : undefined}
                  // A barrinha da esquerda é `border-l` no próprio link (e não
                  // um ::before absoluto) pra ela acompanhar a altura do item
                  // quando o rótulo quebra em duas linhas.
                  className={`block border-l-2 py-1.5 pl-3 pr-2 text-[13px] transition ${
                    isActive
                      ? "border-cyan-400 font-medium text-cyan-300"
                      : "border-transparent text-zinc-500 hover:border-white/20 hover:text-zinc-200"
                  }`}
                >
                  {it.label}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Índice do mobile: tira horizontal rolável logo abaixo do header.
 * Antes o índice era `hidden lg:block` — no celular a documentação simplesmente
 * não tinha navegação nenhuma, era rolar 900 linhas na mão.
 */
export function DocsMobileNav() {
  const active = useActiveSection();

  return (
    <div className="lg:hidden -mx-6 border-b border-white/[0.06] bg-black/60 backdrop-blur">
      <div className="flex gap-1.5 overflow-x-auto px-6 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DOCS_GROUPS.flatMap((g) => g.items).map((it) => {
          const isActive = active === it.id;
          return (
            <a
              key={it.id}
              href={`#${it.id}`}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                isActive
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                  : "border-white/[0.08] text-zinc-400"
              }`}
            >
              {it.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
