"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Loader2,
  Check,
  ShieldCheck,
  Server,
  Search,
  X,
  Globe2,
  Lock,
} from "lucide-react";
import { adminSetOwnAcquirerPanel } from "@/app/admin01/actions";
import { acquirerNominalLabel } from "@/lib/utils";
import { ACQUIRER_MODES_FOR, OPS_MODES, type OpsMode } from "@/lib/ops-modes";

type Mode = OpsMode;
type Panel = Record<Mode, string[]>;

type Acquirer = {
  id: string;
  code: string;
  shortCode: string | null;
  nominalName: string;
  institution: string | null;
  mode: string;
  supportsPix: boolean;
  supportsCard: boolean;
  isPrivate: boolean;
  globalEnabled: boolean;
};

const MODES: readonly Mode[] = OPS_MODES;
const MODE_LABEL: Record<Mode, string> = {
  black: "Black",
  white: "White",
  hot: "Hot",
  sag: "SAG",
};
const MODE_TINT: Record<Mode, string> = {
  black: "border-purple-400/30 bg-purple-400/[0.06] text-purple-200",
  white: "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200",
  hot: "border-orange-400/30 bg-orange-400/[0.06] text-orange-200",
  sag: "border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-200",
};

/**
 * Painel próprio de adquirentes (19/07/2026, davi):
 * - Toggle "usar painel próprio pra este seller".
 * - Quando ligado: um grid por modo, com checkboxes de TODAS as adquirentes
 *   ativas. Admin marca as que o seller pode ver por modo.
 * - Quando desligado: seller volta a ver o painel geral (público/privado).
 *
 * Filtra acquirer pelo mode compatível (ex: no bucket "black" só aparecem
 * acquirers com mode="black" ou mode="both" — mesma lógica do dispatcher).
 */
export function OwnAcquirerPanelSection({
  userId,
  allActiveAcquirers,
  initialEnabled,
  initialPanel,
  initialPublicModes,
}: {
  userId: string;
  allActiveAcquirers: Acquirer[];
  initialEnabled: boolean;
  initialPanel: Panel;
  /** Modos que ficam PÚBLICOS mesmo com o painel próprio ligado. 19/07/2026 (davi). */
  initialPublicModes: Mode[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [publicModes, setPublicModes] = useState<Set<Mode>>(
    () => new Set(initialPublicModes),
  );
  const [query, setQuery] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleModePublic(mode: Mode) {
    setPublicModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  }

  const acquirersByMode = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (a: Acquirer): boolean => {
      if (!q) return true;
      const hay = [
        a.code,
        a.shortCode ?? "",
        a.nominalName,
        a.institution ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };
    const groups = Object.fromEntries(
      OPS_MODES.map((m) => [m, [] as Acquirer[]]),
    ) as Record<Mode, Acquirer[]>;
    // Qual adquirente cai em qual balde é DERIVADO de ACQUIRER_MODES_FOR, a
    // mesma tabela que o dispatcher consulta ("both" entra em black e white,
    // "white_hot" em white e hot). Antes era uma escada de `else if` escrita à
    // mão aqui, que precisava ser mantida em sincronia com o dispatcher na
    // memória — e um modo novo entrava com o balde vazio, sem erro nenhum.
    for (const a of allActiveAcquirers) {
      if (!filter(a)) continue;
      for (const m of OPS_MODES) {
        if ((ACQUIRER_MODES_FOR[m] as readonly string[]).includes(a.mode)) {
          groups[m].push(a);
        }
      }
    }
    return groups;
  }, [allActiveAcquirers, query]);

  function togglePick(mode: Mode, acqId: string) {
    setPanel((p) => {
      const cur = new Set(p[mode]);
      if (cur.has(acqId)) cur.delete(acqId);
      else cur.add(acqId);
      return { ...p, [mode]: [...cur] };
    });
  }

  function selectAll(mode: Mode) {
    setPanel((p) => ({
      ...p,
      [mode]: acquirersByMode[mode].map((a) => a.id),
    }));
  }

  function clearMode(mode: Mode) {
    setPanel((p) => ({ ...p, [mode]: [] }));
  }

  function onSave() {
    setErr(null);
    setSavedMsg(null);
    startTransition(async () => {
      const r = await adminSetOwnAcquirerPanel({
        userId,
        enabled,
        // Manda o panel inteiro derivado de OPS_MODES. Listar as chaves à mão
        // aqui era o único lugar onde um modo novo sumia sem o TypeScript
        // reclamar: o objeto seria válido, só que sem a lista do modo novo — o
        // seller ficaria com o painel daquele modo vazio depois de salvar.
        panel: Object.fromEntries(
          OPS_MODES.map((m) => [m, panel[m]]),
        ) as Panel,
        publicModes: [...publicModes],
      });
      if (r.ok) {
        setSavedMsg("Painel próprio salvo. O seller enxerga a nova lista já.");
        setTimeout(() => setSavedMsg(null), 3500);
      } else {
        setErr(r.error);
      }
    });
  }

  // Modo marcado como público não conta: as adquirentes dele vêm do painel
  // geral, não desta seleção.
  const totalPicked = OPS_MODES.reduce(
    (sum, m) => sum + (publicModes.has(m) ? 0 : panel[m].length),
    0,
  );

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-9 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
              Painel próprio de adquirentes
              {enabled && (
                <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                  Ativo
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-zinc-400 max-w-xl">
              Quando <strong>ativado</strong>, este seller enxerga APENAS as
              adquirentes que você marcar aqui pra cada modo. Quando{" "}
              <strong>desativado</strong> (default), ele volta a ver o painel
              geral (visibilidade pública/privada normal).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {totalPicked} adquirente{totalPicked === 1 ? "" : "s"} selecionada
            {totalPicked === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setEnabled((e) => !e)}
            aria-pressed={enabled}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              enabled ? "bg-cyan-400" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Busca */}
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar adquirente (código, nominal, instituição)"
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 py-2 pl-9 pr-8 text-xs text-white placeholder:text-zinc-500 focus:border-cyan-400/40 focus:outline-none"
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

          {/* 3 grids */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {MODES.map((mode) => {
              const list = acquirersByMode[mode];
              const picked = new Set(panel[mode]);
              const isPublic = publicModes.has(mode);
              return (
                <div
                  key={mode}
                  className={`rounded-xl border ${MODE_TINT[mode]} p-3`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold uppercase tracking-wide">
                      {MODE_LABEL[mode]}
                      {!isPublic && (
                        <span className="ml-2 text-[10px] font-normal opacity-70">
                          ({picked.size} / {list.length})
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1 text-[10px]">
                      {!isPublic && (
                        <>
                          <button
                            type="button"
                            onClick={() => selectAll(mode)}
                            disabled={list.length === 0}
                            className="rounded-md border border-current/30 px-1.5 py-0.5 hover:bg-current/10 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            todas
                          </button>
                          <button
                            type="button"
                            onClick={() => clearMode(mode)}
                            disabled={picked.size === 0}
                            className="rounded-md border border-current/30 px-1.5 py-0.5 hover:bg-current/10 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            limpar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Toggle Público / Próprio — 19/07/2026 (davi):
                      "de uma opcao de deixar publico por modos" */}
                  <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-current/20 bg-black/30 p-1">
                    <button
                      type="button"
                      onClick={() => toggleModePublic(mode)}
                      className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
                        isPublic
                          ? "bg-current/25 text-white"
                          : "text-current/70 hover:bg-current/10"
                      }`}
                      aria-pressed={isPublic}
                      title="Este modo usa o painel geral (todas as adquirentes públicas + privadas autorizadas)"
                    >
                      <Globe2 className="size-3" />
                      Público
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleModePublic(mode)}
                      className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
                        !isPublic
                          ? "bg-current/25 text-white"
                          : "text-current/70 hover:bg-current/10"
                      }`}
                      aria-pressed={!isPublic}
                      title="Este modo usa APENAS as adquirentes marcadas abaixo"
                    >
                      <Lock className="size-3" />
                      Próprio
                    </button>
                  </div>

                  {isPublic ? (
                    <div className="rounded-lg border border-dashed border-current/30 bg-current/[0.04] px-3 py-6 text-center">
                      <Globe2 className="mx-auto size-6 opacity-50 mb-2" />
                      <p className="text-[11px] font-semibold text-white">
                        Modo público
                      </p>
                      <p className="mt-1 text-[10px] opacity-70 leading-relaxed">
                        Seller enxerga o painel geral neste modo (adquirentes
                        públicas + privadas que ele foi autorizado).
                      </p>
                    </div>
                  ) : (
                  <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1 -mr-1">
                    {list.length === 0 && (
                      <p className="text-[11px] text-zinc-500 py-2">
                        Nenhuma adquirente compatível.
                      </p>
                    )}
                    {list.map((a) => {
                      const isPicked = picked.has(a.id);
                      return (
                        <label
                          key={a.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition ${
                            isPicked
                              ? "bg-white/[0.08]"
                              : "hover:bg-white/[0.03]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isPicked}
                            onChange={() => togglePick(mode, a.id)}
                            className="size-3.5 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
                          />
                          <Server className="size-3 shrink-0 opacity-60" />
                          <span className="flex-1 min-w-0 truncate text-white">
                            {acquirerNominalLabel(a.nominalName, a.institution)}
                          </span>
                          <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-mono uppercase text-zinc-400 shrink-0">
                            {a.shortCode ?? a.code}
                          </span>
                          {!a.globalEnabled && (
                            <span
                              className="rounded-full bg-amber-400/15 px-1 py-0 text-[8px] font-bold text-amber-300"
                              title="Não está globalmente habilitada"
                            >
                              off
                            </span>
                          )}
                          {a.isPrivate && (
                            <span
                              className="rounded-full bg-purple-400/15 px-1 py-0 text-[8px] font-bold text-purple-300"
                              title="Adquirente privada"
                            >
                              priv
                            </span>
                          )}
                          <div className="flex gap-0.5 shrink-0">
                            {a.supportsPix && (
                              <span
                                className="rounded bg-blue-400/15 px-1 py-0 text-[8px] font-bold text-blue-300"
                                title="Suporta PIX"
                              >
                                PIX
                              </span>
                            )}
                            {a.supportsCard && (
                              <span
                                className="rounded bg-indigo-400/15 px-1 py-0 text-[8px] font-bold text-indigo-300"
                                title="Suporta cartão"
                              >
                                CARD
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Footer: save + feedback */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-[11px]">
          {savedMsg && (
            <span className="inline-flex items-center gap-1.5 text-cyan-300">
              <Check className="size-3" /> {savedMsg}
            </span>
          )}
          {err && <span className="text-red-300">{err}</span>}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Salvar painel
        </button>
      </div>
    </section>
  );
}
