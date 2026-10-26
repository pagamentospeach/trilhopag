"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { PrivateText } from "@/components/dashboard/private-text";
import { cancelSubscription } from "./actions";

/**
 * Lista de assinaturas com filtro por status, busca e cancelamento.
 *
 * Filtra no CLIENTE, ao contrário das listas grandes que filtram no
 * servidor. Não é inconsistência: a página já carrega no máximo 200 linhas (o
 * `take` do server), então os dados inteiros já estão aqui e mandar o usuário
 * de volta pro banco a cada tecla seria roundtrip à toa. Em Clientes a lista é
 * ilimitada e cresce pra sempre, por isso lá é o Postgres que filtra.
 */

export type Assinatura = {
  id: string;
  cliente: string;
  email: string;
  produto: string;
  valor: string;
  periodicidade: string;
  status: string;
  cobrancas: number;
  falhas: number;
  /** ISO. Formatado no cliente, mas sempre com timeZone de Brasília. */
  proxima: string;
  desde: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Ativa", cls: "bg-cyan-400/15 text-cyan-300" },
  past_due: { label: "Inadimplente", cls: "bg-amber-400/15 text-amber-300" },
  canceled: { label: "Cancelada", cls: "bg-zinc-700/40 text-zinc-400" },
  completed: { label: "Concluída", cls: "bg-purple-400/15 text-purple-300" },
};

const FILTROS = [
  { key: "todas", label: "Todas" },
  { key: "active", label: "Ativas" },
  { key: "past_due", label: "Inadimplentes" },
  { key: "canceled", label: "Canceladas" },
  { key: "completed", label: "Concluídas" },
] as const;

/** Data curta no fuso de Brasília — o servidor roda em UTC. */
function dataBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function AssinaturasList({ items }: { items: Assinatura[] }) {
  const [filtro, setFiltro] = useState<string>("todas");
  const [query, setQuery] = useState("");
  const [confirmar, setConfirmar] = useState<Assinatura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((s) => {
      if (filtro !== "todas" && s.status !== filtro) return false;
      if (!q) return true;
      return (
        s.cliente.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.produto.toLowerCase().includes(q)
      );
    });
  }, [items, filtro, query]);

  function confirmarCancelamento() {
    if (!confirmar) return;
    const id = confirmar.id;
    setErro(null);
    start(async () => {
      const r = await cancelSubscription(id);
      if (r.ok) setConfirmar(null);
      else setErro(r.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, e-mail ou produto…"
            aria-label="Buscar assinatura"
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 py-2 pl-9 pr-9 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex items-center gap-1 overflow-x-auto rounded-full border border-white/[0.06] bg-black/30 p-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              aria-pressed={filtro === f.key}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                filtro === f.key
                  ? "bg-cyan-400/15 text-cyan-300"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="hidden grid-cols-12 gap-4 border-b border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 md:grid">
          <span className="col-span-3">Cliente</span>
          <span className="col-span-3">Produto</span>
          <span className="col-span-2">Periodicidade</span>
          <span className="col-span-1 text-right">Valor</span>
          <span className="col-span-2 text-right">Próxima</span>
          <span className="col-span-1 text-right">Status</span>
        </div>

        {lista.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            Nenhuma assinatura com esse filtro.
          </p>
        ) : (
          <div className="bp-in-rows">
            {lista.map((s) => {
              const st = STATUS[s.status] ?? {
                label: s.status,
                cls: "bg-zinc-700/40 text-zinc-400",
              };
              const cancelavel =
                s.status === "active" || s.status === "past_due";
              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-2 border-b border-white/[0.04] px-4 py-3 text-sm last:border-b-0 md:grid md:grid-cols-12 md:items-center md:gap-4 md:px-5"
                >
                  <span className="col-span-3 min-w-0">
                    <span className="block truncate font-medium text-white">
                      {s.cliente}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">
                      {s.cobrancas} cobrança{s.cobrancas === 1 ? "" : "s"}
                      {s.falhas > 0 && ` · ${s.falhas} falha${s.falhas === 1 ? "" : "s"}`}
                    </span>
                  </span>

                  <span className="col-span-3 min-w-0 truncate text-[13px] text-zinc-300">
                    {s.produto}
                  </span>

                  <span className="col-span-2 text-[12px] text-zinc-400">
                    {s.periodicidade}
                  </span>

                  <span className="col-span-1 font-semibold tabular-nums text-white md:text-right">
                    <PrivateText>{s.valor}</PrivateText>
                  </span>

                  <span className="col-span-2 text-[12px] tabular-nums text-zinc-400 md:text-right">
                    {/* Só faz sentido pra quem ainda vai ser cobrado. Numa
                        cancelada o campo continua no banco com a data que
                        seria, e mostrar isso pareceria cobrança agendada. */}
                    {cancelavel ? dataBR(s.proxima) : "—"}
                  </span>

                  <span className="col-span-1 flex items-center justify-between gap-2 md:justify-end">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}
                    >
                      {st.label}
                    </span>
                    {cancelavel && (
                      <button
                        type="button"
                        onClick={() => {
                          setErro(null);
                          setConfirmar(s);
                        }}
                        className="shrink-0 text-[11px] font-medium text-zinc-500 transition hover:text-red-300"
                      >
                        Cancelar
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmar && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setConfirmar(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelar-titulo"
            className="w-full max-w-md rounded-t-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl sm:rounded-2xl"
          >
            <h2
              id="cancelar-titulo"
              className="text-base font-semibold text-white"
            >
              Cancelar assinatura?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              <span className="text-zinc-200">{confirmar.cliente}</span> deixa de
              ser cobrado por{" "}
              <span className="text-zinc-200">{confirmar.produto}</span>. As
              cobranças já feitas continuam no extrato. Não dá pra reativar
              depois: o cliente precisa assinar de novo.
            </p>

            {erro && (
              <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.08] px-3 py-2 text-[13px] text-red-300">
                {erro}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmar(null)}
                className="rounded-lg border border-white/[0.10] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirmarCancelamento}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-60"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {pending ? "Cancelando…" : "Cancelar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
