"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Pencil, Loader2, Check, X } from "lucide-react";
import {
  adminRefreshAcquirerBalance,
  adminSetAcquirerAdjustment,
} from "../../actions";

export function BalanceCardControls({
  acquirerId,
  nominalName,
  adjustmentCents,
}: {
  acquirerId: string;
  nominalName: string;
  adjustmentCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(
    (adjustmentCents / 100).toFixed(2).replace(".", ","),
  );
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function refresh() {
    startTransition(async () => {
      setMsg(null);
      const r = await adminRefreshAcquirerBalance(acquirerId);
      if (r.ok) {
        setMsg("✓");
        router.refresh();
        setTimeout(() => setMsg(null), 1200);
      } else {
        setMsg(r.error);
      }
    });
  }

  function saveAdjustment() {
    if (!reason.trim()) {
      setMsg("Informe o motivo");
      return;
    }
    const num = Number(input.replace(/[^\d,.-]/g, "").replace(",", "."));
    if (!Number.isFinite(num)) {
      setMsg("Valor inválido");
      return;
    }
    startTransition(async () => {
      setMsg(null);
      const r = await adminSetAcquirerAdjustment(
        acquirerId,
        Math.round(num * 100),
        reason.trim(),
      );
      if (r.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <div className="mt-2 pt-2 border-t border-white/[0.04]">
      {editing ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-500">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0,00 ou -100,00"
              className="flex-1 rounded border border-white/[0.08] bg-black/40 px-2 py-1 text-[10px] text-white font-mono"
            />
          </div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (auditado)"
            className="w-full rounded border border-white/[0.08] bg-black/40 px-2 py-1 text-[10px] text-white"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={saveAdjustment}
              disabled={pending}
              className="flex-1 rounded bg-cyan-400 text-black text-[10px] font-bold py-1 hover:bg-cyan-300 disabled:opacity-50 inline-flex items-center justify-center gap-1"
            >
              {pending ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <Check className="size-2.5" />
              )}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setMsg(null);
                setInput((adjustmentCents / 100).toFixed(2).replace(".", ","));
              }}
              className="rounded border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/[0.05]"
            >
              <X className="size-2.5" />
            </button>
          </div>
          {msg && <p className="text-[9px] text-red-300">{msg}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-1 text-[9px] text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
            title="Re-buscar saldo do provider (busta cache 60s)"
          >
            {pending ? (
              <Loader2 className="size-2.5 animate-spin" />
            ) : (
              <RefreshCw className="size-2.5" />
            )}
            atualizar
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setMsg(null);
            }}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-1 text-[9px] text-zinc-400 hover:bg-white/[0.05] hover:text-white"
            title={`Ajustar saldo de ${nominalName} (atual: R$ ${(adjustmentCents / 100).toFixed(2).replace(".", ",")})`}
          >
            <Pencil className="size-2.5" />
            ajustar
          </button>
          {msg && <span className="text-[9px] text-cyan-300">{msg}</span>}
        </div>
      )}
      {adjustmentCents !== 0 && !editing && (
        <p className="text-[9px] text-amber-400 mt-1">
          ajuste: {adjustmentCents > 0 ? "+" : ""}R${" "}
          {(adjustmentCents / 100).toFixed(2).replace(".", ",")}
        </p>
      )}
    </div>
  );
}
