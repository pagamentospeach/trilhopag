"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, Check } from "lucide-react";
import { saveScheduledWithdraw } from "./actions";

type PixDest = { id: string; label: string; pixKey: string | null };

/**
 * Configuração do SAQUE AUTOMÁTICO programado pelo seller: liga/desliga, define
 * o valor-gatilho (quando o saldo disponível bate esse valor, saca sozinho) e
 * escolhe uma chave PIX salva. O saque é feito por um cron via requestWithdrawal
 * — exatamente como se o seller tivesse pedido.
 */
export function AutoWithdrawConfig({
  enabled: initialEnabled,
  thresholdCents: initialThreshold,
  destId: initialDestId,
  pixDestinations,
  minWithdrawalCents,
}: {
  enabled: boolean;
  thresholdCents: number;
  destId: string | null;
  pixDestinations: PixDest[];
  minWithdrawalCents: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [thresholdReais, setThresholdReais] = useState(
    initialThreshold > 0 ? (initialThreshold / 100).toFixed(2) : "",
  );
  const [destId, setDestId] = useState(
    initialDestId ?? pixDestinations[0]?.id ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const minReais = (minWithdrawalCents / 100).toFixed(2).replace(".", ",");
  const hasPix = pixDestinations.length > 0;

  function save() {
    setMsg(null);
    setErr(null);
    const thresholdCents =
      Math.round(
        parseFloat((thresholdReais || "0").replace(",", ".")) * 100,
      ) || 0;
    startTransition(async () => {
      const r = await saveScheduledWithdraw({
        enabled,
        thresholdCents,
        destId: destId || null,
      });
      if (r.ok) {
        setMsg("Salvo!");
        router.refresh();
        setTimeout(() => setMsg(null), 2500);
      } else {
        setErr(r.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.05] to-transparent p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-cyan-300" />
        <h2 className="text-sm font-medium text-white">Saque automático</h2>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Defina um valor: toda vez que seu saldo disponível atingir esse valor, o
        saque é feito automaticamente pra sua chave PIX — sem precisar pedir.
      </p>

      {!hasPix ? (
        <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs text-amber-200">
          Cadastre uma chave PIX salva (acima) para ativar o saque automático.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div>
              <p className="text-sm font-medium text-white">
                Ativar saque automático
              </p>
              <p className="text-[11px] text-zinc-500">
                Saca o saldo disponível inteiro quando atingir o valor.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Ativar saque automático"
              onClick={() => setEnabled((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                enabled ? "bg-cyan-400" : "bg-zinc-600"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
                  enabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {enabled && (
            <>
              <div>
                <label className="text-xs text-zinc-400">
                  Sacar quando o saldo disponível atingir (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={thresholdReais}
                  onChange={(e) => setThresholdReais(e.target.value)}
                  placeholder={`mín. ${minReais}`}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  Ex.: R$ 100,00 → toda vez que bater R$ 100, saca sozinho.
                  Mínimo R$ {minReais}.
                </p>
              </div>
              <div>
                <label className="text-xs text-zinc-400">
                  Chave PIX de destino
                </label>
                <select
                  value={destId}
                  onChange={(e) => setDestId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
                >
                  {pixDestinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label} — {d.pixKey ?? ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-3">
            {msg && (
              <span className="inline-flex items-center gap-1 text-xs text-cyan-300">
                <Check className="size-3" /> {msg}
              </span>
            )}
            {err && <span className="text-xs text-red-300">{err}</span>}
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}{" "}
              Salvar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
