"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Wallet,
  ArrowUpRight,
  Clock,
  CreditCard,
  ShieldCheck,
  X,
  TrendingUp,
} from "lucide-react";
import { WithdrawForm } from "./withdraw-form";
import { formatBRL } from "@/lib/utils";

type Destination = {
  id: string;
  type: "pix" | "usdt_solana";
  label: string;
  pixKey: string | null;
  pixKeyType: string | null;
  walletAddress: string | null;
  isDefault: boolean;
};

/**
 * Hero moderno da aba Financeiro (17/07/2026, davi: "deixa essa aba mais
 * moderna e apresentavel").
 *
 * Um único card grande com o saldo disponível + CTA "Sacar agora". Os 3 buckets
 * secundários (pending PIX, pending cartão, retenção) ficam em pills compactas
 * abaixo — não competem visualmente com o saldo principal. Drawer abre com o
 * form completo no clique.
 */
export function FinanceiroHero({
  twoFactorEnabled,
  availableCents,
  pendingPixCents,
  pendingCardCents,
  retainedCardCents,
  totalPendingCents,
  pixFeeCents,
  destinations,
}: {
  /** Ver withdraw-form: decide se o campo de codigo aparece na revisao. */
  twoFactorEnabled: boolean;
  availableCents: number;
  pendingPixCents: number;
  pendingCardCents: number;
  retainedCardCents: number;
  totalPendingCents: number;
  pixFeeCents: number;
  destinations: Destination[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const canWithdraw = availableCents >= 5000; // R$50 mín

  return (
    <>
      {/* CARD PRINCIPAL — saldo grande + CTA */}
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/[0.08] via-transparent to-transparent p-6 sm:p-8">
        {/* Glow decorativo */}
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-32 -bottom-32 size-96 rounded-full bg-emerald-400/[0.05] blur-3xl" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
                <Wallet className="size-4" />
              </div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300 font-bold">
                Saldo disponível
              </p>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-bold text-white tabular-nums leading-none">
                {formatBRL(availableCents)}
              </span>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Pronto pra saque · taxa de{" "}
              <span className="text-zinc-300 font-medium">
                {formatBRL(pixFeeCents)}
              </span>{" "}
              por PIX
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            disabled={!canWithdraw}
            className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-cyan-400 px-6 py-3 text-sm font-bold text-black transition hover:bg-cyan-300 hover:shadow-[0_0_40px_rgba(34, 211, 238,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
          >
            {canWithdraw ? "Sacar agora" : "Saldo mínimo R$ 50"}
            {canWithdraw && (
              <ArrowUpRight className="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            )}
          </button>
        </div>

        {/* Buckets secundários — pills compactas */}
        {totalPendingCents > 0 && (
          <div className="relative mt-6 grid grid-cols-1 gap-2 border-t border-white/[0.06] pt-5 sm:grid-cols-3">
            <BucketPill
              icon={Clock}
              label="PIX processando"
              value={pendingPixCents}
              hint="Libera em ~1 min"
              tint="blue"
            />
            <BucketPill
              icon={CreditCard}
              label="Cartão D+30"
              value={pendingCardCents}
              hint="Libera 30 dias após venda"
              tint="amber"
            />
            <BucketPill
              icon={ShieldCheck}
              label="Retido 10% · 90d"
              value={retainedCardCents}
              hint="Cobertura de chargeback"
              tint="purple"
            />
          </div>
        )}
      </section>

      {/* Drawer do form */}
      {drawerOpen && typeof document !== "undefined" && (
        <WithdrawDrawer
          onClose={() => setDrawerOpen(false)}
          availableCents={availableCents}
          pixFeeCents={pixFeeCents}
          destinations={destinations}
          twoFactorEnabled={twoFactorEnabled}
        />
      )}
    </>
  );
}

function BucketPill({
  icon: Icon,
  label,
  value,
  hint,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  tint: "blue" | "amber" | "purple";
}) {
  const tintClass = {
    blue: "text-blue-300 bg-blue-400/10",
    amber: "text-amber-300 bg-amber-400/10",
    purple: "text-purple-300 bg-purple-400/10",
  }[tint];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tintClass}`}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <p className="text-sm font-bold text-white tabular-nums truncate">
          {formatBRL(value)}
        </p>
      </div>
      <span className="hidden text-[9px] text-zinc-600 sm:block">{hint}</span>
    </div>
  );
}

function WithdrawDrawer({
  onClose,
  availableCents,
  pixFeeCents,
  destinations,
  twoFactorEnabled,
}: {
  onClose: () => void;
  availableCents: number;
  pixFeeCents: number;
  destinations: Destination[];
  twoFactorEnabled: boolean;
}) {
  // ESC pra fechar
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-t-3xl border border-white/[0.1] bg-zinc-950 shadow-2xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
                <TrendingUp className="size-4" />
              </div>
              <h2 className="text-base font-bold text-white">Solicitar saque</h2>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 pl-10">
              PIX (aprovação em segundos) ou USDT/Solana
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-2 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6">
          <WithdrawForm
            balanceCents={availableCents}
            pixFeeCents={pixFeeCents}
            destinations={destinations}
            twoFactorEnabled={twoFactorEnabled}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
