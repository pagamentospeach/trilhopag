"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type FinanceiroTab = "entradas" | "saidas";

/**
 * Segmented control Entradas/Saídas da aba Financeiro (06/08/2026, davi).
 *
 * "Junte a aba VENDAS e FINANCEIRO (entradas e saidas) em uma aba so
 *  (financeiro) mas sem perder nenhuma funcao / filtro que tem na aba vendas!"
 *
 * Os dois lados são renderizados NO SERVER e chegam aqui como `entradas` e
 * `saidas` (React nodes). Este componente só decide qual mostrar — nenhum
 * filtro, tabela ou form foi reimplementado, então nada de Vendas ou de Saques
 * se perde na fusão.
 *
 * O lado escondido fica montado com `hidden` em vez de desmontar: trocar de
 * aba não zera os filtros que o seller já aplicou em Entradas nem o estado de
 * paginação/busca do histórico em Saídas.
 *
 * A aba ativa espelha em `?tab=` pra o link poder apontar direto pro lado
 * certo — é o que o card de saldo da sidebar e o redirect de /dashboard/saques
 * usam pra cair em Saídas.
 */
export function FinanceiroTabs({
  entradas,
  saidas,
}: {
  entradas: React.ReactNode;
  saidas: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<FinanceiroTab>(() => {
    // 10/08/2026 (davi): "tire da aba financeiro isso de extrato, somente
    // entradas / saidas". `?tab=extrato` de link antigo cai em Entradas.
    return searchParams.get("tab") === "saidas" ? "saidas" : "entradas";
  });

  const select = useCallback(
    (next: FinanceiroTab) => {
      setTab(next);
      // `scroll: false` pra não pular pro topo ao trocar de lado.
      router.replace(`?tab=${next}`, { scroll: false });
    },
    [router],
  );

  return (
    <>
      <div
        role="tablist"
        aria-label="Entradas e saídas"
        className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-1.5"
      >
        <TabButton
          active={tab === "entradas"}
          onClick={() => select("entradas")}
          icon={<ArrowDownLeft className="size-4" />}
          label="Entradas"
          hint="Vendas"
        />
        <TabButton
          active={tab === "saidas"}
          onClick={() => select("saidas")}
          icon={<ArrowUpRight className="size-4" />}
          label="Saídas"
          hint="Saques"
        />
      </div>

      <div role="tabpanel" hidden={tab !== "entradas"}>
        {entradas}
      </div>
      <div role="tabpanel" hidden={tab !== "saidas"}>
        {saidas}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
        active
          ? "bg-cyan-400/15 text-cyan-300 shadow-[0_0_24px_-8px_rgba(34, 211, 238,0.45)] ring-1 ring-inset ring-cyan-400/30"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        className={cn(
          "text-xs font-normal",
          active ? "text-cyan-300/60" : "text-zinc-600",
        )}
      >
        · {hint}
      </span>
    </button>
  );
}
