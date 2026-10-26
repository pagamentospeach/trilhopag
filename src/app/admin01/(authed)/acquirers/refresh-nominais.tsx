"use client";

import { useState, useTransition } from "react";
import {
  RefreshCw,
  Loader2,
  Check,
  ArrowRight,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { adminRefreshAllNominaisAction } from "../../actions";

type Result = {
  acquirerId: string;
  code: string;
  shortCode: string;
  ok: boolean;
  oldNominal?: string;
  newNominal?: string;
  changed?: boolean;
  locked?: boolean;
  error?: string;
};

export function RefreshNominais() {
  const [pending, start] = useTransition();
  const [results, setResults] = useState<Result[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [amount, setAmount] = useState("5,00");

  function parseCents(s: string): number {
    const n = Number(s.replace(/[^\d,.-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function run() {
    const cents = Math.max(500, parseCents(amount));
    if (
      !confirm(
        `Gerar 1 PIX de R$ ${(cents / 100).toFixed(2).replace(".", ",")} em CADA adquirente (que suporta PIX) pra re-parsear e atualizar as nominais?\n\nMínimo R$ 5,00. As cobranças expiram sozinhas sem pagamento. Não cria transação.`,
      )
    )
      return;
    setErr(null);
    start(async () => {
      const r = await adminRefreshAllNominaisAction(cents);
      if (r.ok) setResults(r.results);
      else setErr(r.error);
    });
  }

  const changed = results?.filter((x) => x.changed).length ?? 0;
  const failed = results?.filter((x) => !x.ok).length ?? 0;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-3 flex items-center gap-3">
        <RefreshCw className="size-4 text-cyan-300" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white">
            Atualizar nominais (gerar PIX em todas)
          </h2>
          <p className="text-[11px] text-zinc-500">
            Gera 1 PIX por adquirente pra re-ler o nome do recebedor no QR e
            atualizar a nominal cadastrada.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1">
          <span className="text-[10px] text-zinc-500">R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-12 bg-transparent text-xs text-white tabular-nums outline-none"
            title="Valor do PIX (mín. R$ 5,00)"
          />
        </div>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-1.5 text-[11px] font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> gerando…
            </>
          ) : (
            <>
              <RefreshCw className="size-3.5" /> Gerar e atualizar
            </>
          )}
        </button>
      </div>

      {err && (
        <p className="px-5 py-3 text-sm text-red-300 bg-red-500/10">{err}</p>
      )}

      {results && (
        <>
          <div className="px-5 py-2 border-b border-white/[0.04] flex items-center gap-3 text-[11px]">
            <span className="text-zinc-400">{results.length} adquirentes</span>
            <span className="text-cyan-300">{changed} atualizadas</span>
            {failed > 0 && <span className="text-red-300">{failed} falharam</span>}
          </div>
          <div className="divide-y divide-white/[0.04] max-h-80 overflow-y-auto">
            {results.map((r) => (
              <div
                key={r.acquirerId}
                className="flex items-center gap-3 px-5 py-2.5 text-sm"
              >
                <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 w-16 text-center">
                  {r.shortCode || r.code}
                </span>
                <div className="flex-1 min-w-0">
                  {!r.ok ? (
                    <span className="inline-flex items-center gap-1.5 text-red-300 text-xs">
                      <AlertTriangle className="size-3 shrink-0" />
                      <span className="truncate" title={r.error}>
                        {r.error}
                      </span>
                    </span>
                  ) : r.changed ? (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-zinc-500 line-through truncate max-w-[40%]"
                        title={r.oldNominal}
                      >
                        {r.oldNominal}
                      </span>
                      <ArrowRight className="size-3 text-zinc-600 shrink-0" />
                      <span
                        className="text-cyan-300 font-medium truncate max-w-[45%]"
                        title={r.newNominal}
                      >
                        {r.newNominal}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-zinc-400 text-xs">
                      {r.locked ? (
                        <>
                          <Lock className="size-3 shrink-0 text-amber-400" />
                          <span className="truncate" title={r.newNominal}>
                            travada · {r.newNominal}
                          </span>
                        </>
                      ) : (
                        <>
                          <Check className="size-3 shrink-0 text-zinc-500" />
                          <span className="truncate" title={r.newNominal}>
                            sem mudança · {r.newNominal}
                          </span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
