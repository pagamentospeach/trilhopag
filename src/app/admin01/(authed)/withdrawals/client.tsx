"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, X, Loader2, AlertTriangle, ExternalLink, ShieldAlert, ShieldCheck, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { adminApproveWithdrawalAction, adminRejectWithdrawalAction, adminRetryAutoWithdrawAction } from "../../actions";
import type { WithdrawalAuditReport } from "@/lib/withdrawal-audit";

type Row = {
  id: string;
  createdAtFormatted: string;
  userName: string;
  userEmail: string;
  userId: string;
  amountFormatted: string;
  feeFormatted: string;
  /** Valor liquido (amountCents - feeCents) formatado em BRL — o que admin deve enviar. */
  netFormatted: string;
  /** Valor BRL bruto em cents (pra calcular conversão USDT na UI) */
  amountCents: number;
  feeCents: number;
  method: string;
  pixKey: string;
  pixKeyType: string;
  walletAddress: string | null;
  status: string;
  failReason: string | null;
  /** ID da transferência no PSP — só existe se o saque AUTOMÁTICO foi concluído.
   *  null = nenhuma transferência automática rolou (saque manual ou auto falhou). */
  providerId: string | null;
  /** Conta SafePix que ENVIOU o saque auto (code, ex: "safepix-2"). null = manual. */
  providerAccount: string | null;
  /** Nome amigável da conta (shortCode · nominal). */
  providerAccountLabel: string | null;
  auditScore: number;
  auditReport: WithdrawalAuditReport | null;
  /** Vendas pagas desde o último saque (só preenchido p/ PENDING/PROCESSING). */
  salesSince: {
    sinceLabel: string | null;
    grossFormatted: string;
    feeFormatted: string;
    netFormatted: string;
    count: number;
    byAcquirer: {
      name: string;
      shortCode: string | null;
      grossFormatted: string;
      netFormatted: string;
      count: number;
    }[];
  } | null;
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-400/15 text-yellow-300",
  PROCESSING: "bg-blue-400/15 text-blue-300",
  PAID: "bg-cyan-400/15 text-cyan-300",
  FAILED: "bg-red-500/15 text-red-300",
  REJECTED: "bg-zinc-500/15 text-zinc-400",
  CANCELED: "bg-zinc-500/15 text-zinc-400",
};

export function WithdrawalRow({ w }: { w: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // Auditoria começa SEMPRE colapsada — antes auto-abria com score>=40, o que
  // enchia a tela de flags WARN (quase sempre desnecessários). Agora o admin
  // expande só quando quer ver os detalhes/flags.
  const [showAudit, setShowAudit] = useState(false);

  function approve() {
    const isUsdt = w.method === "usdt_solana";
    const dest = isUsdt
      ? `carteira Solana ${w.walletAddress?.slice(0, 8)}…`
      : `PIX ${w.pixKey?.slice(0, 20)}…`;
    if (
      !confirm(
        `⚠️ Confirmar APROVAÇÃO?\n\n` +
          `Valor: ${w.amountFormatted}\n` +
          `Seller: ${w.userName}\n` +
          `Destino: ${dest}\n\n` +
          `Aprovar aqui significa que você JÁ ENVIOU o ${isUsdt ? "USDT pela DEX/exchange" : "PIX pelo app do banco"} manualmente. ` +
          `Não há chamada automática — o sistema apenas marca como PAID.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await adminApproveWithdrawalAction(w.id);
      if (r.ok) {
        router.refresh();
      } else {
        alert(`Erro: ${r.error}`);
      }
    });
  }

  function reject() {
    if (!reason.trim()) {
      alert("Informe o motivo da rejeição");
      return;
    }
    if (
      !confirm(
        `Rejeitar saque de ${w.amountFormatted}? O saldo do seller será estornado.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await adminRejectWithdrawalAction(w.id, reason.trim());
      if (r.ok) {
        setRejecting(false);
        setReason("");
        router.refresh();
      } else {
        alert(`Erro: ${r.error}`);
      }
    });
  }

  function retryAuto() {
    if (
      !confirm(
        `🔁 Re-tentar saque AUTOMÁTICO?\n\n` +
          `Valor: ${w.netFormatted} (líquido)\n` +
          `Seller: ${w.userName}\n` +
          `PIX: ${w.pixKey}\n\n` +
          `O sistema vai tentar ENVIAR via SafePix AGORA (testa todas as contas com saldo). ` +
          `Se sair, marca como PAGO. É envio REAL de dinheiro.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await adminRetryAutoWithdrawAction(w.id);
      if (r.ok) {
        alert(r.message ?? "Enviado ✓");
        router.refresh();
      } else {
        alert(`Não enviou: ${r.error}`);
      }
    });
  }

  const auditTone =
    w.auditScore >= 70
      ? "bg-red-500/15 text-red-300 border-red-500/40"
      : w.auditScore >= 40
        ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/40"
        : "bg-cyan-500/10 text-cyan-300 border-cyan-500/30";

  const auditIcon =
    w.auditScore >= 40 ? (
      <ShieldAlert className="size-3" />
    ) : (
      <ShieldCheck className="size-3" />
    );

  const statusBadge = (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
        STATUS_COLOR[w.status] ?? "bg-zinc-500/15 text-zinc-400"
      }`}
    >
      {w.status}
    </span>
  );

  const statusMeta = (
    <>
      {w.providerId &&
        w.providerAccount &&
        (w.status === "PAID" || w.status === "PROCESSING") && (
          <p
            className="inline-flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 text-[9px] font-bold text-blue-300"
            title={`Saque automático enviado pela conta ${w.providerAccount}`}
          >
            💸 {w.providerAccountLabel ?? w.providerAccount}
          </p>
        )}
      {!w.providerId && w.status === "PAID" && (
        <p
          className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 text-[9px] font-bold text-amber-300"
          title="Pago manualmente pelo admin — não saiu de nenhuma adquirente automaticamente."
        >
          ✋ pago manual
        </p>
      )}
      {w.failReason && w.status !== "PAID" && (
        <p className="text-[10px] text-red-300/70 line-clamp-2">
          {w.failReason}
        </p>
      )}
    </>
  );

  const actions = w.status === "PENDING" && (
    <div className="grid grid-cols-3 gap-1.5 md:flex md:flex-wrap md:justify-end">
      {w.method === "pix" && (
        <button
          type="button"
          onClick={retryAuto}
          disabled={pending}
          className="inline-flex items-center justify-center gap-1 rounded-full bg-blue-500/15 px-3 py-2 md:py-1 text-[11px] font-bold text-blue-300 hover:bg-blue-500/25 disabled:opacity-50 min-h-[36px] md:min-h-0"
          title="Re-tentar o saque AUTOMÁTICO via SafePix (testa todas as contas com saldo)"
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
          Retry
        </button>
      )}
      <button
        type="button"
        onClick={approve}
        disabled={pending}
        className={`inline-flex items-center justify-center gap-1 rounded-full bg-cyan-400 px-3 py-2 md:py-1 text-[11px] font-bold text-black hover:bg-cyan-300 disabled:opacity-50 min-h-[36px] md:min-h-0 ${w.method === "pix" ? "" : "col-span-2"}`}
        title="Marcar como PAGO (você já enviou o PIX manualmente)"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        Aprovar
      </button>
      <button
        type="button"
        onClick={() => setRejecting((v) => !v)}
        disabled={pending}
        className="inline-flex items-center justify-center gap-1 rounded-full bg-red-500/15 px-3 py-2 md:py-1 text-[11px] text-red-300 hover:bg-red-500/25 disabled:opacity-50 min-h-[36px] md:min-h-0"
      >
        <X className="size-3" />
        Rejeitar
      </button>
    </div>
  );

  return (
    <div className="border-b border-white/[0.04]">
      {/* ═══════ DESKTOP (md+) — layout de tabela clássico ═══════ */}
      <div className="hidden md:grid grid-cols-[140px_1.5fr_120px_140px_180px] gap-4 px-5 py-3 text-sm">
        <div className="text-xs text-zinc-400">{w.createdAtFormatted}</div>

        <div className="min-w-0">
          <Link
            href={`/admin01/users/${w.userId}`}
            className="text-white truncate hover:text-cyan-300 inline-flex items-center gap-1"
          >
            {w.userName}
            <ExternalLink className="size-3 opacity-50" />
          </Link>
          <p className="text-[10px] text-zinc-500 truncate">{w.userEmail}</p>
          {w.method === "usdt_solana" ? (
            <div className="mt-0.5 rounded bg-purple-500/10 px-1.5 py-1 border border-purple-500/30">
              <p className="text-[9px] uppercase text-purple-300 font-bold tracking-wider">
                USDT · Solana (P2P manual)
              </p>
              <p className="text-[10px] text-purple-100 font-mono break-all">
                {w.walletAddress ?? "—"}
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-500 truncate font-mono mt-0.5">
              PIX/{w.pixKeyType}: {w.pixKey}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="font-mono text-zinc-400 text-xs line-through opacity-70">{w.amountFormatted}</p>
          <p className="text-[10px] text-zinc-500">– taxa {w.feeFormatted}</p>
          {w.method === "usdt_solana" ? (
            <div className="mt-1 rounded bg-purple-500/15 px-1.5 py-1 border border-purple-500/30">
              <p className="text-[9px] uppercase text-purple-300 font-bold tracking-wider">
                Enviar ao seller
              </p>
              <p className="text-sm font-mono font-bold text-purple-100">
                {formatUsdt(w.amountCents - w.feeCents)} USDT
              </p>
              <p className="text-[9px] text-purple-300/60">
                cotação R$ 5,80 · {w.netFormatted}
              </p>
            </div>
          ) : (
            <div className="mt-1 rounded bg-cyan-500/15 px-1.5 py-1 border border-cyan-500/40">
              <p className="text-[9px] uppercase text-cyan-300 font-bold tracking-wider">
                Enviar via PIX
              </p>
              <p className="text-sm font-mono font-bold text-cyan-100">
                {w.netFormatted}
              </p>
              <p className="text-[9px] text-cyan-300/60">
                líquido (já sem fee)
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1">
          {statusBadge}
          {statusMeta}
        </div>

        <div className="text-right">
          {actions || <span className="text-[10px] text-zinc-500 italic">—</span>}
        </div>
      </div>

      {/* ═══════ MOBILE (< md) — layout empilhado ═══════ */}
      <div className="md:hidden p-3 space-y-2.5">
        {/* Linha 1: data + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500">{w.createdAtFormatted}</span>
          {statusBadge}
        </div>

        {/* Seller */}
        <div className="min-w-0">
          <Link
            href={`/admin01/users/${w.userId}`}
            className="text-sm text-white hover:text-cyan-300 inline-flex items-center gap-1 max-w-full"
          >
            <span className="truncate">{w.userName}</span>
            <ExternalLink className="size-3 opacity-50 shrink-0" />
          </Link>
          <p className="text-[10px] text-zinc-500 truncate">{w.userEmail}</p>
        </div>

        {/* Destino (PIX ou USDT) */}
        {w.method === "usdt_solana" ? (
          <div className="rounded bg-purple-500/10 px-2 py-1.5 border border-purple-500/30">
            <p className="text-[9px] uppercase text-purple-300 font-bold tracking-wider">
              USDT · Solana
            </p>
            <p className="text-[10px] text-purple-100 font-mono break-all">
              {w.walletAddress ?? "—"}
            </p>
          </div>
        ) : (
          <div className="rounded bg-white/[0.02] border border-white/[0.06] px-2 py-1.5">
            <p className="text-[9px] uppercase text-zinc-500 font-bold tracking-wider">
              PIX · {w.pixKeyType}
            </p>
            <p className="text-[11px] text-zinc-200 font-mono break-all">
              {w.pixKey}
            </p>
          </div>
        )}

        {/* Valor a enviar — destaque */}
        {w.method === "usdt_solana" ? (
          <div className="rounded-lg bg-purple-500/15 px-3 py-2 border border-purple-500/30">
            <p className="text-[9px] uppercase text-purple-300 font-bold tracking-wider">
              Enviar ao seller
            </p>
            <p className="text-lg font-mono font-bold text-purple-100">
              {formatUsdt(w.amountCents - w.feeCents)} USDT
            </p>
            <p className="text-[10px] text-purple-300/70">
              R$ {w.amountFormatted} bruto · −{w.feeFormatted} fee · {w.netFormatted} líq · cotação R$5,80
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-cyan-500/15 px-3 py-2 border border-cyan-500/40">
            <p className="text-[9px] uppercase text-cyan-300 font-bold tracking-wider">
              Enviar via PIX
            </p>
            <p className="text-lg font-mono font-bold text-cyan-100">
              {w.netFormatted}
            </p>
            <p className="text-[10px] text-cyan-300/70">
              {w.amountFormatted} bruto · −{w.feeFormatted} fee
            </p>
          </div>
        )}

        {/* Meta do status */}
        {(w.providerId && w.providerAccount) || (!w.providerId && w.status === "PAID") || w.failReason ? (
          <div className="flex flex-wrap gap-1.5">
            {statusMeta}
          </div>
        ) : null}

        {/* Ações — botões grandes, mobile-friendly */}
        {actions}
      </div>

      {/* 💰 VENDAS DESDE O ÚLTIMO SAQUE */}
      {w.salesSince && (
        <div className="px-3 md:px-5 pb-2">
          <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.03] p-2.5 sm:p-3">
            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-2 leading-snug">
              💰 Vendas desde o último saque{" "}
              <span className="font-normal normal-case text-zinc-500">
                {w.salesSince.sinceLabel
                  ? `· desde ${w.salesSince.sinceLabel}`
                  : "· (nunca sacou)"}{" "}
                · {w.salesSince.count} venda(s)
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <p className="text-[9px] uppercase text-zinc-500">Bruto</p>
                <p className="text-xs sm:text-sm font-bold text-white tabular-nums break-all">
                  {w.salesSince.grossFormatted}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-zinc-500">Taxas</p>
                <p className="text-xs sm:text-sm font-bold text-red-300 tabular-nums break-all">
                  −{w.salesSince.feeFormatted}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-zinc-500">Líquido</p>
                <p className="text-xs sm:text-sm font-bold text-cyan-300 tabular-nums break-all">
                  {w.salesSince.netFormatted}
                </p>
              </div>
            </div>
            {w.salesSince.byAcquirer.length > 0 && (
              <div className="border-t border-white/[0.06] pt-2 space-y-1.5">
                <p className="text-[9px] uppercase text-zinc-500 mb-1">
                  Por adquirente
                </p>
                {w.salesSince.byAcquirer.map((a, i) => (
                  <div
                    key={i}
                    className="text-[11px]"
                  >
                    {/* Desktop: 1 linha; Mobile: nome em cima, valores embaixo */}
                    <div className="hidden sm:flex items-center gap-2">
                      {a.shortCode && (
                        <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-300 w-12 text-center">
                          {a.shortCode}
                        </span>
                      )}
                      <span
                        className="flex-1 min-w-0 truncate text-zinc-300"
                        title={a.name}
                      >
                        {a.name}
                      </span>
                      <span className="shrink-0 text-zinc-500">{a.count}×</span>
                      <span className="shrink-0 text-zinc-200 font-mono tabular-nums w-24 text-right">
                        {a.grossFormatted}
                      </span>
                      <span
                        className="shrink-0 text-cyan-300/80 font-mono tabular-nums w-24 text-right"
                        title="líquido após taxas"
                      >
                        {a.netFormatted}
                      </span>
                    </div>
                    <div className="sm:hidden rounded border border-white/[0.05] bg-black/20 p-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        {a.shortCode && (
                          <span className="shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-bold uppercase text-zinc-300">
                            {a.shortCode}
                          </span>
                        )}
                        <span className="flex-1 min-w-0 truncate text-zinc-300 text-[11px]">
                          {a.name}
                        </span>
                        <span className="shrink-0 text-zinc-500 text-[10px]">{a.count}×</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-mono tabular-nums pl-1">
                        <span className="text-zinc-400">bruto {a.grossFormatted}</span>
                        <span className="text-cyan-300/80">líq {a.netFormatted}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUDIT BAR — sempre visivel pra qq saque com auditReport */}
      {w.auditReport && (
        <div className="px-3 md:px-5 pb-2">
          <button
            type="button"
            onClick={() => setShowAudit((v) => !v)}
            className={`w-full text-left inline-flex items-center justify-between gap-2 rounded-lg border px-2.5 sm:px-3 py-1.5 text-[11px] ${auditTone}`}
          >
            <span className="inline-flex items-center gap-1.5 font-bold min-w-0 flex-wrap">
              {auditIcon}
              <span>Auditoria · {w.auditScore}/100</span>
              {w.auditReport.flags.length > 0 && (
                <span className="opacity-70">
                  · {w.auditReport.flags.length} flag{w.auditReport.flags.length > 1 ? "s" : ""}
                </span>
              )}
              {!w.auditReport.balanceMatch.ok && (
                <span className="opacity-90 font-mono">
                  · drift R$ {(Math.abs(w.auditReport.balanceMatch.drift) / 100).toFixed(2)}
                </span>
              )}
            </span>
            {showAudit ? <ChevronUp className="size-3 shrink-0" /> : <ChevronDown className="size-3 shrink-0" />}
          </button>
          {showAudit && (
            <div className="mt-2 space-y-2 rounded-lg border border-white/[0.06] bg-black/40 p-2.5 sm:p-3 text-[11px]">
              {/* Balance match — 2 col mobile, 3 col desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-zinc-400 font-mono">
                <div>
                  <p className="text-[9px] uppercase text-zinc-500">Vendas PAID (net)</p>
                  <p>R$ {(w.auditReport.balanceMatch.paidNetCents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-zinc-500">Refunds + CB</p>
                  <p>
                    R$ {(
                      (w.auditReport.balanceMatch.refundedNetCents +
                        w.auditReport.balanceMatch.chargebackNetCents) /
                      100
                    ).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-zinc-500">Já sacado</p>
                  <p>R$ {(w.auditReport.balanceMatch.withdrawnCents / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-zinc-500">Saldo esperado</p>
                  <p
                    className={
                      w.auditReport.balanceMatch.ok ? "text-cyan-300" : "text-red-300"
                    }
                  >
                    R$ {(w.auditReport.balanceMatch.expectedBalance / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-zinc-500">Saldo real DB</p>
                  <p>R$ {(w.auditReport.balanceMatch.actualBalance / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-zinc-500">Refund / CB rate</p>
                  <p>
                    {(w.auditReport.ratios.refundRate * 100).toFixed(1)}% / {(w.auditReport.ratios.chargebackRate * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Flags */}
              {w.auditReport.flags.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-white/[0.05]">
                  {w.auditReport.flags.map((f, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded px-2 py-1.5 ${
                        f.severity === "block"
                          ? "bg-red-500/10 border border-red-500/30"
                          : f.severity === "warn"
                            ? "bg-yellow-500/10 border border-yellow-500/30"
                            : "bg-blue-500/10 border border-blue-500/30"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          f.severity === "block"
                            ? "bg-red-500 text-white"
                            : f.severity === "warn"
                              ? "bg-yellow-500 text-black"
                              : "bg-blue-500 text-white"
                        }`}
                      >
                        {f.severity}
                      </span>
                      <div className="flex-1">
                        <p className="font-mono text-[10px] text-zinc-500">{f.code}</p>
                        <p className="text-[11px] text-zinc-200">{f.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {w.auditReport.flags.length === 0 && (
                <p className="text-[11px] text-cyan-300 inline-flex items-center gap-1 pt-1 border-t border-white/[0.05]">
                  <ShieldCheck className="size-3" /> Nenhuma flag detectada. Saque limpo.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {rejecting && w.status === "PENDING" && (
        <div className="bg-red-500/[0.04] px-3 md:px-5 py-3 border-t border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-red-300 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-red-200 mb-2 leading-snug">
                Motivo da rejeição (será enviado por email ao seller, saldo estornado):
              </p>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: chave PIX inválida / KYC incompleto"
                className="w-full rounded-lg border border-red-500/30 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-zinc-500 mb-2"
              />
              <div className="grid grid-cols-2 md:flex md:flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={reject}
                  disabled={pending || !reason.trim()}
                  className="rounded-full bg-red-500 px-4 py-2 text-[11px] font-bold text-white hover:bg-red-400 disabled:opacity-50 min-h-[36px]"
                >
                  {pending ? <Loader2 className="size-3 animate-spin inline" /> : "Confirmar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setReason("");
                  }}
                  disabled={pending}
                  className="rounded-full border border-white/[0.08] px-3 py-2 text-[11px] text-zinc-400 hover:text-white min-h-[36px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Converte BRL cents → USDT à cotação fixa R$ 5,80/USDT.
 * O 1% (davi 23/07/2026, sem taxa fixa) já foi descontado do amountCents
 * antes de chamar isso — portanto este valor é exatamente o que admin deve
 * transferir ao seller.
 *
 * IMPORTANTE: cotação fixa é simplificação. Pra production-grade, integrar
 * com Coingecko/Binance e atualizar dinamicamente.
 */
function formatUsdt(brlCents: number): string {
  const USDT_RATE_BRL = 5.8;
  const usdt = brlCents / 100 / USDT_RATE_BRL;
  return usdt.toFixed(2).replace(".", ",");
}
