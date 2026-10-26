"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import {
  adminSetAutoWithdrawKill,
  adminResetAutoWithdrawBreaker,
  adminClearAutoWithdrawBlockedIps,
  adminResolveSafepixDrift,
} from "../../actions";

export type AutoWithdrawControlData = {
  killed: boolean;
  breaker: {
    fails: number;
    threshold: number;
    trippedUntil: string | null;
    open: boolean;
  };
  blockedIps: { ip: string; account: string; atLabel: string }[];
  balanceDrifts: { id: string; message: string }[];
  dispersed: {
    count: number;
    totalReais: string;
    maxSingleReais: string;
    totalAvailableReais: string;
    items: { userLabel: string; payoutReais: string }[];
  } | null;
};

export function AutoWithdrawControl({ data }: { data: AutoWithdrawControlData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggleKill(next: boolean) {
    setErr(null);
    startTransition(async () => {
      const r = await adminSetAutoWithdrawKill(next);
      if (!r.ok) setErr(r.error);
      router.refresh();
    });
  }

  function resetBreaker() {
    setErr(null);
    startTransition(async () => {
      const r = await adminResetAutoWithdrawBreaker();
      if (!r.ok) setErr(r.error);
      router.refresh();
    });
  }

  function clearBlockedIps() {
    setErr(null);
    startTransition(async () => {
      const r = await adminClearAutoWithdrawBlockedIps();
      if (!r.ok) setErr(r.error);
      router.refresh();
    });
  }

  function resolveDrift() {
    setErr(null);
    startTransition(async () => {
      const r = await adminResolveSafepixDrift();
      if (!r.ok) setErr(r.error);
      router.refresh();
    });
  }

  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  function copyIp(ip: string) {
    navigator.clipboard?.writeText(ip).then(
      () => {
        setCopiedIp(ip);
        setTimeout(() => setCopiedIp(null), 1500);
      },
      () => {},
    );
  }

  const { killed, breaker, blockedIps, balanceDrifts, dispersed } = data;
  const trippedTime = breaker.trippedUntil
    ? new Date(breaker.trippedUntil).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="border-b border-white/[0.06] bg-black/30 px-5 py-3 flex items-center gap-2">
        <Zap className="size-4 text-orange-300" />
        <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-300">
          Saque automático · controles
        </h2>
      </div>
      <div className="p-5 space-y-4">
        {err && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {err}
          </p>
        )}

        {/* 🚨 AUDITORIA DE SALDO — queda sem saque que explique (possível dreno) */}
        {balanceDrifts.length > 0 && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/[0.1] p-3.5">
            <p className="text-xs font-bold text-red-200 flex items-center gap-1.5">
              <AlertTriangle className="size-4" /> Auditoria de saldo SafePix —
              possível saque NÃO autorizado
            </p>
            <ul className="mt-2 space-y-1.5">
              {balanceDrifts.map((d) => (
                <li
                  key={d.id}
                  className="text-[11px] text-red-100/90 leading-relaxed rounded-md border border-red-500/20 bg-black/30 px-2.5 py-1.5"
                >
                  {d.message}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={resolveDrift}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] transition disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}{" "}
              Investiguei — marcar como resolvido
            </button>
          </div>
        )}

        {/* IP BLOQUEADO PELA SAFEPIX — ação necessária */}
        {blockedIps.length > 0 && (
          <div className="rounded-lg border border-red-500/35 bg-red-500/[0.07] p-3.5">
            <p className="text-xs font-bold text-red-200 flex items-center gap-1.5">
              <Globe className="size-4" /> IP novo do servidor — adicione na
              SafePix
            </p>
            <p className="text-[11px] text-red-100/80 mt-1 leading-relaxed">
              O Vercel trocou o IP de saída e a SafePix recusou o saque. Adicione
              o(s) IP(s) abaixo em <strong>Gerenciar IPs Autorizados</strong> nas
              contas SafePix, depois clique em “Já adicionei”.
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {blockedIps.map((b) => (
                <li
                  key={b.ip}
                  className="flex items-center gap-2 rounded-md border border-red-500/20 bg-black/30 px-2.5 py-1.5"
                >
                  <code className="text-sm font-bold text-red-100 tabular-nums flex-1">
                    {b.ip}
                  </code>
                  <span className="text-[10px] text-red-200/50">
                    {b.account} · {b.atLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyIp(b.ip)}
                    className="shrink-0 inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-zinc-200 hover:bg-white/[0.08] transition"
                  >
                    {copiedIp === b.ip ? (
                      <>
                        <Check className="size-3 text-cyan-300" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copiar
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={clearBlockedIps}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 transition disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{" "}
              Já adicionei na SafePix
            </button>
          </div>
        )}

        {/* KILL-SWITCH GLOBAL (#2) */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">
              {killed ? (
                <span className="text-red-300">⛔ Saque automático CONGELADO</span>
              ) : (
                <span className="text-cyan-300">✅ Saque automático operando</span>
              )}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
              Botão de emergência GLOBAL. Congela TODOS os saques auto (caem pro
              manual). Não afeta saques manuais.
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggleKill(!killed)}
            className={`shrink-0 inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
              killed
                ? "bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 border border-cyan-500/30"
                : "bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30"
            }`}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : killed ? (
              "Descongelar"
            ) : (
              "CONGELAR TUDO"
            )}
          </button>
        </div>

        {/* CIRCUIT BREAKER (#3) */}
        <div className="border-t border-white/[0.05] pt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">Circuit breaker</p>
            {breaker.open ? (
              <p className="text-[11px] text-red-300 mt-0.5">
                🔴 ABERTO — saques auto pausados até ~{trippedTime} (
                {breaker.fails} falhas seguidas na SafePix)
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                🟢 Fechado · {breaker.fails}/{breaker.threshold} falhas. Abre
                sozinho após {breaker.threshold} falhas claras seguidas e fecha
                após o cooldown (ou no 1º envio OK).
              </p>
            )}
          </div>
          {(breaker.open || breaker.fails > 0) && (
            <button
              type="button"
              disabled={pending}
              onClick={resetBreaker}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.06] transition disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" /> Resetar
            </button>
          )}
        </div>

        {/* SALDO DISPERSO (#4) */}
        {dispersed && dispersed.count > 0 && (
          <div className="border-t border-white/[0.05] pt-4">
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
              <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" /> Saldo SafePix disperso
              </p>
              <p className="text-[11px] text-amber-100/80 mt-1 leading-relaxed">
                {dispersed.count} saque(s) PIX pendentes ({dispersed.totalReais})
                poderiam ser automáticos, mas NENHUMA conta sozinha cobre o valor
                — mesmo o total disponível ({dispersed.totalAvailableReais})
                cobrindo. Maior conta sozinha: {dispersed.maxSingleReais}.
                Consolide as nominais pra destravar o automático.
              </p>
              <ul className="mt-2 space-y-0.5">
                {dispersed.items.map((it, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-amber-100/70 tabular-nums"
                  >
                    · {it.userLabel} — {it.payoutReais}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
