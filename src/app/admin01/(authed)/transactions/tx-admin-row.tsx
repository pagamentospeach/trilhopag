"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Check,
  RotateCcw,
  Trash2,
  Ban,
  ExternalLink,
} from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { toOpsMode, type OpsMode } from "@/lib/ops-modes";
import {
  adminScheduleFakeRefund,
  adminDeleteTransaction,
  adminBlockUser,
} from "../../actions";

/** Linha serializável vinda do server component (datas já em ISO). */
type TxRow = {
  id: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  method: string;
  customerEmail: string;
  createdAt: string;
  paidAt: string | null;
  /** ID no PSP (Caju/SharkHub/SafePix/...) — usado pra bater no painel dele. */
  providerId: string | null;
  /** Adquirente nominal resolvida de providerPayload.acquirer_id. null = sem. */
  acquirerNominal: string | null;
  acquirerShortCode: string | null;
  userId: string;
  userName: string | null;
  userEmail: string;
  /** Modo de operação PIX do seller: black/white/hot. */
  userPixOpsMode: string;
  /** Saldo disponível ATUAL do seller (não é o saldo histórico da venda). */
  userBalanceCents: number;
};

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-cyan-400/15 text-cyan-300",
  PENDING: "bg-yellow-400/15 text-yellow-300",
  REFUNDED: "bg-purple-400/15 text-purple-300",
  CHARGEBACK: "bg-red-500/15 text-red-300",
  EXPIRED: "bg-zinc-700/40 text-zinc-400",
  FAILED: "bg-red-500/15 text-red-300",
};

const PIX_MODE_STYLES: Record<OpsMode, string> = {
  black: "bg-zinc-800/80 border-zinc-600/50 text-zinc-300",
  white: "bg-white/10 border-white/30 text-white",
  hot: "bg-orange-500/15 border-orange-500/40 text-orange-300",
  sag: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300",
};

/** Data + hora no fuso de Brasília (mesmo padrão da aba de tx do seller). */
function formatBRT(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function TxAdminRow({ tx }: { tx: TxRow }) {
  const statusClass =
    STATUS_STYLES[tx.status] ?? "bg-zinc-700/40 text-zinc-400";
  const pixClass = PIX_MODE_STYLES[toOpsMode(tx.userPixOpsMode)];
  const when = tx.paidAt ?? tx.createdAt;

  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.04] px-4 py-3 text-sm hover:bg-white/[0.02] md:grid md:grid-cols-12 md:gap-3 md:px-5 md:items-center">
      {/* Data (pago, senão criado) + tx.id + providerId */}
      <div className="md:col-span-2 text-[11px] text-zinc-400 tabular-nums leading-tight">
        <span className="block text-zinc-300">{formatBRT(when)}</span>
        <span className="block text-[9px] text-zinc-600">
          {tx.paidAt ? "pago" : "criado"}
        </span>
        <span
          className="mt-1 block font-mono text-[9px] text-zinc-500 truncate"
          title={`ID Trilho: ${tx.id}`}
        >
          bp: {tx.id.slice(0, 12)}…
        </span>
        {tx.providerId && (
          <span
            className="block font-mono text-[9px] text-zinc-500 truncate"
            title={`ID no provedor (PSP): ${tx.providerId}`}
          >
            psp: {tx.providerId.slice(0, 12)}…
          </span>
        )}
      </div>

      {/* Seller (link p/ perfil) + cliente + modo + saldo */}
      <div className="md:col-span-3 min-w-0">
        <Link
          href={`/admin01/users/${tx.userId}`}
          className="inline-flex items-center gap-1 font-medium text-white hover:text-cyan-300 truncate max-w-full"
          title="Abrir perfil do seller"
        >
          <span className="truncate">{tx.userName ?? tx.userEmail}</span>
          <ExternalLink className="size-3 shrink-0 text-zinc-500" />
        </Link>
        <p className="text-[10px] text-zinc-500 truncate">{tx.customerEmail}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${pixClass}`}
            title="Modo de operação PIX do seller"
          >
            {tx.userPixOpsMode}
          </span>
          <span
            className="text-[9px] text-zinc-500"
            title="Saldo DISPONÍVEL atual do seller (não é o saldo no momento desta venda)"
          >
            saldo atual{" "}
            <span className="font-mono text-zinc-300">
              {formatBRL(tx.userBalanceCents)}
            </span>
          </span>
        </div>
      </div>

      {/* Método / status / adquirente */}
      <div className="md:col-span-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">
          {tx.method}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}
        >
          {tx.status}
        </span>
        {tx.acquirerNominal ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/25 px-1.5 py-0.5 text-[9px] font-medium text-sky-300 max-w-full"
            title={`Adquirente: ${tx.acquirerShortCode ? tx.acquirerShortCode + " · " : ""}${tx.acquirerNominal}`}
          >
            {tx.acquirerShortCode && (
              <span className="font-bold uppercase tracking-wider">
                {tx.acquirerShortCode}
              </span>
            )}
            <span className="truncate max-w-[130px] normal-case">
              {tx.acquirerNominal}
            </span>
          </span>
        ) : (
          <span
            className="text-[9px] text-zinc-600"
            title="Sem adquirente registrada nesta transação"
          >
            s/ adq
          </span>
        )}
      </div>

      {/* Valor + lucro gateway (fee = nosso lucro na venda) */}
      <div className="md:col-span-2 font-mono tabular-nums">
        <span className="block text-zinc-200">{formatBRL(tx.amountCents)}</span>
        <span
          className="mt-0.5 inline-flex items-center rounded bg-cyan-400/10 border border-cyan-400/25 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300"
          title="Lucro do gateway nesta venda (fee retido)"
        >
          lucro {formatBRL(tx.feeCents)}
        </span>
      </div>

      {/* Ações por linha */}
      <div className="md:col-span-3 flex flex-wrap items-center justify-start gap-1.5 md:justify-end">
        <FakeRefundAction tx={tx} />
        <DeleteAction tx={tx} />
        <BlockSellerAction tx={tx} />
      </div>
    </div>
  );
}

/**
 * MED fake: agenda esta venda PAID pra virar REFUNDED imediatamente (delay 0d).
 * Reusa adminScheduleFakeRefund (NÃO chama o PSP). Confirma antes de disparar.
 */
function FakeRefundAction({ tx }: { tx: TxRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Só PAID pode ser reembolsada (o server valida de novo).
  if (tx.status !== "PAID") return null;

  function fire() {
    const ok = window.confirm(
      `MED fake: reembolsar ${formatBRL(tx.amountCents)} do cliente ${tx.customerEmail}? A venda vira REFUNDED e o saldo do seller é revertido (sem chamar o PSP).`,
    );
    if (!ok) return;
    setErr(null);
    startTransition(async () => {
      const r = await adminScheduleFakeRefund(tx.id, {
        days: 0,
        reason: "MED fake pela aba de transações",
      });
      if (r.ok) router.refresh();
      else setErr(r.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 hover:bg-orange-500/25 border border-orange-500/30 px-2 py-0.5 text-[10px] font-bold text-orange-300 disabled:opacity-50"
        title="MED fake: agenda a tx pra virar REFUNDED já (sem chamar o PSP)"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <RotateCcw className="size-3" />
        )}
        MED fake
      </button>
      {err && (
        <span className="text-[9px] text-red-300" title={err}>
          erro
        </span>
      )}
    </span>
  );
}

/**
 * Excluir transação. Exige confirm() + motivo (prompt). Reusa
 * adminDeleteTransaction(id, reason). Reverte saldo se a venda foi creditada.
 */
function DeleteAction({ tx }: { tx: TxRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function fire() {
    const ok = window.confirm(
      `Excluir a transação ${tx.id}? Se a venda foi creditada, o saldo do seller é debitado. Esta ação é auditada.`,
    );
    if (!ok) return;
    const reason = window.prompt("Motivo da exclusão (auditado):", "");
    if (reason === null) return; // cancelou o prompt
    if (!reason.trim()) {
      setErr("motivo obrigatório");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const r = await adminDeleteTransaction(tx.id, reason.trim());
      if (r.ok) router.refresh();
      else setErr(r.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-red-500/10 hover:bg-red-500/25 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-300 disabled:opacity-50"
        title="Excluir transação (pede confirmação + motivo)"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Trash2 className="size-3" />
        )}
        excluir
      </button>
      {err && (
        <span className="text-[9px] text-red-300" title={err}>
          {err}
        </span>
      )}
    </span>
  );
}

/**
 * Bloquear o seller. Clique duplo: 1º arma ("confirmar?"), desarma sozinho em
 * ~3s, 2º executa. Reusa adminBlockUser({userId, reason}). Ban hard.
 */
function BlockSellerAction({ tx }: { tx: TxRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  function onClick() {
    if (!armed) {
      setArmed(true);
      setErr(null);
      return;
    }
    setArmed(false);
    startTransition(async () => {
      const r = await adminBlockUser({
        userId: tx.userId,
        reason: "Bloqueado pela aba de transações",
      });
      if (r.ok) router.refresh();
      else setErr(r.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border transition disabled:opacity-50 ${
          armed
            ? "bg-amber-400/20 border-amber-400/50 text-amber-200 hover:bg-amber-400/30"
            : "bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/25"
        }`}
        title={
          armed
            ? "Clique de novo pra CONFIRMAR o bloqueio do seller (ban hard)"
            : "Bloquear o seller (clique 2x pra confirmar)"
        }
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Ban className="size-3" />
        )}
        {armed ? "confirmar?" : "bloquear seller"}
      </button>
      {err && (
        <span className="text-[9px] text-red-300" title={err}>
          erro
        </span>
      )}
    </span>
  );
}
