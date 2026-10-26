"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Loader2,
  X,
  Check,
  AlertTriangle,
  Send,
  Clock,
  Eye,
  EyeOff,
  Undo2,
  RotateCcw,
  StickyNote,
} from "lucide-react";
import { formatBRL } from "@/lib/utils";
import {
  adminUpdateTransaction,
  adminUndivertTransaction,
  adminScheduleFakeRefund,
  adminCancelFakeRefund,
  adminMarkTransactionPaidAction,
  adminReverseChargebackAction,
  adminSetTransactionNote,
} from "../../../actions";

type Tx = {
  id: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  method: string;
  /** Adquirente onde o PIX/cobrança foi gerado (nominal + shortCode).
   *  Resolvido de providerPayload.acquirer_id. null = sem adquirente registrada. */
  acquirerNominal: string | null;
  acquirerShortCode: string | null;
  /** Observação livre do admin nesta transação. null/"" = sem nota. */
  adminNote: string | null;
  customerEmail: string | null;
  createdAt: string;
  paidAt: string | null;
  divertedToAcquirer: boolean;
  divertedToReferrer: boolean;
  /** Reembolso fake: agendado pra virar REFUNDED auto (admin). */
  fakeRefundScheduledAt: string | null;
  fakeRefundApplied: boolean;
  utmifyScheduledAt: string | null;
  utmifyDispatchedAt: string | null;
  /** Janela de 60s: enquanto null e scheduledAt <= now, seller nao
   *  ve a tx (filtros sellerNotifiedAt IS NOT NULL nas views). */
  sellerNotifyScheduledAt: string | null;
  sellerNotifiedAt: string | null;
};

export function TxRowEditable({ tx }: { tx: Tx }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <EditingRow tx={tx} onClose={() => setEditing(false)} />
  ) : (
    <DisplayRow tx={tx} onEdit={() => setEditing(true)} />
  );
}

/**
 * Countdown leve pra janela de 60s antes do UTMify disparar.
 * Mostra o tempo restante em segundos. Quando chega a 0, vira "enviando…"
 * (cron pega na proxima execucao). Se utmifyDispatchedAt ja setado, mostra
 * "enviado".
 */
function UtmifyTimer({
  scheduledAt,
  dispatchedAt,
  diverted,
}: {
  scheduledAt: string | null;
  dispatchedAt: string | null;
  /** Quando true, cron de UTMify (que filtra divertedToX) NAO vai
   *  disparar — em vez de "enviando…" eterno, mostra "utmify suprimido". */
  diverted: boolean;
}) {
  // Estado: ms restantes ate scheduledAt. Re-tick a cada 1s.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (dispatchedAt || !scheduledAt) return;
    const target = new Date(scheduledAt).getTime();
    if (target <= Date.now()) return; // ja venceu, nao precisa tickar
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [scheduledAt, dispatchedAt]);

  if (dispatchedAt) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300"
        title={`UTMify enviado ${new Date(dispatchedAt).toLocaleString("pt-BR")}`}
      >
        <Send className="size-2.5" /> utmify enviado
      </span>
    );
  }
  if (!scheduledAt) return null;
  // Tx desviada (auto-skim antes de scheduleUtmify ou via botao apos):
  // cron filtra `divertedToAcquirer:false AND divertedToReferrer:false`
  // entao NUNCA vai disparar. Em vez de "enviando…" eterno, marca claro.
  if (diverted) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 border border-zinc-600/40 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300"
        title="Tx desviada — UTMify NAO vai ser disparado (cron filtra divertedToX)"
      >
        <EyeOff className="size-2.5" /> utmify suprimido
      </span>
    );
  }
  const target = new Date(scheduledAt).getTime();
  const remaining = Math.max(0, Math.floor((target - now) / 1000));
  if (remaining <= 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300"
        title="Janela expirada — cron vai disparar a qualquer momento"
      >
        <Loader2 className="size-2.5 animate-spin" /> utmify enviando…
      </span>
    );
  }
  // Cor: verde > 30s, amarelo 10-30s, vermelho < 10s
  const color =
    remaining > 30
      ? "bg-cyan-400/15 text-cyan-300"
      : remaining > 10
        ? "bg-yellow-400/15 text-yellow-300"
        : "bg-red-400/15 text-red-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold font-mono ${color}`}
      title={`UTMify dispara em ${remaining}s — janela pra editar valor`}
    >
      <Clock className="size-2.5" /> utmify {remaining}s
    </span>
  );
}

/**
 * Timer da janela "release-paid-to-seller". Enquanto contando, o seller
 * NAO ve a tx em /dashboard/vendas (filtro sellerNotifiedAt IS NOT NULL).
 * Apos 0s, cron pode disparar a qualquer momento — seta sellerNotifiedAt
 * e webhook/push/email/sale-bot vao pro seller.
 *
 * Estados:
 *   - oculto Ns (fucsia/amber/vermelho) — janela aberta, admin pode editar/desviar.
 *   - liberando… (laranja) — janela expirou, cron vai rodar.
 *   - silenciada (cinza-escuro) — cron rodou + tx eh desviada → suprimiu
 *     todos dispatches, seller continua sem ver. Substitui "seller viu"
 *     pra evitar contradicao com a badge DESVIADA.
 *   - seller viu (cinza) — cron rodou + tx normal → seller ja foi
 *     notificado (webhook/push/email/sale-bot/pixels disparados).
 */
function SellerNotifyTimer({
  scheduledAt,
  notifiedAt,
  diverted,
}: {
  scheduledAt: string | null;
  notifiedAt: string | null;
  /** divertedToAcquirer || divertedToReferrer — quando cron rodar, NAO
   *  vai disparar nada pro seller. Muda a label de "seller viu" pra
   *  "silenciada" pra refletir realidade. */
  diverted: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (notifiedAt || !scheduledAt) return;
    const target = new Date(scheduledAt).getTime();
    if (target <= Date.now()) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [scheduledAt, notifiedAt]);

  if (notifiedAt) {
    if (diverted) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 border border-zinc-600/40 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300"
          title={`Cron processou ${new Date(notifiedAt).toLocaleString("pt-BR")} mas SUPRIMIU todos dispatches — seller continua sem ver (desviada)`}
        >
          <EyeOff className="size-2.5" /> silenciada
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-400"
        title={`Seller foi notificado ${new Date(notifiedAt).toLocaleString("pt-BR")} — webhook/push/email/sale-bot disparados`}
      >
        <Eye className="size-2.5" /> seller viu
      </span>
    );
  }
  if (!scheduledAt) return null;
  const target = new Date(scheduledAt).getTime();
  const remaining = Math.max(0, Math.floor((target - now) / 1000));
  if (remaining <= 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-orange-300"
        title={
          diverted
            ? "Janela expirou — cron vai marcar como silenciada (desviada)"
            : "Janela expirou — cron vai liberar pro seller a qualquer momento"
        }
      >
        <Loader2 className="size-2.5 animate-spin" />{" "}
        {diverted ? "silenciando…" : "liberando…"}
      </span>
    );
  }
  const color =
    remaining > 30
      ? "bg-fuchsia-400/15 text-fuchsia-300"
      : remaining > 10
        ? "bg-amber-400/15 text-amber-300"
        : "bg-red-400/15 text-red-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold font-mono ${color}`}
      title={
        diverted
          ? `Janela ainda aberta (${remaining}s) — sera silenciada quando o cron rodar`
          : `Seller ainda nao ve. Janela pra editar/desviar: ${remaining}s`
      }
    >
      <EyeOff className="size-2.5" /> oculto {remaining}s
    </span>
  );
}

/**
 * Reverter desvio AUTOMATICO existente (skim de webhookDeviationPercent ou
 * split de referralAppliedDeviationPercent). O desvio manual foi REMOVIDO
 * (06/07/2026 — a pedido do david) porque bastava o desvio auto no PAID.
 * Este botao aparece so pra desviadas ja gravadas — permite admin desfazer
 * um desvio que ficou "muito na cara" e o seller comecou a reclamar.
 */
function DivertControls({ tx }: { tx: Tx }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const isDiverted = tx.divertedToAcquirer || tx.divertedToReferrer;
  const canUndivert = tx.status === "PAID" && isDiverted;

  if (!canUndivert) return null;

  function doUndivert() {
    setErr(null);
    if (!reason.trim()) {
      setErr("Informe o motivo");
      return;
    }
    startTransition(async () => {
      const r = await adminUndivertTransaction(tx.id, {
        reason: reason.trim(),
      });
      if (r.ok) {
        setConfirming(false);
        setReason("");
        router.refresh();
      } else {
        setErr(r.error);
      }
    });
  }

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="motivo (auditado)"
          className="w-32 rounded border border-white/[0.08] bg-black/40 px-1.5 py-0.5 text-[10px] text-white"
          autoFocus
        />
        <button
          type="button"
          onClick={doUndivert}
          disabled={pending}
          className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
          title="Confirmar REVERTER desvio (credita seller, debita referrer se aplicavel)"
        >
          {pending ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : (
            <Check className="size-2.5" />
          )}
          ok
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setReason("");
            setErr(null);
          }}
          className="text-zinc-500 hover:text-white"
          title="cancelar"
        >
          <X className="size-3" />
        </button>
        {err && (
          <span className="ml-1 text-[9px] text-red-300" title={err}>
            !
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300"
      title="REVERTER desvio: credita o seller com o net + dispara webhook/push pra ele. Se foi rede, debita o referrer."
    >
      <Undo2 className="size-2.5" /> reverter
    </button>
  );
}

/**
 * REEMBOLSO FAKE por transacao. Agenda esta venda PAID pra virar REFUNDED
 * automaticamente daqui a N dias (cron fake-refunds aplica). NAO chama o PSP —
 * so reverte saldo do seller + dispara webhook transaction.refunded.
 * Estados:
 *   - aplicado (vermelho) — tx ja virou REFUNDED fake.
 *   - agendado (ambar) — fakeRefundScheduledAt setado: mostra data + cancelar.
 *   - botao "reemb. fake" — abre input de dias + motivo.
 */
function FakeRefundControl({ tx }: { tx: Tx }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // 23/07/2026 (davi: "eu fiz o med fake para aparecer agora ja!"). Default
  // 0 dias = aplica NA HORA. Admin pode subir pra agendar futuro (7d etc).
  const [days, setDays] = useState("0");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (tx.fakeRefundApplied) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[9px] font-bold text-red-300"
        title="Reembolso fake aplicado — tx virou REFUNDED (sem chamar o PSP)"
      >
        <RotateCcw className="size-2.5" /> reemb. fake
      </span>
    );
  }

  if (tx.fakeRefundScheduledAt) {
    const when = new Date(tx.fakeRefundScheduledAt);
    const cancel = () => {
      startTransition(async () => {
        const r = await adminCancelFakeRefund(tx.id);
        if (r.ok) router.refresh();
        else setErr(r.error);
      });
    };
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300"
          title={`Reembolso fake agendado pra ${when.toLocaleString("pt-BR")}`}
        >
          <Clock className="size-2.5" /> reemb. {when.toLocaleDateString("pt-BR")}
        </span>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="text-zinc-500 hover:text-white disabled:opacity-50"
          title="Cancelar reembolso fake agendado"
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <X className="size-3" />
          )}
        </button>
        {err && (
          <span className="text-[9px] text-red-300" title={err}>
            !
          </span>
        )}
      </span>
    );
  }

  // So PAID nao-desviada pode agendar reembolso fake.
  if (tx.status !== "PAID" || tx.divertedToAcquirer || tx.divertedToReferrer) {
    return null;
  }

  const schedule = () => {
    setErr(null);
    if (!reason.trim()) {
      setErr("Informe o motivo");
      return;
    }
    const d = Number(days);
    if (!Number.isFinite(d) || d < 0) {
      setErr("Dias inválido");
      return;
    }
    startTransition(async () => {
      const r = await adminScheduleFakeRefund(tx.id, {
        days: Math.floor(d),
        reason: reason.trim(),
      });
      if (r.ok) {
        setOpen(false);
        setReason("");
        router.refresh();
      } else {
        setErr(r.error);
      }
    });
  };

  if (open) {
    return (
      <div className="inline-flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-12 rounded border border-white/[0.08] bg-black/40 px-1 py-0.5 text-[10px] text-white tabular-nums"
          title="Dias até cair"
        />
        <span className="text-[9px] text-zinc-500">d</span>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="motivo"
          className="w-24 rounded border border-white/[0.08] bg-black/40 px-1.5 py-0.5 text-[10px] text-white"
          autoFocus
        />
        <button
          type="button"
          onClick={schedule}
          disabled={pending}
          className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
          title="Agendar reembolso fake"
        >
          {pending ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : (
            <Check className="size-2.5" />
          )}
          ok
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setErr(null);
          }}
          className="text-zinc-500 hover:text-white"
          title="cancelar"
        >
          <X className="size-3" />
        </button>
        {err && (
          <span className="ml-0.5 text-[9px] text-red-300" title={err}>
            !
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 hover:bg-orange-500/25 border border-orange-500/30 px-1.5 py-0.5 text-[9px] font-bold text-orange-300"
      title="Reembolso FAKE: agenda a tx pra virar REFUNDED auto daqui a N dias (sem chamar o PSP)"
    >
      <RotateCcw className="size-2.5" /> reemb. fake
    </button>
  );
}

/** "há 2h", "há 3 dias", "agora mesmo" — quanto tempo desde `d`. */
function relativeFromNow(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "agora mesmo";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

/**
 * Mostra "quanto tempo atrás" (relativo, atualiza a cada minuto) + a data e
 * hora exatas no fuso de Brasília. `paid` decide o rótulo (pago/criado). O
 * relativo é client-only (useEffect) pra não dar mismatch de hidratação.
 */
function RelativeTime({ iso, paid }: { iso: string; paid: boolean }) {
  const exact = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  const [rel, setRel] = useState("");
  useEffect(() => {
    const f = () => setRel(relativeFromNow(new Date(iso)));
    f();
    const t = setInterval(f, 60_000);
    return () => clearInterval(t);
  }, [iso]);
  return (
    <span
      className="shrink-0 text-right leading-tight"
      title={`${paid ? "Pago" : "Criado"} em ${exact} (horário de Brasília)`}
    >
      {rel && (
        <span className="block text-[10px] font-medium text-zinc-300">
          {paid ? "pago " : "criado "}
          {rel}
        </span>
      )}
      <span className="block text-[10px] text-zinc-500 tabular-nums">
        {exact}
      </span>
    </span>
  );
}

function DisplayRow({ tx, onEdit }: { tx: Tx; onEdit: () => void }) {
  const statusClass =
    tx.status === "PAID"
      ? "text-cyan-300"
      : tx.status === "REFUNDED" || tx.status === "CHARGEBACK"
        ? "text-red-400"
        : "text-yellow-300";
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-sm group hover:bg-white/[0.02] md:grid md:grid-cols-12 md:px-5 md:py-2.5 md:items-center">
      {/* Linha 1 mobile: ID + tags. Desktop: col-span-3 */}
      <span className="md:col-span-3 font-mono text-[11px] text-zinc-400 truncate flex items-center gap-1.5 flex-wrap">
        <span className="truncate">{tx.id}</span>
        {tx.divertedToAcquirer && (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-300"
            title="Tx desviada silenciosamente — seller nao ve, nao credita, nao dispara webhook/pixel"
          >
            <AlertTriangle className="size-2.5" /> desviada
          </span>
        )}
        {tx.divertedToReferrer && !tx.divertedToAcquirer && (
          <span
            className="shrink-0 inline-flex items-center rounded-full bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300"
            title="Tx desviada pro referrer — seller ve, mas crédito vai pro referrer"
          >
            ↗ rede
          </span>
        )}
        {/* ADQUIRENTE — sempre visível: onde o PIX/cobrança foi gerado */}
        {tx.acquirerNominal ? (
          <span
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/25 px-1.5 py-0.5 text-[9px] font-medium text-sky-300 max-w-full"
            title={`Adquirente: ${tx.acquirerShortCode ? tx.acquirerShortCode + " · " : ""}${tx.acquirerNominal}`}
          >
            {tx.acquirerShortCode && (
              <span className="font-bold uppercase tracking-wider">
                {tx.acquirerShortCode}
              </span>
            )}
            <span className="truncate max-w-[150px] normal-case">
              {tx.acquirerNominal}
            </span>
          </span>
        ) : (
          <span
            className="shrink-0 text-[9px] text-zinc-600"
            title="Sem adquirente registrada nesta transação"
          >
            s/ adq
          </span>
        )}
      </span>
      {/* MOBILE: email + amount lado a lado. DESKTOP: spans separados */}
      <div className="flex items-start justify-between gap-3 md:contents">
        <span className="md:col-span-2 text-xs text-zinc-300 truncate min-w-0 flex-1">
          {tx.customerEmail}
        </span>
        <span className="md:col-span-1 text-xs text-zinc-500 hidden md:inline">
          {tx.method}
        </span>
        <span className={`md:col-span-1 text-xs ${statusClass} hidden md:inline`}>
          {tx.status}
        </span>
        <span className="md:col-span-2 text-right text-zinc-200 font-mono tabular-nums shrink-0">
          {formatBRL(tx.amountCents)}
          <span className="block text-[9px] text-zinc-500">
            fee {formatBRL(tx.feeCents)} · net {formatBRL(tx.netCents)}
          </span>
        </span>
      </div>
      {/* MOBILE: method+status como chips. DESKTOP: ja exibidos acima */}
      <div className="flex items-center gap-2 text-[10px] md:hidden">
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-zinc-400">
          {tx.method}
        </span>
        <span className={`rounded-full bg-white/[0.04] px-2 py-0.5 ${statusClass}`}>
          {tx.status}
        </span>
      </div>
      {/* Timers + data */}
      <span className="md:col-span-2 flex items-center justify-start md:justify-end gap-1.5 flex-wrap">
        <SellerNotifyTimer
          scheduledAt={tx.sellerNotifyScheduledAt}
          notifiedAt={tx.sellerNotifiedAt}
          diverted={tx.divertedToAcquirer || tx.divertedToReferrer}
        />
        <UtmifyTimer
          scheduledAt={tx.utmifyScheduledAt}
          dispatchedAt={tx.utmifyDispatchedAt}
          diverted={tx.divertedToAcquirer || tx.divertedToReferrer}
        />
        <RelativeTime iso={tx.paidAt ?? tx.createdAt} paid={!!tx.paidAt} />
      </span>
      {/* Actions: marcar paga + divert + edit. No mobile sempre visivel. */}
      <span className="md:col-span-1 flex items-center justify-start md:justify-end gap-1.5 flex-wrap">
        <MarkPaidControl tx={tx} />
        <ReverseChargebackButton tx={tx} />
        <DivertControls tx={tx} />
        <FakeRefundControl tx={tx} />
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[10px] text-zinc-500 md:opacity-0 md:group-hover:opacity-100 hover:text-cyan-300 transition"
          title="Editar valor"
        >
          <Pencil className="size-3" /> editar
        </button>
      </span>
      <TxNoteControl tx={tx} />
    </div>
  );
}

/**
 * Observação livre do admin nesta transação. Mostra a nota (quando existe) e
 * permite adicionar/editar inline. Vazio + salvar = limpa a nota.
 */
function TxNoteControl({ tx }: { tx: Tx }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(tx.adminNote ?? "");
  const [pending, startTransition] = useTransition();
  // Re-sincroniza quando a prop muda (após router.refresh()).
  useEffect(() => {
    setVal(tx.adminNote ?? "");
  }, [tx.adminNote]);

  function save() {
    startTransition(async () => {
      const r = await adminSetTransactionNote(tx.id, val);
      if (r.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }
  function cancel() {
    setVal(tx.adminNote ?? "");
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="md:col-span-12 flex items-center gap-2 flex-wrap">
        {tx.adminNote ? (
          <>
            <span className="inline-flex items-start gap-1 rounded bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 text-[10px] text-amber-200 max-w-full">
              <StickyNote className="size-3 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap break-words">
                {tx.adminNote}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[9px] text-zinc-500 hover:text-amber-300 shrink-0"
            >
              editar nota
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-[9px] text-zinc-600 hover:text-amber-300"
            title="Adicionar observação interna nesta venda"
          >
            <StickyNote className="size-3" /> + nota
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="md:col-span-12 flex items-center gap-2">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        maxLength={1000}
        placeholder="Observação interna sobre esta venda…"
        className="flex-1 min-w-0 rounded border border-amber-400/30 bg-black/40 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold text-black hover:bg-amber-300 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3 animate-spin inline" /> : "salvar"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="text-[10px] text-zinc-400 hover:text-white"
      >
        cancelar
      </button>
    </div>
  );
}

/**
 * Botão "marcar paga" — só pra vendas NÃO pagas e não-terminais (PENDING ou
 * EXPIRED). CLIQUE DUPLO: o 1º clique "arma" (vira "confirmar?"), o 2º executa
 * (desarma sozinho em ~3,5s). Roda o fluxo real de pagamento via action:
 * credita o seller + dispara webhooks/pixels/notificação. Atômico/idempotente.
 */
function MarkPaidControl({ tx }: { tx: Tx }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  if (tx.status !== "PENDING" && tx.status !== "EXPIRED") return null;
  function onClick() {
    if (!armed) {
      // 1º clique: arma e espera a confirmação.
      setArmed(true);
      setErr(null);
      return;
    }
    // 2º clique: executa.
    setArmed(false);
    startTransition(async () => {
      const r = await adminMarkTransactionPaidAction(tx.id);
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
            : "bg-cyan-400/15 border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/25"
        }`}
        title={
          armed
            ? "Clique de novo pra CONFIRMAR — credita o seller + dispara webhooks/pixels"
            : "Marcar como paga (clique 2x pra confirmar)"
        }
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Check className="size-3" />
        )}
        {armed ? "confirmar?" : "marcar paga"}
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
 * Reverter chargeback (08/07/2026, david). Quando o CB volta pro saldo da
 * plataforma, admin pode devolver ao seller. Confirma via inline reason
 * input (auditado no logAdminAction), depois submete.
 */
function ReverseChargebackButton({ tx }: { tx: { id: string; status: string } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (tx.status !== "CHARGEBACK") return null;

  function doReverse() {
    setErr(null);
    if (!reason.trim()) {
      setErr("Informe o motivo");
      return;
    }
    startTransition(async () => {
      const r = await adminReverseChargebackAction(tx.id, {
        reason: reason.trim(),
      });
      if (r.ok) {
        setConfirming(false);
        setReason("");
        router.refresh();
      } else {
        setErr(r.error);
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="motivo (auditado)"
          className="w-32 rounded border border-white/[0.08] bg-black/40 px-1.5 py-0.5 text-[10px] text-white"
          autoFocus
        />
        <button
          type="button"
          onClick={doReverse}
          disabled={pending}
          className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
          title="Confirmar REVERTER CB — credita seller + devolve multa"
        >
          {pending ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : (
            <Check className="size-2.5" />
          )}
          ok
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setReason("");
            setErr(null);
          }}
          className="text-zinc-500 hover:text-white"
          title="cancelar"
        >
          <X className="size-3" />
        </button>
        {err && (
          <span className="ml-1 text-[9px] text-red-300" title={err}>
            !
          </span>
        )}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300"
      title="REVERTER chargeback: credita seller de volta + devolve multa. Muda status CHARGEBACK → PAID."
    >
      <Undo2 className="size-2.5" /> reverter CB
    </button>
  );
}

function EditingRow({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(
    (tx.amountCents / 100).toFixed(2).replace(".", ","),
  );
  const [fee, setFee] = useState(
    (tx.feeCents / 100).toFixed(2).replace(".", ","),
  );
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function parse(s: string): number {
    const n = Number(s.replace(/[^\d,.-]/g, "").replace(",", "."));
    return Math.round(n * 100);
  }
  const amountCents = parse(amount);
  const feeCents = parse(fee);
  const netCents = Math.max(0, amountCents - feeCents);

  // Saldo do seller so foi creditado se:
  //  - status=PAID
  //  - nao foi desviada (acquirer/referrer)
  //  - sellerNotifiedAt esta setado (janela 60s fechou + cron release rodou)
  // Dentro da janela (sellerNotifiedAt=null), saldo ainda nao foi tocado.
  // O server (adminUpdateTransaction) confere releasedToBalance — este eh
  // so um hint visual.
  const isCreditedTx =
    tx.status === "PAID" &&
    !tx.divertedToAcquirer &&
    !tx.divertedToReferrer &&
    tx.sellerNotifiedAt !== null;
  const netDelta = netCents - tx.netCents;

  function save() {
    setErr(null);
    if (!reason.trim()) {
      setErr("Informe o motivo");
      return;
    }
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setErr("Valor inválido");
      return;
    }
    if (feeCents > amountCents) {
      setErr("Fee não pode ser maior que o valor");
      return;
    }
    startTransition(async () => {
      const r = await adminUpdateTransaction(tx.id, {
        amountCents,
        feeCents,
        reason: reason.trim(),
      });
      if (r.ok) {
        onClose();
        router.refresh();
      } else {
        setErr(r.error);
      }
    });
  }

  return (
    <div className="border-y border-cyan-400/20 bg-cyan-400/[0.03] px-5 py-3">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-3">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">
            Tx ID
          </p>
          <p className="text-[10px] text-zinc-400 font-mono truncate" title={tx.id}>
            {tx.id.slice(0, 16)}…
          </p>
          {/* Mostra os timers aqui tambem no modo edicao */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <SellerNotifyTimer
              scheduledAt={tx.sellerNotifyScheduledAt}
              notifiedAt={tx.sellerNotifiedAt}
              diverted={tx.divertedToAcquirer || tx.divertedToReferrer}
            />
            <UtmifyTimer
              scheduledAt={tx.utmifyScheduledAt}
              dispatchedAt={tx.utmifyDispatchedAt}
              diverted={tx.divertedToAcquirer || tx.divertedToReferrer}
            />
          </div>
        </div>
        <div className="col-span-3">
          <label className="text-[9px] uppercase tracking-wider text-zinc-500 block mb-1">
            Amount (R$)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white font-mono"
          />
        </div>
        <div className="col-span-3">
          <label className="text-[9px] uppercase tracking-wider text-zinc-500 block mb-1">
            Fee (R$)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="w-full rounded border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white font-mono"
          />
        </div>
        <div className="col-span-3">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1">
            Net (auto)
          </p>
          <p className="text-sm font-mono text-cyan-300">{formatBRL(netCents)}</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2 mt-2 items-end">
        <div className="col-span-8">
          <label className="text-[9px] uppercase tracking-wider text-zinc-500 block mb-1">
            Motivo (auditado)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: ajuste manual após estorno parcial"
            className="w-full rounded border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white"
          />
        </div>
        <div className="col-span-4 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full bg-cyan-400 px-4 py-1.5 text-[11px] font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            Salvar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.05]"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {isCreditedTx && netDelta !== 0 && (
        <p
          className={`mt-2 text-[10px] ${
            netDelta > 0 ? "text-emerald-300" : "text-amber-300"
          }`}
        >
          ⚠️ Tx PAID — saldo do seller será {netDelta > 0 ? "creditado" : "debitado"}{" "}
          em <strong>{formatBRL(Math.abs(netDelta))}</strong>{" "}
          (delta no net).
        </p>
      )}
      {err && (
        <p className="mt-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
          {err}
        </p>
      )}
    </div>
  );
}
