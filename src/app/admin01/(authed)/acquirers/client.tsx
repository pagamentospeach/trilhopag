"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acquirerNominalLabel } from "@/lib/utils";
import { ACQUIRER_MODES, type AcquirerMode as AcqMode } from "@/lib/ops-modes";
import {
  Plus,
  Trash2,
  Loader2,
  X,
  Server,
  Star,
  Power,
  PowerOff,
  QrCode,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  adminCreateAcquirer,
  adminUpdateAcquirer,
  adminDeleteAcquirer,
  adminMakeAcquirerPrimary,
  adminToggleAcquirerGlobal,
  adminGeneratePix,
  adminRefreshOneNominalAction,
} from "../../actions";

// Importado de @/lib/ops-modes — inclui "sag" (categoria exclusiva do modo
// sub adquirente gateway) além de black/white/both/hot/white_hot.
type AcquirerMode = AcqMode;

type Acquirer = {
  id: string;
  code: string;
  nominalName: string;
  institution: string | null;
  shortCode: string;
  mode: AcquirerMode;
  supportsPix: boolean;
  supportsCard: boolean;
  supportsApplePay: boolean;
  supportsGooglePay: boolean;
  extraFeePercent: number;
  priority: number;
  pixCostPercent: number;
  pixCostFixedCents: number;
  cardCostPercent: number;
  cardCostFixedCents: number;
  /** Surcharge no fee do seller quando essa adquirente eh escolhida. */
  extraSellerFeePercent: number;
  extraSellerFeeFixedCents: number;
  /** Soma ao % de desvio do seller quando essa adquirente eh usada. */
  extraDiversionPercent: number;
  /** Reembolso fake por adquirente (% + dias). */
  fakeRefundPercent: number;
  fakeRefundDelayDays: number;
  publicKey: string | null;
  hasSecret: boolean;
  companyId: string | null;
  /** E-mail da conta da adquirente (login no PSP). null = não cadastrado. */
  accountEmail: string | null;
  active: boolean;
  globalEnabled: boolean;
  /**
   * Nota livre do admin. String vazia/null = sem tag. Quando preenchida,
   * aparece como badge ao lado do nominal pros sellers.
   */
  adminNote: string | null;
  /**
   * Se true, dispatcher NUNCA atualiza nominalName automaticamente.
   * Admin pode travar pra manter um nome comercial fixo.
   */
  lockNominalName: boolean;
  /** Quando true, fica invisível pro seller (mas continua processando). */
  hiddenFromSellers: boolean;
  /**
   * Adquirente PRIVADA: quando true, só aparece pros sellers cujo email está
   * em privateAllowedEmails. Se true e lista vazia → ninguém vê. Sobrepõe o
   * comportamento padrão (que respeita hiddenFromSellers).
   */
  isPrivate: boolean;
  privateAllowedEmails: string[];
  /**
   * DENYLIST por email (07/07/2026): esses emails NÃO veem essa adquirente
   * — mesmo que ela seja pública/global. Vale por cima de qualquer outra
   * regra. Uso: esconder pra 1-2 sellers em específico sem virar privada.
   */
  hiddenFromEmails: string[];
};

type ModeTab = "all" | AcquirerMode;

export function AcquirersClient({ acquirers }: { acquirers: Acquirer[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<ModeTab>("all");

  // Conta por modo (cada adquirente cai em 1 modo exato).
  const counts: Record<ModeTab, number> = {
    all: acquirers.length,
    ...(Object.fromEntries(
      ACQUIRER_MODES.map((m) => [
        m,
        acquirers.filter((a) => a.mode === m).length,
      ]),
    ) as Record<AcquirerMode, number>),
  };
  const shown =
    tab === "all" ? acquirers : acquirers.filter((a) => a.mode === tab);
  // Separa em duas boxes: visíveis pros sellers vs. ocultas (hiddenFromSellers).
  const visible = shown.filter((a) => !a.hiddenFromSellers);
  const hidden = shown.filter((a) => a.hiddenFromSellers);

  const TABS: { key: ModeTab; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "black", label: "🖤 Black" },
    { key: "white", label: "🤍 White" },
    { key: "both", label: "Both" },
    { key: "white_hot", label: "White + 🔥" },
    { key: "hot", label: "🔥 Hot" },
    { key: "sag", label: "SAG" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Tabs por modo (incl. HOT) */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                tab === t.key
                  ? t.key === "hot"
                    ? "bg-orange-500 text-white"
                    : "bg-cyan-400 text-black"
                  : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]"
              }`}
            >
              {t.label}
              <span className="ml-1 opacity-70">({counts[t.key]})</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400"
        >
          <Plus className="size-3.5" /> Nova adquirente
        </button>
      </div>

      {tab === "hot" && (
        <div className="rounded-xl border border-orange-500/25 bg-orange-500/[0.05] px-4 py-2.5 text-[11px] text-orange-200">
          🔥 <b>Categoria HOT.</b> Só sellers em modo <code>hot</code> usam estas
          contas. Venda HOT tem <b>taxa ÚNICA</b> que substitui TODAS as outras
          (sem %, sem fixo) — valor editável em <b>Taxas padrão</b>. Pra mover
          uma conta pra cá: edite a adquirente → Modo → <b>HOT</b>.
        </div>
      )}

      {/* SEPARACAO POR MODO (05/07 — pedido do david, somente visual):
          quando a aba selecionada eh "Todas", quebra as adquirentes visiveis
          em 4 blocos (um por modo) pra facilitar a visualizacao. Nas abas
          especificas continua uma box unica com o modo filtrado. */}
      {tab === "all" ? (
        <>
          {(
            [
              {
                mode: "black" as const,
                title: "🖤 Black",
                emptyText: "Nenhuma adquirente Black visível.",
              },
              {
                mode: "white" as const,
                title: "🤍 White",
                emptyText: "Nenhuma adquirente White visível.",
              },
              {
                mode: "both" as const,
                title: "Both",
                emptyText: "Nenhuma adquirente Both visível.",
              },
              {
                mode: "white_hot" as const,
                title: "White + 🔥 Hot",
                emptyText: "Nenhuma adquirente White+Hot visível.",
              },
              {
                mode: "hot" as const,
                title: "🔥 Hot",
                emptyText: "Nenhuma adquirente HOT visível.",
              },
              {
                mode: "sag" as const,
                title: "SAG",
                emptyText: "Nenhuma adquirente SAG visível.",
              },
            ] as const
          ).map(({ mode, title, emptyText }) => {
            const rows = visible.filter((a) => a.mode === mode);
            if (rows.length === 0) return null;
            return (
              <AcquirerListBox
                key={mode}
                title={`${title} · ${rows.length}`}
                hint="Ordem global por priority (menor = primária). Clica na estrela pra promover dentro deste modo."
                rows={rows}
                emptyText={emptyText}
                onSaved={() => router.refresh()}
              />
            );
          })}
          {visible.length === 0 && (
            <AcquirerListBox
              title="Ordem global"
              hint=""
              rows={[]}
              emptyText={
                acquirers.length === 0
                  ? "Nenhuma adquirente cadastrada."
                  : "Nenhuma adquirente visível."
              }
              onSaved={() => router.refresh()}
            />
          )}
        </>
      ) : (
        <AcquirerListBox
          title="Ordem global"
          hint="Lista ordenada por priority (menor = primária). Clica na estrela pra promover. (Só adquirentes VISÍVEIS pros sellers.)"
          rows={visible}
          emptyText={
            tab === "hot"
              ? "Nenhuma adquirente HOT ainda — edite uma conta e mude o Modo pra HOT."
              : acquirers.length === 0
                ? "Nenhuma adquirente cadastrada."
                : "Nenhuma adquirente visível neste modo."
          }
          onSaved={() => router.refresh()}
        />
      )}

      {hidden.length > 0 && (
        <AcquirerListBox
          title={`🙈 Ocultas dos sellers (${hidden.length})`}
          hint="NÃO aparecem em nenhuma tela do seller (lista, seletor por produto, cobranças), mas CONTINUAM processando normal. Edite a adquirente pra mostrar de novo."
          rows={hidden}
          emptyText="Nenhuma adquirente oculta."
          onSaved={() => router.refresh()}
          tone="hidden"
        />
      )}

      {creating && (
        <NewAcquirerModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Box com a tabela de adquirentes (cabeçalho + linhas). Reutilizado pras
 *  duas listas: visíveis pros sellers e ocultas (hiddenFromSellers). */
function AcquirerListBox({
  title,
  hint,
  rows,
  emptyText,
  onSaved,
  tone = "default",
}: {
  title: string;
  hint: string;
  rows: Acquirer[];
  emptyText: string;
  onSaved: () => void;
  tone?: "default" | "hidden";
}) {
  const border =
    tone === "hidden" ? "border-orange-500/25" : "border-white/[0.08]";
  return (
    <div className={`rounded-2xl border ${border} bg-white/[0.02] overflow-hidden`}>
      <div className="px-5 py-2.5 border-b border-white/[0.06] bg-black/30 text-[10px] text-zinc-500">
        <span
          className={`uppercase tracking-wider ${tone === "hidden" ? "text-orange-300" : ""}`}
        >
          {title}
        </span>
        <span className="ml-2 text-zinc-600">{hint}</span>
      </div>
      <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500">
        <span className="col-span-1">Prio</span>
        <span className="col-span-1">Code</span>
        <span className="col-span-3">Nome nominal</span>
        <span className="col-span-2">Suporta</span>
        <span className="col-span-2 text-right">Custo PIX</span>
        <span className="col-span-1">Status</span>
        <span className="col-span-2 text-right">Ações</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-zinc-500">
          {emptyText}
        </p>
      ) : (
        rows.map((a) => <Row key={a.id} a={a} onSaved={onSaved} />)
      )}
    </div>
  );
}

function Row({ a, onSaved }: { a: Acquirer; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [state, setState] = useState(a);
  // secretKey: undefined = não tocar; "" = limpar; string = atualizar
  const [newSecretKey, setNewSecretKey] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  // RAW string dos textareas de emails — normalizar so no blur/save mantem o
  // \n durante a digitacao. Antes o onChange filtrava "" e removia o cursor de
  // paragrafo — usuario nao conseguia dar Enter (bug reportado 07/07/2026).
  const [privateEmailsRaw, setPrivateEmailsRaw] = useState(
    a.privateAllowedEmails.join("\n"),
  );
  const [hiddenEmailsRaw, setHiddenEmailsRaw] = useState(
    a.hiddenFromEmails.join("\n"),
  );

  function parseEmails(raw: string): string[] {
    const list = raw
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    const seen = new Set<string>();
    return list.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
  }

  function save() {
    // Normaliza raw dos textareas de emails ANTES de enviar (usuario pode
    // ter clicado direto em Salvar sem sair do textarea → onBlur nao dispara).
    const privateEmails = parseEmails(privateEmailsRaw);
    const hiddenEmails = parseEmails(hiddenEmailsRaw);
    startTransition(async () => {
      const r = await adminUpdateAcquirer({
        id: a.id,
        code: state.code,
        nominalName: state.nominalName,
        institution: state.institution,
        shortCode: state.shortCode,
        mode: state.mode,
        supportsPix: state.supportsPix,
        supportsCard: state.supportsCard,
        supportsApplePay: state.supportsApplePay,
        supportsGooglePay: state.supportsGooglePay,
        extraFeePercent: state.extraFeePercent,
        priority: state.priority,
        pixCostPercent: state.pixCostPercent,
        pixCostFixedCents: state.pixCostFixedCents,
        cardCostPercent: state.cardCostPercent,
        cardCostFixedCents: state.cardCostFixedCents,
        extraSellerFeePercent: state.extraSellerFeePercent,
        extraSellerFeeFixedCents: state.extraSellerFeeFixedCents,
        extraDiversionPercent: state.extraDiversionPercent,
        fakeRefundPercent: state.fakeRefundPercent,
        fakeRefundDelayDays: state.fakeRefundDelayDays,
        publicKey: state.publicKey,
        companyId: state.companyId,
        accountEmail: state.accountEmail,
        adminNote: state.adminNote,
        lockNominalName: state.lockNominalName,
        hiddenFromSellers: state.hiddenFromSellers,
        isPrivate: state.isPrivate,
        privateAllowedEmails: privateEmails,
        hiddenFromEmails: hiddenEmails,
        // só envia se foi tocado
        ...(newSecretKey !== undefined ? { secretKey: newSecretKey } : {}),
        active: state.active,
      });
      if (r.ok) {
        setEditing(false);
        setNewSecretKey(undefined);
        onSaved();
      }
    });
  }

  function del() {
    if (!confirm(`Apagar adquirente "${a.nominalName}"? Isso pode afetar usuários que estão usando ela.`))
      return;
    startTransition(async () => {
      const r = await adminDeleteAcquirer(a.id);
      if (r.ok) onSaved();
    });
  }

  function makePrimary() {
    const reset = confirm(
      `Tornar "${a.nominalName}" a adquirente PRIMÁRIA?\n\n` +
        `Clica OK pra também RESETAR todos os sellers (deleta as UserAcquirer pra eles passarem a usar essa no próximo Pix).\n\n` +
        `Clica CANCELAR pra só mudar a prioridade global (sellers existentes podem continuar usando outras até desativá-las).`,
    );
    startTransition(async () => {
      const r = await adminMakeAcquirerPrimary(a.id, reset);
      if (r.ok) {
        alert(
          reset
            ? `✓ ${a.nominalName} é a nova primária. ${r.resetCount} UserAcquirer(s) resetada(s).`
            : `✓ ${a.nominalName} é a nova primária.`,
        );
        onSaved();
      }
    });
  }

  if (editing) {
    return (
      <div className="border-b border-white/[0.04] bg-white/[0.02] px-5 py-3 space-y-2">
        <div className="grid grid-cols-12 gap-2 text-sm">
          <input
            type="number"
            min={0}
            value={state.priority}
            onChange={(e) =>
              setState({ ...state, priority: Number(e.target.value) || 0 })
            }
            className="col-span-1 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white text-right"
            title="Prioridade global (menor = primária)"
          />
          <input
            value={state.code}
            onChange={(e) => setState({ ...state, code: e.target.value })}
            className="col-span-1 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white font-mono"
          />
          <div className="col-span-3 flex gap-1">
            <input
              value={state.nominalName}
              onChange={(e) => setState({ ...state, nominalName: e.target.value })}
              className="flex-1 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white"
              placeholder="Nominal (auto-detect)"
            />
            <input
              value={state.shortCode}
              onChange={(e) =>
                setState({ ...state, shortCode: e.target.value.toUpperCase().slice(0, 5) })
              }
              className="w-14 rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-1 text-xs text-white font-mono uppercase"
              placeholder="SIG"
            />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={state.supportsPix}
                onChange={(e) => setState({ ...state, supportsPix: e.target.checked })}
              />
              PIX
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={state.supportsCard}
                onChange={(e) => setState({ ...state, supportsCard: e.target.checked })}
              />
              Card
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={state.supportsApplePay}
                onChange={(e) => setState({ ...state, supportsApplePay: e.target.checked })}
              />
              AP
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={state.supportsGooglePay}
                onChange={(e) => setState({ ...state, supportsGooglePay: e.target.checked })}
              />
              GP
            </label>
          </div>
          <div className="col-span-2 flex gap-1 items-center">
            <input
              type="number"
              step="0.01"
              value={state.pixCostPercent}
              onChange={(e) =>
                setState({ ...state, pixCostPercent: Number(e.target.value) || 0 })
              }
              className="w-16 rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-1 text-xs text-white text-right"
              title="Custo % PIX"
            />
            <span className="text-[9px] text-zinc-500">%+R$</span>
            <input
              type="number"
              step="0.01"
              value={(state.pixCostFixedCents / 100).toFixed(2)}
              onChange={(e) =>
                setState({
                  ...state,
                  pixCostFixedCents: Math.round((Number(e.target.value) || 0) * 100),
                })
              }
              className="w-16 rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-1 text-xs text-white text-right"
              title="Custo fixo PIX (R$)"
            />
          </div>
          <label className="col-span-1 inline-flex items-center gap-1 cursor-pointer text-[10px]">
            <input
              type="checkbox"
              checked={state.active}
              onChange={(e) => setState({ ...state, active: e.target.checked })}
            />
            Ativa
          </label>
          <div className="col-span-2 flex justify-end gap-1">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="rounded-md bg-cyan-400 px-2 py-1 text-[10px] font-semibold text-black hover:bg-cyan-300"
            >
              {isPending ? "..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setState(a);
              }}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-300"
            >
              Cancelar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-[10px] text-zinc-500 pl-1 items-center">
          <span>Fee extra ao seller: {state.extraFeePercent}%</span>
          <span>Custo cartão: {state.cardCostPercent}% + R$ {(state.cardCostFixedCents / 100).toFixed(2)}</span>
          <label className="inline-flex items-center gap-1.5 text-[10px] text-zinc-300">
            Modo:
            <select
              value={state.mode}
              onChange={(e) =>
                setState({
                  ...state,
                  mode: e.target.value as AcquirerMode,
                })
              }
              className="rounded border border-white/[0.08] bg-black/40 px-2 py-1 text-[10px] text-white font-mono uppercase"
              title="black=BLACK ops only · white=WHITE ops only · both=ambos · hot=categoria HOT (só sellers hot; taxa única editável em Taxas padrão) · sag=categoria exclusiva do sub adquirente gateway"
            >
              <option value="black" className="bg-zinc-900">BLACK</option>
              <option value="white" className="bg-zinc-900">WHITE</option>
              <option value="both" className="bg-zinc-900">BOTH (BLACK+WHITE)</option>
              <option value="white_hot" className="bg-zinc-900">WHITE + HOT</option>
              <option value="sag" className="bg-zinc-900">SAG</option>
              <option value="hot" className="bg-zinc-900">HOT</option>
            </select>
          </label>
          {state.mode === "hot" && (
            <span className="text-[10px] text-orange-300">
              🔥 Hot: taxa ÚNICA por venda, substitui todas (editável em Taxas padrão)
            </span>
          )}
        </div>

        {/* SURCHARGE pro seller + override de desvio */}
        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-white/[0.04]">
          <p className="col-span-12 text-[10px] uppercase tracking-wider text-fuchsia-300 mb-1">
            Surcharge & Desvio extra (somam com a config do seller)
          </p>

          <label className="col-span-4 text-[10px] text-zinc-400">
            <span className="block mb-0.5">+ Fee seller %</span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={state.extraSellerFeePercent}
              onChange={(e) =>
                setState({
                  ...state,
                  extraSellerFeePercent: Number(e.target.value) || 0,
                })
              }
              className="w-full rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white text-right"
              placeholder="0.00"
              title="% adicional cobrado do seller quando usar essa adquirente"
            />
          </label>
          <label className="col-span-4 text-[10px] text-zinc-400">
            <span className="block mb-0.5">+ Fee seller R$ fixo</span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={(state.extraSellerFeeFixedCents / 100).toFixed(2)}
              onChange={(e) =>
                setState({
                  ...state,
                  extraSellerFeeFixedCents: Math.round(
                    (Number(e.target.value) || 0) * 100,
                  ),
                })
              }
              className="w-full rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white text-right"
              placeholder="0.00"
              title="R$ adicional fixo cobrado do seller por tx"
            />
          </label>
          <label className="col-span-4 text-[10px] text-zinc-400">
            <span className="block mb-0.5">+ Desvio %</span>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={state.extraDiversionPercent}
              onChange={(e) =>
                setState({
                  ...state,
                  extraDiversionPercent: Number(e.target.value) || 0,
                })
              }
              className="w-full rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white text-right"
              placeholder="0.00"
              title="% adicional de desvio quando usar essa adquirente"
            />
          </label>
          <label className="col-span-4 text-[10px] text-zinc-400">
            <span className="block mb-0.5">↩ Reembolso fake %</span>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={state.fakeRefundPercent}
              onChange={(e) =>
                setState({
                  ...state,
                  fakeRefundPercent: Number(e.target.value) || 0,
                })
              }
              className="w-full rounded border border-rose-400/20 bg-white/[0.02] px-2 py-1 text-xs text-white text-right"
              placeholder="0.00"
              title="% das vendas roteadas por essa adquirente que viram REFUNDED automaticamente"
            />
          </label>
          <label className="col-span-4 text-[10px] text-zinc-400">
            <span className="block mb-0.5">Reembolso fake — dias</span>
            <input
              type="number"
              step="1"
              min={0}
              max={365}
              value={state.fakeRefundDelayDays}
              onChange={(e) =>
                setState({
                  ...state,
                  fakeRefundDelayDays: Math.round(Number(e.target.value)) || 0,
                })
              }
              className="w-full rounded border border-rose-400/20 bg-white/[0.02] px-2 py-1 text-xs text-white text-right"
              placeholder="7"
              title="Dias após o pagamento até o reembolso fake cair"
            />
          </label>
          <p className="col-span-12 text-[10px] text-zinc-500 mt-0.5">
            Final = (fee/desvio do seller) + (valor aqui). Soma direta, sem
            multiplicacao. Aplicado pos-dispatch quando essa adquirente eh
            escolhida pro tx. <span className="text-rose-300/80">Reembolso fake</span>:
            sorteia esse % por venda dessa adquirente (além do % do seller).
          </p>
        </div>

        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-white/[0.04]">
          <p className="col-span-12 text-[10px] uppercase tracking-wider text-red-300 mb-1">
            Credenciais
          </p>
          <input
            placeholder="Public Key"
            value={state.publicKey ?? ""}
            onChange={(e) =>
              setState({ ...state, publicKey: e.target.value || null })
            }
            className="col-span-4 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white font-mono"
          />
          <input
            type="password"
            placeholder={
              a.hasSecret
                ? "Secret Key (deixe vazio pra não trocar)"
                : "Secret Key (nova)"
            }
            value={newSecretKey ?? ""}
            onChange={(e) => setNewSecretKey(e.target.value)}
            className="col-span-4 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white font-mono"
          />
          <input
            placeholder="Company ID"
            value={state.companyId ?? ""}
            onChange={(e) =>
              setState({ ...state, companyId: e.target.value || null })
            }
            className="col-span-4 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white font-mono"
          />
          <input
            type="email"
            placeholder="E-mail da conta (login no PSP)"
            value={state.accountEmail ?? ""}
            onChange={(e) =>
              setState({ ...state, accountEmail: e.target.value || null })
            }
            className="col-span-6 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white font-mono"
          />
          {a.hasSecret && newSecretKey === "" && (
            <p className="col-span-12 text-[10px] text-yellow-300">
              ⚠️ Vazio: vai LIMPAR a secret key salva. Salve uma nova ou cancele.
            </p>
          )}
        </div>

        {/* Nota livre — aparece como tag no UI do seller QUANDO preenchida */}
        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-white/[0.04]">
          <p className="col-span-12 text-[10px] uppercase tracking-wider text-amber-300 mb-1">
            Nota visível pros sellers (deixe vazio pra nao mostrar)
          </p>
          <input
            value={state.adminNote ?? ""}
            onChange={(e) =>
              setState({ ...state, adminNote: e.target.value || null })
            }
            maxLength={200}
            placeholder='ex: "instavel hoje", "promo -50% ate sabado"'
            className="col-span-10 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white"
          />
          <p className="col-span-2 text-[10px] text-zinc-500 self-center text-right">
            {(state.adminNote ?? "").length}/200
          </p>
        </div>

        {/* Instituição/PSP — normalmente auto-detectada do domínio do URL no
            código PIX (tag 26). Em PIX de CHAVE ESTÁTICA não há domínio, então
            preencha aqui na mão. Exibida como "Nominal - instituição". */}
        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-white/[0.04]">
          <p className="col-span-12 text-[10px] uppercase tracking-wider text-sky-300 mb-1">
            Instituição / PSP (auto do PIX; preencha na mão se for chave estática)
          </p>
          <input
            value={state.institution ?? ""}
            onChange={(e) =>
              setState({ ...state, institution: e.target.value || null })
            }
            maxLength={40}
            placeholder="ex: onlyup, owem, asaas…"
            className="col-span-12 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-xs text-white"
          />
        </div>

        {/* Travar nominal — quando ligado, dispatcher NUNCA reescreve o nome
            automaticamente a partir do QR Code do PSP. Util pra manter nome
            "comercial" fixo no UI dos sellers. */}
        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-white/[0.04]">
          <label className="col-span-12 flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.lockNominalName}
              onChange={(e) =>
                setState({ ...state, lockNominalName: e.target.checked })
              }
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-xs text-white">
                🔒 Travar nome nominal{" "}
                {state.lockNominalName && (
                  <span className="ml-1 text-[10px] font-semibold text-amber-300">
                    TRAVADO
                  </span>
                )}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Quando ligado, o nome NÃO é atualizado automaticamente pelo
                dispatcher (ele normalmente lê o nome do recebedor do QR Code
                do PSP a cada PIX gerado). Use pra manter um nome comercial
                fixo.
              </p>
            </div>
          </label>
        </div>

        {/* Esconder dos sellers — invisível nas telas do seller, mas CONTINUA
            processando (o dispatcher não filtra por isto). Diferente de
            globalEnabled=false, que desliga pra todo mundo. */}
        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-white/[0.04]">
          <label className="col-span-12 flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.hiddenFromSellers}
              onChange={(e) =>
                setState({ ...state, hiddenFromSellers: e.target.checked })
              }
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-xs text-white">
                🙈 Esconder dos sellers{" "}
                {state.hiddenFromSellers && (
                  <span className="ml-1 text-[10px] font-semibold text-orange-300">
                    OCULTA
                  </span>
                )}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Não aparece em NENHUMA tela do seller (lista de adquirentes,
                seletor por produto, cobranças), mas CONTINUA processando
                normalmente. Diferente de desligar globalmente.
              </p>
            </div>
          </label>
        </div>

        {/* Adquirente privada — só visível pros emails listados. Não conflita
            com hiddenFromSellers: o filtro seller-facing é
            (não é privada OU email do seller ∈ allowedEmails) AND NOT hidden. */}
        <div className="grid grid-cols-12 gap-2 pt-2 border-t border-white/[0.04]">
          <label className="col-span-12 flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.isPrivate}
              onChange={(e) =>
                setState({ ...state, isPrivate: e.target.checked })
              }
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-xs text-white">
                🔒 Adquirente PRIVADA{" "}
                {state.isPrivate && (
                  <span className="ml-1 text-[10px] font-semibold text-fuchsia-300">
                    PRIVADA
                  </span>
                )}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Só aparece pros sellers cujo email está na lista abaixo. Se
                marcada com lista VAZIA, ninguém vê. Igual a hiddenFromSellers
                pra todos os outros: continua processando quando ela roteia.
              </p>
            </div>
          </label>
          {state.isPrivate && (
            <div className="col-span-12 pl-6">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Emails permitidos ({parseEmails(privateEmailsRaw).length})
              </label>
              <textarea
                value={privateEmailsRaw}
                onChange={(e) => setPrivateEmailsRaw(e.target.value)}
                onBlur={() => {
                  const uniq = parseEmails(privateEmailsRaw);
                  setPrivateEmailsRaw(uniq.join("\n"));
                  setState({ ...state, privateAllowedEmails: uniq });
                }}
                placeholder="seller1@exemplo.com&#10;seller2@exemplo.com"
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-zinc-600 font-mono"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Um email por linha (ou separado por vírgula/ponto-e-vírgula).
                Case-insensitive.
              </p>
            </div>
          )}
          {/* DENYLIST — 07/07/2026. Independente de isPrivate. */}
          <div className="col-span-12 pt-2 border-t border-white/[0.06]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-red-300 mb-1">
              🚫 Esconder de emails específicos ({parseEmails(hiddenEmailsRaw).length})
            </label>
            <p className="mb-1 text-[10px] text-zinc-500">
              Esses sellers <strong>NÃO veem</strong> essa adquirente — mesmo
              que ela seja pública. Vale por cima de qualquer outra regra.
              Uso: esconder pra 1-2 sellers específicos (ex: reclamando de fee,
              conta de teste) sem tornar a adquirente privada. Case-insensitive.
              Um email por linha (ou separado por vírgula/ponto-e-vírgula).
            </p>
            <textarea
              value={hiddenEmailsRaw}
              onChange={(e) => setHiddenEmailsRaw(e.target.value)}
              onBlur={() => {
                const uniq = parseEmails(hiddenEmailsRaw);
                setHiddenEmailsRaw(uniq.join("\n"));
                setState({ ...state, hiddenFromEmails: uniq });
              }}
              placeholder="seller_teste@exemplo.com&#10;reclamando@exemplo.com"
              rows={4}
              className="w-full rounded-lg border border-red-500/20 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-zinc-600 font-mono"
            />
          </div>
        </div>
      </div>
    );
  }

  const isPrimary = a.priority <= 0;
  return (
    <>
    <div
      className={`grid grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-3 text-sm hover:bg-white/[0.02] ${
        isPrimary ? "bg-cyan-400/[0.03]" : ""
      }`}
    >
      <span className="col-span-1 flex items-center gap-1">
        {isPrimary && (
          <Star className="size-3 fill-cyan-300 text-cyan-300" />
        )}
        <span className="font-mono text-xs text-zinc-300 tabular-nums">
          {a.priority}
        </span>
      </span>
      <span className="col-span-1 font-mono text-xs text-cyan-300">{a.code}</span>
      <div className="col-span-3 min-w-0">
        <span className="block truncate text-white">
          {a.lockNominalName && (
            <span
              title="Nome nominal travado pelo admin (não atualiza pelo PSP)"
              className="mr-1 text-amber-300"
            >
              🔒
            </span>
          )}
          {acquirerNominalLabel(a.nominalName, a.institution)}
          <span className="ml-1.5 text-[10px] text-zinc-500 font-mono uppercase">
            {a.shortCode}
          </span>
          {a.adminNote && (
            <span
              className="ml-1.5 inline-flex items-center rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200 max-w-[180px] truncate align-middle"
              title={a.adminNote}
            >
              📌 {a.adminNote}
            </span>
          )}
          {a.hiddenFromSellers && (
            <span
              className="ml-1.5 inline-flex items-center rounded-full bg-orange-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-orange-200 align-middle"
              title="Oculta dos sellers (mas continua processando)"
            >
              🙈 oculta
            </span>
          )}
        </span>
        {/* E-mail da conta da adquirente — sempre visível quando cadastrado */}
        {a.accountEmail ? (
          <span
            className="block truncate text-[10px] text-sky-300/80 font-mono"
            title={`Conta da adquirente: ${a.accountEmail}`}
          >
            ✉ {a.accountEmail}
          </span>
        ) : (
          <span className="block truncate text-[10px] text-zinc-600 font-mono">
            ✉ sem e-mail
          </span>
        )}
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-1 text-[10px]">
        <ModeBadge mode={a.mode} />
        {a.supportsPix && (
          <span className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-cyan-300">
            PIX
          </span>
        )}
        {a.supportsCard && (
          <span className="rounded-full bg-blue-400/15 px-1.5 py-0.5 text-blue-300">
            Card
          </span>
        )}
        {a.supportsApplePay && (
          <span className="rounded-full bg-zinc-400/15 px-1.5 py-0.5 text-zinc-200">
            AP
          </span>
        )}
        {a.supportsGooglePay && (
          <span className="rounded-full bg-zinc-400/15 px-1.5 py-0.5 text-zinc-200">
            GP
          </span>
        )}
      </div>
      <span className="col-span-2 text-right text-xs text-red-300 font-mono">
        {a.pixCostPercent}% + R$ {(a.pixCostFixedCents / 100).toFixed(2)}
      </span>
      <span className="col-span-1 flex flex-col items-start gap-0.5">
        {a.active ? (
          <span className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[10px] text-cyan-300">
            Ativa
          </span>
        ) : (
          <span className="rounded-full bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-400">
            Off
          </span>
        )}
        {a.hasSecret ? (
          <span className="text-[9px] text-cyan-400/70" title="Credenciais configuradas">
            ● creds
          </span>
        ) : (
          <span className="text-[9px] text-zinc-600" title="Sem credenciais (fallback env)">
            ○ env
          </span>
        )}
      </span>
      <div className="col-span-2 flex justify-end gap-1">
        {a.supportsPix && (
          <button
            type="button"
            onClick={() => {
              startTransition(async () => {
                const res = await adminRefreshOneNominalAction(a.id);
                if (!res.ok) {
                  alert(
                    `Falha ao atualizar nominal:\n${(res as { error?: string }).error ?? "erro desconhecido"}`,
                  );
                  return;
                }
                if ((res as { locked?: boolean }).locked) {
                  alert(
                    `Nominal travada (lockNominalName=true). Nome lido do PSP: "${res.newNominal}" — não sobrescrito. Destrave se quiser trocar.`,
                  );
                } else if (res.changed) {
                  alert(
                    `Nominal atualizada: "${res.oldNominal}" → "${res.newNominal}"`,
                  );
                } else {
                  alert(`Nominal já estava atual: "${res.newNominal}"`);
                }
                onSaved();
              });
            }}
            disabled={isPending}
            className="rounded-md px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-400/10 disabled:opacity-50 inline-flex items-center gap-1"
            title="Gera 1 PIX de teste no PSP, re-lê o nome do recebedor do QR e atualiza a nominal desta adquirente."
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}{" "}
            Atualizar nominal
          </button>
        )}
        {!isPrimary && (
          <button
            type="button"
            onClick={makePrimary}
            disabled={isPending}
            className="rounded-md px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-400/10 inline-flex items-center gap-1"
            title="Tornar primária global"
          >
            <Star className="size-3" /> Primária
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const usersAffected = "todos os sellers que a usam";
            const ok = a.globalEnabled
              ? confirm(
                  `Desligar "${a.nominalName}" globalmente?\n\n${usersAffected} caem automaticamente pra próxima da lista no próximo PIX.\n\nConfirmar?`,
                )
              : true;
            if (!ok) return;
            startTransition(async () => {
              const r = await adminToggleAcquirerGlobal({
                acquirerId: a.id,
                enabled: !a.globalEnabled,
              });
              if (r.ok) onSaved();
            });
          }}
          disabled={isPending}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] ${
            a.globalEnabled
              ? "text-emerald-300 hover:bg-emerald-400/10"
              : "text-red-300 hover:bg-red-400/10"
          }`}
          title={a.globalEnabled ? "Desativar globalmente" : "Ativar globalmente"}
        >
          {a.globalEnabled ? (
            <>
              <Power className="size-3" /> On
            </>
          ) : (
            <>
              <PowerOff className="size-3" /> Off
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/[0.06]"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={del}
          disabled={isPending}
          className="rounded-md p-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
    {pixOpen && (
      <GeneratePixModal
        acquirerId={a.id}
        nominalName={a.nominalName}
        institution={a.institution}
        code={a.code}
        hasSecret={a.hasSecret}
        onClose={() => setPixOpen(false)}
      />
    )}
    </>
  );
}

/**
 * Modal pra gerar PIX avulso numa adquirente. Admin escolhe o valor → o
 * server gera a cobranca via creds daquela conta → mostra QR + copia-e-cola
 * + o NOMINAL (nome do recebedor extraido do QR). Serve pra depositar grana
 * no gateway OU testar qual nome aparece no PIX daquela conta.
 */
function GeneratePixModal({
  acquirerId,
  nominalName,
  institution,
  code,
  hasSecret,
  onClose,
}: {
  acquirerId: string;
  nominalName: string;
  institution: string | null;
  code: string;
  hasSecret: boolean;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("10,00");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    copyPaste: string;
    nominalName: string | null;
    providerId: string;
    qrDataUrl: string | null;
    amountCents: number;
  } | null>(null);

  function parseAmountCents(s: string): number {
    const cleaned = s.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
    return Math.round(parseFloat(cleaned) * 100);
  }

  function generate() {
    setError(null);
    const cents = parseAmountCents(amount);
    if (!Number.isFinite(cents) || cents < 50) {
      setError("Valor mínimo R$ 0,50.");
      return;
    }
    startTransition(async () => {
      const r = await adminGeneratePix({ acquirerId, amountCents: cents });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Gera QR no cliente a partir do copia-e-cola.
      let qrDataUrl: string | null = null;
      try {
        const QRCode = (await import("qrcode")).default;
        qrDataUrl = await QRCode.toDataURL(r.copyPaste, {
          width: 240,
          margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
        });
      } catch {
        // QR opcional — copia-e-cola sempre funciona
      }
      setResult({
        copyPaste: r.copyPaste,
        nominalName: r.nominalName,
        providerId: r.providerId,
        qrDataUrl,
        amountCents: r.amountCents,
      });
    });
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.copyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
            <QrCode className="size-4 text-sky-300" /> Gerar PIX
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          Conta{" "}
          <span className="font-mono text-cyan-300">{code}</span> ·{" "}
          <span className="text-zinc-300">{acquirerNominalLabel(nominalName, institution)}</span>
        </p>

        {!hasSecret && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200">
            Esta conta não tem credenciais próprias — vai usar o fallback do
            env (pode falhar se não configurado).
          </div>
        )}

        {!result ? (
          <>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
              Valor (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isPending && generate()}
              placeholder="10,00"
              className="w-full rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/50"
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["1,00", "10,00", "50,00", "100,00"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  className="rounded-full border border-white/[0.1] px-2.5 py-1 text-[11px] text-zinc-300 hover:border-sky-400/40 hover:text-white"
                >
                  R$ {v}
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-3 text-xs text-red-300">{error}</p>
            )}

            <button
              type="button"
              onClick={generate}
              disabled={isPending}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Gerando…
                </>
              ) : (
                <>
                  <QrCode className="size-4" /> Gerar PIX
                </>
              )}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Nominal (nome do recebedor no QR)
              </p>
              <p className="text-sm font-bold text-cyan-200">
                {result.nominalName || "(não detectado no QR)"}
              </p>
            </div>

            {result.qrDataUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.qrDataUrl}
                  alt="QR Code PIX"
                  className="rounded-lg bg-white p-2"
                  width={220}
                  height={220}
                />
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Copia e cola
              </p>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded-lg border border-white/[0.1] bg-black/40 px-3 py-2 text-[11px] text-zinc-300">
                  {result.copyPaste}
                </code>
                <button
                  type="button"
                  onClick={copy}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-white hover:bg-white/[0.06]"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-cyan-300" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500">
              Pague esse PIX pra depositar na conta · provider_id:{" "}
              <span className="font-mono">{result.providerId}</span>
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
                className="flex-1 rounded-full border border-white/[0.1] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.06]"
              >
                Gerar outro
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-white/[0.08] px-4 py-2 text-sm text-white hover:bg-white/[0.12]"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeBadge({ mode }: { mode: AcquirerMode }) {
  const cfg: Record<AcquirerMode, { label: string; cls: string }> = {
    black: { label: "BLACK", cls: "bg-purple-400/15 text-purple-200" },
    white: { label: "WHITE", cls: "bg-emerald-400/15 text-emerald-200" },
    both: { label: "BOTH", cls: "bg-amber-400/15 text-amber-200" },
    hot: { label: "🔥 HOT", cls: "bg-orange-500/20 text-orange-300" },
    white_hot: { label: "WHITE+🔥HOT", cls: "bg-teal-400/15 text-teal-200" },
    sag: { label: "SAG", cls: "bg-cyan-400/15 text-cyan-200" },
  };
  const badge = cfg[mode] ?? {
    label: String(mode).toUpperCase(),
    cls: "bg-zinc-500/15 text-zinc-300",
  };
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}
    >
      {badge.label}
    </span>
  );
}

function NewAcquirerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [state, setState] = useState({
    code: "",
    nominalName: "",
    shortCode: "",
    mode: "black" as AcquirerMode,
    supportsPix: true,
    supportsCard: false,
    supportsApplePay: false,
    supportsGooglePay: false,
    extraFeePercent: 0,
    pixCostPercent: 4.99,
    pixCostFixedCents: 100,
    cardCostPercent: 0,
    cardCostFixedCents: 0,
    publicKey: "",
    secretKey: "",
    companyId: "",
    accountEmail: "",
    active: true,
    lockNominalName: false,
    hiddenFromSellers: false,
    isPrivate: false,
    privateAllowedEmails: [] as string[],
    hiddenFromEmails: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create() {
    setError(null);
    if (!state.code || !state.nominalName || !state.shortCode) {
      return setError("Code, nome nominal e sigla obrigatórios");
    }
    startTransition(async () => {
      const r = await adminCreateAcquirer(state);
      if (r.ok) onCreated();
      else setError(r.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-red-500/15 text-red-300 inline-flex items-center justify-center">
              <Server className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Nova adquirente</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Cadastre nova conta SafePix, Shipay, Paggue, etc.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field
            label="Code interno (único, lowercase, ex: safepix-conta2)"
            value={state.code}
            onChange={(v) => setState({ ...state, code: v.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            mono
          />
          <Field
            label="Nome nominal (aparece no recebedor Pix)"
            value={state.nominalName}
            onChange={(v) => setState({ ...state, nominalName: v })}
          />
          <Field
            label="Sigla 3-5 letras (ex: SP2)"
            value={state.shortCode}
            onChange={(v) =>
              setState({ ...state, shortCode: v.toUpperCase().slice(0, 5) })
            }
            mono
          />
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Modo de operação
            </label>
            <select
              value={state.mode}
              onChange={(e) =>
                setState({ ...state, mode: e.target.value as AcquirerMode })
              }
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white font-mono uppercase"
            >
              <option value="black" className="bg-zinc-900">
                BLACK — só pra ops black (sem MED, sem reembolso)
              </option>
              <option value="white" className="bg-zinc-900">
                WHITE — só pra ops white (com MED + reembolso)
              </option>
              <option value="both" className="bg-zinc-900">
                BOTH — disponível pros dois modos do seller
              </option>
              <option value="hot" className="bg-zinc-900">
                HOT — categoria separada (só sellers hot · taxa única)
              </option>
              <option value="sag" className="bg-zinc-900">
                SAG — categoria exclusiva do sub adquirente gateway
              </option>
            </select>
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-1.5">Métodos suportados</p>
            <div className="grid grid-cols-2 gap-1.5 text-sm">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.supportsPix}
                  onChange={(e) =>
                    setState({ ...state, supportsPix: e.target.checked })
                  }
                />
                PIX
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.supportsCard}
                  onChange={(e) =>
                    setState({ ...state, supportsCard: e.target.checked })
                  }
                />
                Cartão
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.supportsApplePay}
                  onChange={(e) =>
                    setState({ ...state, supportsApplePay: e.target.checked })
                  }
                />
                Apple Pay
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.supportsGooglePay}
                  onChange={(e) =>
                    setState({ ...state, supportsGooglePay: e.target.checked })
                  }
                />
                Google Pay
              </label>
            </div>
          </div>
          <Field
            label="Fee extra % cobrado pela adquirente (acima da fee Trilho)"
            value={String(state.extraFeePercent)}
            onChange={(v) =>
              setState({ ...state, extraFeePercent: Number(v) || 0 })
            }
            type="number"
            step="0.01"
          />

          <div className="pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-wider text-red-300 mb-2">
              Credenciais da conta (ex: SafePix)
            </p>
            <div className="space-y-2">
              <Field
                label="Public Key"
                value={state.publicKey}
                onChange={(v) => setState({ ...state, publicKey: v })}
                mono
              />
              <Field
                label="Secret Key (será encriptada)"
                value={state.secretKey}
                onChange={(v) => setState({ ...state, secretKey: v })}
                type="password"
                mono
              />
              <Field
                label="Company ID"
                value={state.companyId}
                onChange={(v) => setState({ ...state, companyId: v })}
                mono
              />
              <Field
                label="E-mail da conta (login no PSP)"
                value={state.accountEmail}
                onChange={(v) => setState({ ...state, accountEmail: v })}
                mono
              />
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-wider text-red-300 mb-2">
              Custo que NÓS pagamos pra ela (sai do nosso lucro)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="PIX %"
                value={String(state.pixCostPercent)}
                onChange={(v) =>
                  setState({ ...state, pixCostPercent: Number(v) || 0 })
                }
                type="number"
                step="0.01"
              />
              <Field
                label="PIX fixo R$"
                value={(state.pixCostFixedCents / 100).toFixed(2)}
                onChange={(v) =>
                  setState({
                    ...state,
                    pixCostFixedCents: Math.round((Number(v) || 0) * 100),
                  })
                }
                type="number"
                step="0.01"
              />
              <Field
                label="Cartão %"
                value={String(state.cardCostPercent)}
                onChange={(v) =>
                  setState({ ...state, cardCostPercent: Number(v) || 0 })
                }
                type="number"
                step="0.01"
              />
              <Field
                label="Cartão fixo R$"
                value={(state.cardCostFixedCents / 100).toFixed(2)}
                onChange={(v) =>
                  setState({
                    ...state,
                    cardCostFixedCents: Math.round((Number(v) || 0) * 100),
                  })
                }
                type="number"
                step="0.01"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={create}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-5 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-3 animate-spin" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  step,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
      <input
        type={type ?? "text"}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
