"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  XCircle,
  Ban,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/utils";
import { sellerWithdrawalReason } from "@/lib/payment-error";

type Item = {
  id: string;
  status: string;
  amountCents: number;
  feeCents: number;
  method: string;
  pixKey: string;
  pixKeyType: string;
  walletAddress: string | null;
  createdAt: string; // ISO
  failReason: string | null;
};

const statusMeta: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; bg: string; ring: string; text: string }
> = {
  PAID: {
    label: "Pago",
    icon: CheckCircle2,
    bg: "bg-cyan-400/[0.08]",
    ring: "ring-cyan-400/30",
    text: "text-cyan-300",
  },
  PENDING: {
    label: "Aguardando",
    icon: Clock3,
    bg: "bg-amber-400/[0.08]",
    ring: "ring-amber-400/30",
    text: "text-amber-300",
  },
  PROCESSING: {
    label: "Processando",
    icon: Loader2,
    bg: "bg-blue-400/[0.08]",
    ring: "ring-blue-400/30",
    text: "text-blue-300",
  },
  FAILED: {
    label: "Falhou",
    icon: XCircle,
    bg: "bg-red-500/[0.08]",
    ring: "ring-red-500/30",
    text: "text-red-300",
  },
  // 08/08/2026: REJECTED faltava. O enum WithdrawalStatus tem seis estados e
  // este mapa cobria cinco, então saque RECUSADO caía no fallback e aparecia
  // pro seller como "Cancelado" — que é outra história inteira: cancelado é
  // ele que desistiu, recusado é a plataforma que negou. Fica em vermelho e
  // não em cinza justamente porque exige ação dele.
  REJECTED: {
    label: "Recusado",
    icon: XCircle,
    bg: "bg-red-500/[0.08]",
    ring: "ring-red-500/30",
    text: "text-red-300",
  },
  CANCELED: {
    label: "Cancelado",
    icon: Ban,
    bg: "bg-zinc-700/40",
    ring: "ring-zinc-600/30",
    text: "text-zinc-400",
  },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "Todos" },
  { key: "PAID", label: "Pagos" },
  { key: "PENDING", label: "Pendentes" },
  { key: "PROCESSING", label: "Processando" },
  { key: "FAILED", label: "Falhou" },
  { key: "REJECTED", label: "Recusados" },
];

const PAGE_SIZE = 25;

export function HistoryList({
  items,
  totalPaidCents,
}: {
  items: Item[];
  /** Total pago lifetime — vem do server aggregate, não é calculado no cliente.
   *  Garante que "Total pago: X" sempre reflita TUDO que o seller já sacou,
   *  mesmo que a paginação/filtro esconda alguns items (17/07/2026, davi). */
  totalPaidCents: number;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filter !== "ALL" && i.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !i.pixKey.toLowerCase().includes(q) &&
          !(i.walletAddress ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [items, filter, query]);

  // Reset pra página 1 sempre que filter/query mudar (evita ficar numa página
  // que não existe mais depois de reduzir o dataset).
  useEffect(() => {
    setPage(0);
  }, [filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(
    () =>
      filtered.slice(
        currentPage * PAGE_SIZE,
        currentPage * PAGE_SIZE + PAGE_SIZE,
      ),
    [filtered, currentPage],
  );

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-zinc-500">Nenhum saque ainda.</p>
        <p className="mt-1 text-xs text-zinc-600">
          Seus saques aparecem aqui assim que você solicitar o primeiro.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {/* Header com filtros + busca + total */}
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Histórico</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {items.length} {items.length === 1 ? "saque" : "saques"} no total ·
            Total pago:{" "}
            <span className="text-cyan-300 font-medium">
              {formatBRL(totalPaidCents)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar chave / wallet"
              className="w-52 rounded-full border border-white/[0.08] bg-black/30 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:border-cyan-400/40 focus:outline-none"
            />
          </div>
          <div className="hidden sm:block h-4 w-px bg-white/[0.08]" />
          <Filter className="size-3.5 text-zinc-500" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                filter === f.key
                  ? "bg-white text-black font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista — cards ao invés de tabela */}
      <div className="divide-y divide-white/[0.04]">
        {filtered.length === 0 && (
          <div className="px-5 py-10 text-center text-xs text-zinc-500">
            Nenhum saque com esse filtro.
          </div>
        )}
        {pageItems.map((w) => {
          // Fallback NEUTRO, não `statusMeta.CANCELED`. Cair no default e
          // escrever "Cancelado" era como o REJECTED virava outra coisa: um
          // status que ninguém mapeou passava a afirmar algo errado sobre o
          // dinheiro do seller. Mostrando o código cru, o pior caso é ele não
          // entender a palavra — não acreditar na palavra errada.
          const meta = statusMeta[w.status] ?? {
            label: w.status,
            icon: Ban,
            bg: "bg-zinc-700/40",
            ring: "ring-zinc-600/30",
            text: "text-zinc-400",
          };
          const StatusIcon = meta.icon;
          const isUsdt = w.method === "usdt_solana";
          const reason = sellerWithdrawalReason(w.failReason);
          return (
            <div
              key={w.id}
              className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.02] sm:gap-4"
            >
              {/* Status icon */}
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.bg} ${meta.ring} ${meta.text}`}
              >
                <StatusIcon
                  className={`size-4 ${w.status === "PROCESSING" ? "animate-spin" : ""}`}
                />
              </div>

              {/* Info principal */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs text-white truncate">
                    {isUsdt ? w.walletAddress : w.pixKey}
                  </p>
                  <span
                    className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider sm:inline ${
                      isUsdt
                        ? "bg-purple-400/15 text-purple-300"
                        : "bg-zinc-700/40 text-zinc-400"
                    }`}
                  >
                    {isUsdt ? "USDT · SOL" : `PIX · ${w.pixKeyType}`}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {formatDate(new Date(w.createdAt))}
                  {w.feeCents > 0 && (
                    <>
                      {" · "}
                      taxa {formatBRL(w.feeCents)}
                    </>
                  )}
                </p>
                {reason && (
                  <p
                    className="mt-1 line-clamp-1 text-[11px] text-red-300"
                    title={reason}
                  >
                    {reason}
                  </p>
                )}
              </div>

              {/* Valor + status */}
              <div className="text-right shrink-0">
                <p className="font-mono text-sm font-bold text-white tabular-nums">
                  {formatBRL(w.amountCents)}
                </p>
                <p className={`mt-0.5 text-[10px] font-medium ${meta.text}`}>
                  {meta.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paginação — só aparece se tiver mais de 1 página do dataset filtrado */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
          <p className="text-[11px] text-zinc-500">
            Mostrando{" "}
            <span className="text-zinc-300 font-medium tabular-nums">
              {currentPage * PAGE_SIZE + 1}–
              {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)}
            </span>{" "}
            de{" "}
            <span className="text-zinc-300 font-medium tabular-nums">
              {filtered.length}
            </span>
            {filter !== "ALL" || query ? " (filtrados)" : ""}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              aria-label="Página anterior"
              className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="min-w-[70px] text-center text-[11px] text-zinc-400 tabular-nums">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={currentPage >= totalPages - 1}
              aria-label="Próxima página"
              className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
