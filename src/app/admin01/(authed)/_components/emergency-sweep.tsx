"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, Loader2, TrendingUp } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { adminEmergencySweep, adminSweepGatewayProfit } from "../../actions";

type SweepAccount = {
  account: string;
  balanceCents: number;
  sentCents: number;
  status: string;
  providerId?: string | null;
  error?: string | null;
};

type SweepReport = {
  percent: number;
  pixKey: string;
  totalSentCents: number;
  accounts: SweepAccount[];
};

type ProfitReport = {
  requestedCents: number;
  pixKey: string;
  totalSentCents: number;
  accounts: SweepAccount[];
};

export type GatewayProfitData = {
  totalAvailCents: number;
  sellerLiabilitiesCents: number;
  pendingPayoutsCents: number;
  profitCents: number;
};

export function EmergencySweep({
  pixKey,
  totalAvailCents,
  profit,
}: {
  pixKey: string;
  totalAvailCents: number;
  profit: GatewayProfitData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<50 | 100 | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<SweepReport | null>(null);

  // Estado próprio do saque de LUCRO (separado do sweep total).
  const [profitPending, startProfitTransition] = useTransition();
  const [profitConfirming, setProfitConfirming] = useState(false);
  const [profitErr, setProfitErr] = useState<string | null>(null);
  const [profitReport, setProfitReport] = useState<ProfitReport | null>(null);

  function run(percent: 50 | 100) {
    setErr(null);
    setReport(null);
    startTransition(async () => {
      const r = await adminEmergencySweep(percent);
      if (!r.ok) setErr(r.error);
      else setReport(r.report);
      setConfirming(null);
      router.refresh();
    });
  }

  function runProfit() {
    setProfitErr(null);
    setProfitReport(null);
    startProfitTransition(async () => {
      const r = await adminSweepGatewayProfit();
      if (!r.ok) setProfitErr(r.error);
      else setProfitReport(r.report);
      setProfitConfirming(false);
      router.refresh();
    });
  }

  const slice = (p: 50 | 100) =>
    p === 100 ? totalAvailCents : Math.floor(totalAvailCents / 2);

  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.05] overflow-hidden">
      <div className="border-b border-red-500/20 bg-red-500/[0.08] px-5 py-3 flex items-center gap-2">
        <AlertOctagon className="size-4 text-red-400" />
        <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-red-200">
          Saque de emergência · varre todas as adquirentes
        </h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-[12px] text-red-100/80 leading-relaxed">
          Manda <strong>100% ou 50%</strong> do saldo de{" "}
          <strong>todas as contas SafePix</strong> de uma vez pra chave PIX fixa
          abaixo. É tesouraria — esvazia as adquirentes,{" "}
          <strong>não mexe no saldo dos sellers</strong>. Use só em emergência.
        </p>

        <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Destino fixo (PIX · EVP — não muda nunca)
          </p>
          <code className="text-sm font-bold text-cyan-300 break-all">
            {pixKey}
          </code>
        </div>

        <div className="text-[12px] text-zinc-400">
          Saldo PIX-OUT disponível (SafePix + Pluggou):{" "}
          <strong className="text-white tabular-nums">
            {formatBRL(totalAvailCents)}
          </strong>
          <span className="text-zinc-600">
            {" "}
            · 100% = {formatBRL(slice(100))} · 50% = {formatBRL(slice(50))}
          </span>
        </div>

        {/* ===== LUCRO DO GATEWAY — saca só o lucro pra mesma chave fixa ===== */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-400" />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-200">
              Lucro do gateway · sacar só o lucro
            </h3>
          </div>

          <p className="text-[12px] leading-relaxed text-emerald-100/70">
            Quanto do saldo nas adquirentes é <strong>lucro da plataforma</strong>{" "}
            (não é dinheiro de seller). Calculado ao vivo:{" "}
            <span className="text-zinc-300">total disponível</span> −{" "}
            <span className="text-zinc-300">saldo dos sellers</span> −{" "}
            <span className="text-zinc-300">saques em trânsito</span>.
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-black/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Total disponível
              </p>
              <p className="text-sm font-bold tabular-nums text-white">
                {formatBRL(profit.totalAvailCents)}
              </p>
            </div>
            <div className="rounded-lg bg-black/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Devido aos sellers
              </p>
              <p className="text-sm font-bold tabular-nums text-zinc-300">
                −{formatBRL(profit.sellerLiabilitiesCents)}
              </p>
            </div>
            <div className="rounded-lg bg-black/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Saques em trânsito
              </p>
              <p className="text-sm font-bold tabular-nums text-zinc-300">
                −{formatBRL(profit.pendingPayoutsCents)}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">
                Lucro sacável
              </p>
              <p className="text-base font-extrabold tabular-nums text-emerald-300">
                {formatBRL(profit.profitCents)}
              </p>
            </div>
          </div>

          {profitErr && (
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {profitErr}
            </p>
          )}

          {!profitConfirming ? (
            <button
              type="button"
              disabled={profitPending || profit.profitCents <= 0}
              onClick={() => setProfitConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <TrendingUp className="size-4" />
              Sacar lucro ({formatBRL(profit.profitCents)})
            </button>
          ) : (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.08] p-3">
              <p className="text-sm font-bold text-emerald-100">
                Confirmar: sacar o lucro de{" "}
                <strong>{formatBRL(profit.profitCents)}</strong> pra{" "}
                <code className="text-cyan-300 break-all">{pixKey}</code>?
              </p>
              <p className="text-[11px] text-emerald-200/70 mt-1">
                O valor é <strong>recalculado no servidor</strong> no clique — só
                sai o que de fato é lucro, nunca dinheiro de seller.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  disabled={profitPending}
                  onClick={runProfit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/30 border border-emerald-500/50 px-4 py-2 text-xs font-bold text-emerald-50 hover:bg-emerald-500/45 transition disabled:opacity-50"
                >
                  {profitPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <TrendingUp className="size-4" />
                  )}{" "}
                  SIM, sacar lucro agora
                </button>
                <button
                  type="button"
                  disabled={profitPending}
                  onClick={() => setProfitConfirming(false)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.06] transition disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {profitReport && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-bold text-emerald-200">
                Lucro enviado: {formatBRL(profitReport.totalSentCents)}
              </p>
              <ul className="mt-2 space-y-1">
                {profitReport.accounts.map((a) => (
                  <li
                    key={a.account}
                    className="text-[11px] flex items-center gap-2 tabular-nums"
                  >
                    <span className="text-zinc-400 w-24 shrink-0">{a.account}</span>
                    {a.status === "sent" ? (
                      <span className="text-cyan-300">
                        ✓ {formatBRL(a.sentCents)} enviado
                      </span>
                    ) : a.status === "skipped" ? (
                      <span className="text-zinc-500">— sem saldo</span>
                    ) : (
                      <span className="text-red-300 break-all">✗ {a.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-red-500/15 pt-1 text-[10px] uppercase tracking-[0.15em] text-red-300/60">
          Saque total (esvaziar tudo) ↓
        </div>

        {err && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {err}
          </p>
        )}

        {confirming === null ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(50)}
              className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition disabled:opacity-50"
            >
              Sacar 50% de tudo
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(100)}
              className="rounded-lg border border-red-500/50 bg-red-500/20 px-4 py-2 text-xs font-bold text-red-100 hover:bg-red-500/30 transition disabled:opacity-50"
            >
              Sacar 100% de tudo
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-red-500/40 bg-red-500/[0.08] p-3">
            <p className="text-sm font-bold text-red-100">
              Confirmar: sacar <strong>{confirming}%</strong> (~
              {formatBRL(slice(confirming))}) de TODAS as contas pra{" "}
              <code className="text-cyan-300 break-all">{pixKey}</code>?
            </p>
            <p className="text-[11px] text-red-200/70 mt-1">
              Ação imediata e irreversível — o dinheiro sai pra essa chave.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(confirming)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/30 border border-red-500/50 px-4 py-2 text-xs font-bold text-red-50 hover:bg-red-500/45 transition disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <AlertOctagon className="size-4" />
                )}{" "}
                SIM, sacar {confirming}% agora
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(null)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.06] transition disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {report && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-bold text-white">
              Resultado: {formatBRL(report.totalSentCents)} enviados (
              {report.percent}%)
            </p>
            <ul className="mt-2 space-y-1">
              {report.accounts.map((a) => (
                <li
                  key={a.account}
                  className="text-[11px] flex items-center gap-2 tabular-nums"
                >
                  <span className="text-zinc-400 w-24 shrink-0">{a.account}</span>
                  {a.status === "sent" ? (
                    <span className="text-cyan-300">
                      ✓ {formatBRL(a.sentCents)} enviado
                    </span>
                  ) : a.status === "skipped" ? (
                    <span className="text-zinc-500">— sem saldo</span>
                  ) : (
                    <span className="text-red-300 break-all">✗ {a.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
