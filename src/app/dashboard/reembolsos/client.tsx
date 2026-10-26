"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { formatBRL } from "@/lib/utils";

type Item = {
  id: string;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
  customerEmail: string | null;
  productName: string;
  method: string;
  status: "REFUNDED" | "CHARGEBACK" | string;
  amountCents: number;
};

/**
 * 23/07/2026 (davi): "Tira esse negocio de testa manual via admin / Troca
 * chargeback por MED PIX / E reembolso por MED PIX tambem".
 *
 * Do ponto de vista do seller, TUDO que vem parar aqui é MED PIX — não
 * importa se internamente é REFUNDED ou CHARGEBACK. Unificamos badge, ícone
 * e cor pra uma unica identidade "MED PIX". Também paramos de expor o nome
 * do produto (algumas linhas eram tx de teste com nome "Teste manual de
 * gateway via admin" vazando pro seller — nada bom).
 *
 * ⚠️ 08/08/2026: a auditoria do revamp sugeriu SEPARAR de volta reembolso de
 * chargeback, argumentando que a distinção importa. Não foi feito: o pedido
 * acima é explícito e é do dono do produto. Fica registrado que existe a
 * divergência, pra decisão dele — não pra alguém "consertar" isso achando que
 * foi descuido. O nome do produto também continua fora, pelo mesmo motivo.
 *
 * O que ENTROU em 08/08: busca, filtro de período e paginação. A tela cortava
 * em 100 itens sem avisar e não tinha como achar nada — o que é problema de
 * ausência, não de escolha.
 */

const PAGE_SIZE = 25;

const PERIODOS = [
  { key: "all", label: "Tudo", dias: null },
  { key: "7d", label: "7 dias", dias: 7 },
  { key: "30d", label: "30 dias", dias: 30 },
  { key: "90d", label: "90 dias", dias: 90 },
] as const;

export function ReembolsosList({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [periodo, setPeriodo] = useState<string>("all");
  const [page, setPage] = useState(0);
  /**
   * "Agora" congelado no clique, não lido a cada render.
   *
   * `Date.now()` dentro do render de um Client Component desliza: cada
   * re-render (paginar, digitar na busca) recalcularia o corte alguns
   * milissegundos adiante, e um item na fronteira dos 7 dias poderia sumir da
   * lista no meio da navegação sem ninguém ter mexido no filtro. Fixando na
   * troca de período, "últimos 7 dias" quer dizer 7 dias contados de quando
   * você escolheu — que é o que a pessoa entende ao clicar.
   */
  const [agora, setAgora] = useState(() => Date.now());

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const p = PERIODOS.find((x) => x.key === periodo);
    // O corte usa `updatedAt`, que é quando a devolução aconteceu — não
    // `createdAt`, que é quando a venda original foi feita. Filtrar pela data
    // da venda esconderia um chargeback de ontem numa compra de seis meses
    // atrás, que é justamente o caso que o seller precisa ver.
    const corte = p?.dias ? agora - p.dias * 86_400_000 : null;
    return items.filter((it) => {
      if (corte && new Date(it.updatedAt).getTime() < corte) return false;
      if (!q) return true;
      return (
        (it.customerName ?? "").toLowerCase().includes(q) ||
        (it.customerEmail ?? "").toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
      );
    });
  }, [items, query, periodo, agora]);

  // Voltar pra primeira página quando o filtro muda: sem isso, filtrar estando
  // na página 4 mostra vazio e parece que não achou nada.
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaAtual = Math.min(page, totalPages - 1);
  const visiveis = filtrados.slice(
    paginaAtual * PAGE_SIZE,
    paginaAtual * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por cliente, e-mail ou ID…"
            aria-label="Buscar devolução"
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 py-2 pl-9 pr-9 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPage(0);
              }}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPeriodo(p.key);
                setAgora(Date.now());
                setPage(0);
              }}
              aria-pressed={periodo === p.key}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                periodo === p.key
                  ? "bg-cyan-400/15 text-cyan-300"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-zinc-500">
          {items.length === 0
            ? "Nenhuma devolução registrada."
            : "Nenhuma devolução com esse filtro."}
        </p>
      )}

    <div className="divide-y divide-white/[0.04]">
      {visiveis.map((it) => {
        return (
          <div
            key={it.id}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-lg text-orange-300 bg-orange-500/15">
              <RotateCcw className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-white truncate">
                  {it.customerName ?? it.customerEmail ?? "Cliente"}
                </p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-300">
                  MED PIX
                </span>
                <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {it.method}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 truncate">
                {new Date(it.updatedAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-white tabular-nums">
                {formatBRL(it.amountCents)}
              </p>
              <p className="text-[10px] text-zinc-500 font-mono">
                {it.id.slice(0, 8)}
              </p>
            </div>
          </div>
        );
      })}
    </div>

      {filtrados.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3 text-xs text-zinc-500">
          <span className="tabular-nums">
            {paginaAtual * PAGE_SIZE + 1}–
            {Math.min((paginaAtual + 1) * PAGE_SIZE, filtrados.length)} de{" "}
            {filtrados.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((n) => Math.max(0, n - 1))}
              disabled={paginaAtual === 0}
              aria-label="Página anterior"
              className="rounded-lg border border-white/[0.08] p-1.5 transition hover:bg-white/[0.05] disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="tabular-nums text-zinc-400">
              {paginaAtual + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((n) => Math.min(totalPages - 1, n + 1))}
              disabled={paginaAtual >= totalPages - 1}
              aria-label="Próxima página"
              className="rounded-lg border border-white/[0.08] p-1.5 transition hover:bg-white/[0.05] disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
