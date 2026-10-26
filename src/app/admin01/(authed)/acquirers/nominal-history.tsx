"use client";

import { useState, useMemo } from "react";
import { History, Copy, Check, ArrowRight, CalendarClock } from "lucide-react";

type Change = {
  id: string;
  acquirerLabel: string;
  oldNominal: string;
  newNominal: string;
  createdAt: string;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      // ignore
    }
    document.body.removeChild(ta);
  }
}

/**
 * Histórico de troca de nominal das adquirentes. Alimentado automaticamente
 * por maybeUpdateNominal (lib/acquirers.ts) toda vez que o PSP retorna um
 * nome de recebedor diferente no QR. Cada item tem um botao "copiar aviso"
 * que monta a mensagem pronta pra avisar os sellers.
 */
export function NominalHistory({ changes }: { changes: Change[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedToday, setCopiedToday] = useState(false);

  // Mudanças de HOJE (createdAt >= meia-noite local).
  const todayChanges = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    return changes.filter((c) => new Date(c.createdAt).getTime() >= t0);
  }, [changes]);

  async function copyAviso(c: Change) {
    const msg = `⚠️ ATENÇÃO: a nominal "${c.oldNominal}" agora é "${c.newNominal}".`;
    await copyText(msg);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function copyTodayBatch() {
    const lines = todayChanges
      .map((c) => `🔹 ${c.acquirerLabel}: "${c.oldNominal}" → "${c.newNominal}"`)
      .join("\n");
    const msg = `⚠️ ATUALIZAÇÃO DE NOMINAIS (HOJE)\n\n${lines}`;
    await copyText(msg);
    setCopiedToday(true);
    setTimeout(() => setCopiedToday(false), 2000);
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-3 flex items-center gap-2">
        <History className="size-4 text-amber-300" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white">
            Histórico de troca de nominal
          </h2>
          <p className="text-[11px] text-zinc-500">
            Registrado automático quando o PSP muda o nome do recebedor no QR.
          </p>
        </div>
        {todayChanges.length > 0 && (
          <button
            type="button"
            onClick={copyTodayBatch}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-400/30 px-3 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/25"
            title="Copiar todas as nominais que mudaram hoje"
          >
            {copiedToday ? (
              <>
                <Check className="size-3" /> copiado!
              </>
            ) : (
              <>
                <CalendarClock className="size-3" /> mudanças de hoje ({todayChanges.length})
              </>
            )}
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          Nenhuma troca registrada ainda. Vai aparecer aqui assim que um PSP
          mudar o nominal de alguma adquirente.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
          {changes.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-5 py-2.5 text-sm group hover:bg-white/[0.02]"
            >
              <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                {c.acquirerLabel}
              </span>
              <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                <span className="text-zinc-500 line-through truncate max-w-[40%]" title={c.oldNominal}>
                  {c.oldNominal}
                </span>
                <ArrowRight className="size-3 text-zinc-600 shrink-0" />
                <span className="text-cyan-300 font-medium truncate max-w-[45%]" title={c.newNominal}>
                  {c.newNominal}
                </span>
              </div>
              <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums hidden sm:inline">
                {new Date(c.createdAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <button
                type="button"
                onClick={() => copyAviso(c)}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-400 hover:bg-white/[0.05] hover:text-white transition"
                title={`Copiar aviso: a nominal "${c.oldNominal}" agora é "${c.newNominal}"`}
              >
                {copiedId === c.id ? (
                  <>
                    <Check className="size-2.5 text-cyan-300" /> ok
                  </>
                ) : (
                  <>
                    <Copy className="size-2.5" /> aviso
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
