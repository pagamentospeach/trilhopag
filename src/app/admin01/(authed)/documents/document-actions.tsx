"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Percent,
  DollarSign,
  Moon,
  Sun,
  Flame,
  Network,
  Loader2,
} from "lucide-react";
import {
  adminConfirmKycApproval,
  adminRevertKycApproval,
  adminMoveUserMode,
} from "../../actions";
import type { DisplayFeesByMode } from "@/lib/mode-defaults";
import { modeHasCard, OPS_MODES, type OpsMode } from "@/lib/ops-modes";

type Fees = {
  feePercent: number;
  feeFixedCents: number;
  cardFeePercent: number;
  cardFeeFixedCents: number;
};

type Mode = OpsMode;

const MODE_META: Record<
  Mode,
  {
    label: string;
    sub: string;
    Icon: React.ComponentType<{ className?: string }>;
    iconWrap: string;
    iconCls: string;
    activeRing: string;
    ring: string;
  }
> = {
  black: {
    label: "Black",
    sub: "PIX anônimo",
    Icon: Moon,
    iconWrap: "bg-zinc-800/80 border-white/[0.06]",
    iconCls: "text-zinc-300",
    activeRing: "border-zinc-300/40 ring-2 ring-zinc-300/20",
    ring: "border-white/[0.08] hover:border-white/[0.16]",
  },
  white: {
    label: "White",
    sub: "PIX + cartão",
    Icon: Sun,
    iconWrap: "bg-zinc-100/[0.06] border-white/[0.12]",
    iconCls: "text-zinc-100",
    activeRing: "border-zinc-100/40 ring-2 ring-zinc-100/20",
    ring: "border-white/[0.10] hover:border-white/[0.20]",
  },
  hot: {
    label: "Hot",
    sub: "Alta conversão",
    Icon: Flame,
    iconWrap: "bg-orange-500/[0.12] border-orange-400/20",
    iconCls: "text-orange-400",
    activeRing: "border-orange-400/50 ring-2 ring-orange-400/25",
    ring: "border-orange-400/20 hover:border-orange-400/40",
  },
  sag: {
    label: "SAG",
    sub: "Sub adquirente gateway",
    Icon: Network,
    iconWrap: "bg-cyan-500/[0.12] border-cyan-400/20",
    iconCls: "text-cyan-400",
    activeRing: "border-cyan-400/50 ring-2 ring-cyan-400/25",
    ring: "border-cyan-400/20 hover:border-cyan-400/40",
  },
};

const MODES: readonly Mode[] = OPS_MODES;

const fmtPct = (n: number) => `${(Math.round(n * 100) / 100).toString()}%`;
const fmtReais = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DocumentActions({
  userId,
  notificationId,
  pixOpsMode,
  currentFees,
  modeFees,
}: {
  userId: string;
  notificationId: string;
  pixOpsMode: Mode;
  currentFees: Fees;
  /** Taxas REAIS por modo (referência dos outros modos no modal). */
  modeFees?: DisplayFeesByMode;
}) {
  // notificationId reservado pra futuro uso (logs/links)
  void notificationId;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  // Modo de adquirente atual (editável aqui mesmo via "mover").
  const [current, setCurrent] = useState<Mode>(pixOpsMode);
  const [moveMsg, setMoveMsg] = useState<string | null>(null);

  // Taxas editaveis no modal — pre-carrega com as atuais do seller
  const [fees, setFees] = useState<Fees>(currentFees);
  const [feesChanged, setFeesChanged] = useState(false);

  function updateFee<K extends keyof Fees>(k: K, v: number) {
    setFees((s) => ({ ...s, [k]: v }));
    setFeesChanged(true);
  }

  function move(mode: Mode) {
    if (mode === current || pending) return;
    setMoveMsg(null);
    startTransition(async () => {
      const r = await adminMoveUserMode(userId, mode);
      if (r.ok) {
        setCurrent(mode);
        // Reseta as taxas editáveis pro que o modo destino aplica.
        const mf = modeFees?.[mode];
        if (mf) {
          setFees({
            feePercent: mf.pixPct,
            feeFixedCents: mf.pixFix,
            cardFeePercent: mf.cardPct ?? fees.cardFeePercent,
            cardFeeFixedCents: mf.cardFix ?? fees.cardFeeFixedCents,
          });
        }
        setFeesChanged(false);
        setMoveMsg(`Movido pro modo ${MODE_META[mode].label} (taxas aplicadas).`);
        router.refresh();
      } else {
        setMoveMsg(r.error);
      }
    });
  }

  function confirm() {
    startTransition(async () => {
      await adminConfirmKycApproval(
        userId,
        // Só envia fees se admin alterou — assim não força update se ele
        // só clicou "Confirmar" sem mexer
        feesChanged ? fees : undefined,
      );
      setShowConfirm(false);
      router.refresh();
    });
  }
  function reject() {
    if (!reason.trim() || reason.trim().length < 5) return;
    startTransition(async () => {
      await adminRevertKycApproval({ userId, reason });
      setShowReject(false);
      setReason("");
    });
  }

  const cardOn = modeHasCard(current);
  const otherModes = MODES.filter((m) => m !== current);

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-50"
      >
        <Check className="size-3" /> Confirmar
      </button>
      <button
        type="button"
        onClick={() => setShowReject(true)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-50"
      >
        <X className="size-3" /> Rejeitar
      </button>

      {/* MODAL Confirmar — modo de adquirente + taxas por modo */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !pending && setShowConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-zinc-900 p-6"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                <Check className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Confirmar aprovação KYC
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Veja/ajuste o modo de adquirente e as taxas agora (opcional).
                  Se não mexer, mantém os valores atuais.
                </p>
              </div>
            </div>

            {/* Modo de adquirente — atual + mover */}
            <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/30 p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                Modo de adquirente · atual:{" "}
                <span className="text-white">{MODE_META[current].label}</span>
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {MODES.map((mode) => {
                  const m = MODE_META[mode];
                  const isCurrent = current === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={pending || isCurrent}
                      onClick={() => move(mode)}
                      className={`relative flex flex-col items-center gap-1.5 rounded-xl border bg-white/[0.02] px-2 py-3 transition disabled:cursor-default ${
                        isCurrent ? m.activeRing : m.ring + " hover:bg-white/[0.04]"
                      }`}
                      title={isCurrent ? "Modo atual" : `Mover pro modo ${m.label}`}
                    >
                      <span
                        className={`inline-flex size-8 items-center justify-center rounded-lg border ${m.iconWrap}`}
                      >
                        <m.Icon className={`size-4 ${m.iconCls}`} />
                      </span>
                      <span className="text-[11px] font-bold text-white">
                        {m.label}
                      </span>
                      <span className="text-[9px] text-zinc-500">{m.sub}</span>
                      {isCurrent && (
                        <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[8px] font-semibold text-cyan-300">
                          atual
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {moveMsg && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-zinc-300">
                  {pending && <Loader2 className="size-3 animate-spin" />}
                  {moveMsg}
                </p>
              )}
            </div>

            {/* Taxas do MODO ATUAL — editáveis */}
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/30 p-4 space-y-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                Taxas no modo {MODE_META[current].label}{" "}
                {feesChanged && "(alteradas)"}
              </p>

              {/* PIX */}
              <div>
                <p className="text-xs font-semibold text-amber-200 mb-2">PIX</p>
                <div className="grid grid-cols-2 gap-3">
                  <FeeInput
                    icon={Percent}
                    label="Taxa percentual"
                    value={fees.feePercent}
                    onChange={(v) => updateFee("feePercent", v)}
                    step={0.01}
                    suffix="%"
                    max={100}
                  />
                  <FeeInput
                    icon={DollarSign}
                    label="Taxa fixa (R$)"
                    value={fees.feeFixedCents / 100}
                    onChange={(v) =>
                      updateFee("feeFixedCents", Math.round(v * 100))
                    }
                    step={0.01}
                    prefix="R$"
                    max={1000}
                  />
                </div>
              </div>

              {/* Cartão — só no modo white (black/hot são PIX-only) */}
              {cardOn ? (
                <div>
                  <p className="text-xs font-semibold text-blue-200 mb-2">
                    Cartão
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FeeInput
                      icon={Percent}
                      label="Taxa percentual"
                      value={fees.cardFeePercent}
                      onChange={(v) => updateFee("cardFeePercent", v)}
                      step={0.01}
                      suffix="%"
                      max={100}
                    />
                    <FeeInput
                      icon={DollarSign}
                      label="Taxa fixa (R$)"
                      value={fees.cardFeeFixedCents / 100}
                      onChange={(v) =>
                        updateFee("cardFeeFixedCents", Math.round(v * 100))
                      }
                      step={0.01}
                      prefix="R$"
                      max={1000}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-600">
                  Cartão indisponível no modo {MODE_META[current].label} (só
                  PIX).
                </p>
              )}
            </div>

            {/* Demais modos — referência (read-only) */}
            {modeFees && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {otherModes.map((mode) => {
                  const m = MODE_META[mode];
                  const mf = modeFees[mode];
                  return (
                    <div
                      key={mode}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3"
                    >
                      <div className="flex items-center gap-1.5">
                        <m.Icon className={`size-3.5 ${m.iconCls}`} />
                        <span className="text-[11px] font-bold text-white">
                          {m.label}
                        </span>
                        <span className="ml-auto text-[9px] text-zinc-600">
                          referência
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11px] text-zinc-400">
                        <p className="flex justify-between">
                          <span>PIX</span>
                          <span className="tabular-nums text-zinc-200">
                            {fmtPct(mf.pixPct)} + {fmtReais(mf.pixFix)}
                          </span>
                        </p>
                        {mf.cardPct !== null && mf.cardFix !== null ? (
                          <p className="flex justify-between">
                            <span>Cartão</span>
                            <span className="tabular-nums text-zinc-200">
                              {fmtPct(mf.cardPct)} + {fmtReais(mf.cardFix)}
                            </span>
                          </p>
                        ) : (
                          <p className="text-[10px] text-zinc-600">
                            Cartão indisponível
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-50"
              >
                {pending
                  ? "Confirmando…"
                  : feesChanged
                    ? "Confirmar + Salvar taxas"
                    : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Rejeitar — inalterado */}
      {showReject && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowReject(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-red-500/30 bg-zinc-900 p-6"
          >
            <h3 className="text-lg font-bold text-white">Rejeitar documentos</h3>
            <p className="mt-1 text-xs text-zinc-400">
              O seller será bloqueado e precisará reenviar os documentos. Seja
              específico no motivo.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Documento ilegível, selfie sem segurar o documento…"
              rows={3}
              className="mt-4 w-full rounded-lg border border-white/[0.08] bg-black/30 p-2 text-sm text-white placeholder:text-zinc-500"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={pending || reason.trim().length < 5}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-50"
              >
                {pending ? "Rejeitando…" : "Rejeitar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeeInput({
  icon: Icon,
  label,
  value,
  onChange,
  step,
  suffix,
  prefix,
  max,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  suffix?: string;
  prefix?: string;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 inline-flex items-center gap-1">
        <Icon className="size-3" /> {label}
      </span>
      <div className="mt-1 flex items-center rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1.5 focus-within:ring-2 focus-within:ring-emerald-400/40">
        {prefix && (
          <span className="text-[10px] text-zinc-500 mr-1">{prefix}</span>
        )}
        <input
          type="number"
          min={0}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="flex-1 bg-transparent text-sm text-white outline-none tabular-nums"
        />
        {suffix && (
          <span className="text-[10px] text-zinc-500 ml-1">{suffix}</span>
        )}
      </div>
    </label>
  );
}
