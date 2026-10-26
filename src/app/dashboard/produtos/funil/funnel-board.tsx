"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  Handle,
  Position,
  Panel,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus,
  Link2,
  ArrowDownRight,
  Tag,
  Globe,
  Check,
  Loader2,
  X,
  Trash2,
  Power,
  ArrowLeft,
  Search,
  CheckCircle2,
  Circle,
  AlertTriangle,
  StickyNote,
  LayoutGrid,
  Lock,
  Unlock,
  Play,
  ChevronRight,
  ExternalLink,
  Undo2,
  Redo2,
  Workflow,
  Mail,
} from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import { saveFunnelGraph, activateFunnel } from "./actions";
import type { FunnelLoaderProps, FunnelOffer, OfferAbResult } from "./funnel-loader";

const UPSELL = "#06b6d4";
const BACK = "#fb923c";

const TYPE_LABEL: Record<string, string> = {
  standard: "Padrão",
  vsl: "VSL",
  mobile: "Mobile",
  express: "Express",
  social: "Social",
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

type OfferNodeData = {
  checkoutId: string;
  slug: string;
  productName: string;
  productImage: string | null;
  price: number;
  checkoutType: string;
  label: string; // nome editável (vazio = usa productName)
  /** Link interno: quando OUTRA oferta conecta nesta, a conexão vai pra cá
   *  (em vez do checkout dela). `undefined`/`null` = sem link interno. */
  embeddedUrl?: string | null;
  embeddedLabel?: string | null;
  /** Etiqueta de cor/categoria (entrada, principal, vip, recup). */
  tag?: string | null;
  /** Trava o nó pra não arrastar sem querer. */
  locked?: boolean;
  /** Métricas (preenchidas pelo servidor): vendas pagas + receita em centavos. */
  sales?: number;
  revenueCents?: number;
  /** Intensidade 0..1 pro heatmap (relativa à oferta que mais vendeu). */
  heat?: number;
  /** Resultado do teste A/B de upsell desta oferta (origem). */
  ab?: OfferAbResult;
  /** Aceite do upsell único (não-A/B). */
  upsellAcceptance?: { sent: number; converted: number; rate: number };
  /** Order bumps configurados neste checkout. */
  bumps?: number;
  /** Modo de roteamento do upsell quando há 2 saídas:
   *  "ab" (split %) | "method" | "amount" | "uf". */
  routeMode?: string;
  /** Valor da condição: método (CARD/PIX), valor em reais, ou UF. */
  routeValue?: string;
  /** Sequência pós-compra por e-mail (enviada após o pagamento confirmado). */
  postPurchaseEmail?: { delayMin?: number; subject?: string; body?: string } | null;
};

const ROUTE_LABEL: Record<string, string> = {
  ab: "A/B (%)",
  method: "Método",
  amount: "Valor",
  uf: "UF",
};

const PP_DELAY_OPTIONS: { label: string; min: number }[] = [
  { label: "na hora", min: 0 },
  { label: "10 min", min: 10 },
  { label: "30 min", min: 30 },
  { label: "1 hora", min: 60 },
  { label: "1 dia", min: 1440 },
];
type UrlNodeData = { url: string; label: string; locked?: boolean };
type NoteNodeData = { text: string; color: string; locked?: boolean };

const OFFER_TAGS: Record<string, { label: string; color: string }> = {
  entrada: { label: "Entrada", color: "#06b6d4" },
  principal: { label: "Principal", color: "#a78bfa" },
  vip: { label: "VIP", color: "#fbbf24" },
  recup: { label: "Recuperação", color: "#fb923c" },
};

const edgeKindLabel = (kind: "upsell" | "backredirect") =>
  kind === "upsell" ? "upsell" : "back-redirect";

const AB_LETTERS = ["A", "B", "C", "D", "E"];
const rid = () => Math.random().toString(36).slice(2, 7);
const eKind = (e: Edge) =>
  ((e.data as Record<string, unknown> | undefined)?.kind ?? "upsell") as "upsell" | "backredirect";
const eWeight = (e: Edge) => {
  const w = Number((e.data as Record<string, unknown> | undefined)?.weight);
  return Number.isFinite(w) ? w : NaN;
};

const NOTE_COLORS: Record<
  string,
  { bg: string; border: string; text: string; dot: string }
> = {
  amber: { bg: "bg-amber-300/[0.08]", border: "border-amber-300/30", text: "text-amber-100", dot: "#fcd34d" },
  cyan: { bg: "bg-cyan-300/[0.08]", border: "border-cyan-300/30", text: "text-cyan-100", dot: "#67e8f9" },
  sky: { bg: "bg-sky-300/[0.08]", border: "border-sky-300/30", text: "text-sky-100", dot: "#7dd3fc" },
  rose: { bg: "bg-rose-300/[0.08]", border: "border-rose-300/30", text: "text-rose-100", dot: "#fda4af" },
};

/* ----------------------------- custom nodes ----------------------------- */

function OfferNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as OfferNodeData;
  const { updateNodeData, setNodes } = useReactFlow();
  const tag = d.tag ? OFFER_TAGS[d.tag] : null;
  const toggleLock = () =>
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, draggable: !d.locked, data: { ...n.data, locked: !d.locked } } : n,
      ),
    );
  // quantas saídas de upsell esta oferta tem (reativo) — define se mostra o
  // seletor de roteamento (2+ = teste A/B ou condicional).
  const upsellEdgeCount = useStore(
    (s) =>
      s.edges.filter(
        (e) =>
          e.source === id &&
          ((e.data as Record<string, unknown> | undefined)?.kind ?? "upsell") !== "backredirect",
      ).length,
  );
  const mode = d.routeMode ?? "ab";
  return (
    <div
      className={cn(
        "group relative w-[252px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected
          ? "border-cyan-400/80 ring-2 ring-cyan-400/20"
          : "border-white/[0.1] hover:border-white/20",
      )}
      style={tag ? { boxShadow: `inset 4px 0 0 ${tag.color}` } : undefined}
    >
      {/* toolbar (hover): etiqueta de cor + travar posição */}
      <div className="nodrag absolute -top-3 right-2 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-zinc-950/95 px-1.5 py-1 opacity-0 shadow-lg transition group-hover:opacity-100">
        {Object.entries(OFFER_TAGS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => updateNodeData(id, { tag: d.tag === k ? null : k })}
            title={v.label}
            className="size-2.5 rounded-full ring-1 ring-black/40 transition hover:scale-125"
            style={{ background: v.color, outline: d.tag === k ? "2px solid #fff" : "none", outlineOffset: 1 }}
          />
        ))}
        <span className="mx-0.5 h-3 w-px bg-white/15" />
        <a
          href={`/c/${d.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir checkout (preview em nova aba)"
          onClick={(e) => e.stopPropagation()}
          className="text-zinc-400 hover:text-white"
        >
          <ExternalLink className="size-3" />
        </a>
        <button onClick={toggleLock} title={d.locked ? "Destravar" : "Travar posição"} className="text-zinc-400 hover:text-white">
          {d.locked ? <Lock className="size-3 text-amber-300" /> : <Unlock className="size-3" />}
        </button>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500"
      />
      <div className="flex items-center gap-3 p-3.5">
        {d.productImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.productImage} alt="" className="size-11 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/[0.06] shrink-0">
            <Tag className="size-5 text-zinc-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <input
            value={d.label}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            placeholder={d.productName}
            title="Nome da oferta (clique pra editar)"
            className="nodrag -mx-1 w-[calc(100%+0.5rem)] truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-white placeholder:text-zinc-300 hover:border-white/10 focus:border-cyan-400/40 focus:bg-zinc-950 focus:outline-none"
          />
          <p className="mt-0.5 px-0 text-xs text-zinc-400">
            {formatBRL(d.price)}
            <span className="text-zinc-600"> · {typeLabel(d.checkoutType)}</span>
          </p>
          {tag && (
            <span
              className="mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ background: `${tag.color}22`, color: tag.color }}
            >
              {tag.label}
            </span>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.06] px-3.5 py-2">
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span className="truncate">/{d.slug}</span>
          {d.locked ? (
            <span className="ml-2 inline-flex shrink-0 items-center gap-0.5 text-amber-300/80">
              <Lock className="size-2.5" /> travado
            </span>
          ) : (
            <span className="ml-2 shrink-0 opacity-0 transition group-hover:opacity-100">
              arraste as bolinhas →
            </span>
          )}
        </div>
        {typeof d.bumps === "number" && d.bumps > 0 && (
          <a
            href={`/dashboard/checkout-builder/${d.checkoutId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Configurar order bumps deste checkout"
            className="nodrag mt-1 inline-flex items-center gap-1 text-[10px] text-violet-300/80 hover:text-violet-200"
          >
            <Plus className="size-2.5" /> {d.bumps} order bump{d.bumps !== 1 ? "s" : ""}
          </a>
        )}
        {typeof d.sales === "number" && (
          <div className="mt-1.5" title="Vendas pagas desta oferta (todo o período)">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">
                {d.sales} venda{d.sales !== 1 ? "s" : ""}
              </span>
              <span className="font-medium text-cyan-300/90">{formatBRL(d.revenueCents ?? 0)}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: (d.heat ?? 0) > 0 ? `${Math.max(6, Math.round((d.heat ?? 0) * 100))}%` : "0%",
                  background: UPSELL,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ROTEAMENTO do upsell (quando há 2 saídas): A/B % ou condicional */}
      {upsellEdgeCount >= 2 && (
        <div className="border-t border-white/[0.06] bg-white/[0.015] px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-zinc-500">2 upsells:</span>
            <select
              value={mode}
              onChange={(e) => updateNodeData(id, { routeMode: e.target.value })}
              className="nodrag rounded border border-white/10 bg-zinc-950 px-1 py-0.5 text-[10px] text-white focus:outline-none"
            >
              <option value="ab">Teste A/B (%)</option>
              <option value="method">Por método</option>
              <option value="amount">Por valor</option>
              <option value="uf">Por UF</option>
            </select>
            {mode === "method" && (
              <select
                value={d.routeValue ?? "CARD"}
                onChange={(e) => updateNodeData(id, { routeValue: e.target.value })}
                className="nodrag rounded border border-white/10 bg-zinc-950 px-1 py-0.5 text-[10px] text-white focus:outline-none"
              >
                <option value="CARD">A = cartão</option>
                <option value="PIX">A = pix</option>
              </select>
            )}
            {mode === "amount" && (
              <span className="flex items-center gap-1 text-zinc-500">
                A se ≥ R$
                <input
                  type="number"
                  min={0}
                  value={d.routeValue ?? ""}
                  onChange={(e) => updateNodeData(id, { routeValue: e.target.value })}
                  placeholder="50"
                  className="nodrag w-14 rounded border border-white/10 bg-zinc-950 px-1 py-0.5 text-[10px] text-white focus:outline-none"
                />
              </span>
            )}
            {mode === "uf" && (
              <span className="flex items-center gap-1 text-zinc-500">
                A se UF =
                <input
                  value={d.routeValue ?? ""}
                  onChange={(e) =>
                    updateNodeData(id, {
                      routeValue: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
                    })
                  }
                  placeholder="SP"
                  className="nodrag w-10 rounded border border-white/10 bg-zinc-950 px-1 py-0.5 text-[10px] uppercase text-white focus:outline-none"
                />
              </span>
            )}
          </div>
        </div>
      )}

      {/* RESULTADO DO TESTE A/B (vencedor por taxa de aceite do upsell) */}
      {d.ab && d.ab.variants.length >= 2 && (
        <div className="border-t border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
            Teste A/B · aceite do upsell
          </p>
          <div className="space-y-0.5">
            {d.ab.variants.map((v) => {
              const win = d.ab!.winner === v.label;
              return (
                <div key={v.label} className="flex items-center gap-1.5 text-[10px]">
                  <span className="font-bold" style={{ color: UPSELL }}>
                    {v.label}
                  </span>
                  <span className="text-zinc-400">
                    {v.sent} env · {v.converted} conv
                  </span>
                  <span className={cn("ml-auto font-semibold", win ? "text-cyan-300" : "text-zinc-300")}>
                    {(v.rate * 100).toFixed(0)}%{win ? " 🏆" : ""}
                  </span>
                </div>
              );
            })}
          </div>
          {d.ab.winner == null && (
            <p className="mt-1 text-[9px] text-zinc-500">Coletando dados (precisa de mais vendas).</p>
          )}
        </div>
      )}

      {/* ACEITE do upsell único (quando não é teste A/B) */}
      {!d.ab && d.upsellAcceptance && (
        <div className="border-t border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-1.5 text-[10px]">
          <span className="font-bold uppercase tracking-wide text-cyan-300">Aceite do upsell</span>{" "}
          <span className="font-semibold text-zinc-200">
            {(d.upsellAcceptance.rate * 100).toFixed(0)}%
          </span>{" "}
          <span className="text-zinc-500">
            ({d.upsellAcceptance.converted}/{d.upsellAcceptance.sent})
          </span>
        </div>
      )}

      {/* LINK INTERNO — destino quando OUTRA oferta conecta nesta */}
      {typeof d.embeddedUrl === "string" ? (
        <div className="flex items-center gap-1.5 border-t border-orange-400/20 bg-orange-400/[0.06] px-3 py-2">
          <Globe className="size-3 shrink-0 text-orange-300" />
          <input
            value={d.embeddedUrl}
            onChange={(e) => updateNodeData(id, { embeddedUrl: e.target.value })}
            placeholder="https://link-de-destino…"
            title="Quando outra oferta conectar aqui, o cliente vai pra este link"
            className="nodrag min-w-0 flex-1 bg-transparent text-[11px] text-orange-200 placeholder:text-orange-300/40 focus:outline-none"
          />
          <button
            onClick={() => updateNodeData(id, { embeddedUrl: null, embeddedLabel: null })}
            title="Remover link interno"
            className="nodrag shrink-0 rounded p-0.5 text-orange-300/70 hover:bg-orange-400/10 hover:text-orange-200"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => updateNodeData(id, { embeddedUrl: "" })}
          title="Coloca um link DENTRO desta oferta — vira o destino de quem conectar aqui"
          className="nodrag flex w-full items-center gap-1 border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-zinc-500 transition hover:bg-white/[0.03] hover:text-orange-300"
        >
          <Plus className="size-3" /> link de destino interno
        </button>
      )}

      {/* SEQUÊNCIA PÓS-COMPRA (e-mail enviado após o pagamento) */}
      {d.postPurchaseEmail ? (
        <div className="space-y-1.5 border-t border-sky-400/15 bg-sky-400/[0.05] px-3 py-2">
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-sky-300">
              <Mail className="size-3" /> E-mail pós-compra
            </span>
            <div className="flex items-center gap-1">
              <select
                value={String(d.postPurchaseEmail.delayMin ?? 0)}
                onChange={(e) =>
                  updateNodeData(id, {
                    postPurchaseEmail: { ...(d.postPurchaseEmail ?? {}), delayMin: Number(e.target.value) },
                  })
                }
                className="nodrag rounded border border-white/10 bg-zinc-950 px-1 py-0.5 text-[9px] text-white focus:outline-none"
              >
                {PP_DELAY_OPTIONS.map((o) => (
                  <option key={o.min} value={o.min}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => updateNodeData(id, { postPurchaseEmail: null })}
                title="Remover e-mail pós-compra"
                className="nodrag rounded p-0.5 text-sky-300/70 hover:text-sky-200"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
          <input
            value={d.postPurchaseEmail.subject ?? ""}
            onChange={(e) =>
              updateNodeData(id, {
                postPurchaseEmail: { ...(d.postPurchaseEmail ?? {}), subject: e.target.value },
              })
            }
            placeholder="Assunto do e-mail"
            className="nodrag w-full rounded border border-white/10 bg-zinc-950 px-1.5 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none"
          />
          <textarea
            value={d.postPurchaseEmail.body ?? ""}
            onChange={(e) =>
              updateNodeData(id, {
                postPurchaseEmail: { ...(d.postPurchaseEmail ?? {}), body: e.target.value },
              })
            }
            placeholder="Mensagem… use {{nome}} e {{produto}}"
            rows={3}
            className="nodrag nowheel w-full resize-none rounded border border-white/10 bg-zinc-950 px-1.5 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => updateNodeData(id, { postPurchaseEmail: { delayMin: 0, subject: "", body: "" } })}
          title="Envia um e-mail automático depois que a venda é confirmada"
          className="nodrag flex w-full items-center gap-1 border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-zinc-500 transition hover:bg-white/[0.03] hover:text-sky-300"
        >
          <Mail className="size-3" /> e-mail pós-compra
        </button>
      )}

      {/* upsell (direita) */}
      <Handle
        type="source"
        position={Position.Right}
        id="upsell"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: UPSELL }}
      />
      <span
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+10px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide"
        style={{ background: `${UPSELL}22`, color: UPSELL }}
      >
        upsell
      </span>
      {/* back-redirect (baixo) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="backredirect"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: BACK }}
      />
      <span
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+8px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide"
        style={{ background: `${BACK}22`, color: BACK }}
      >
        back
      </span>
    </div>
  );
}

function UrlNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as UrlNodeData;
  const { updateNodeData, setNodes } = useReactFlow();
  const valid = !d.url || /^https?:\/\//i.test(d.url);
  const toggleLock = () =>
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, draggable: !d.locked, data: { ...n.data, locked: !d.locked } } : n,
      ),
    );
  return (
    <div
      className={cn(
        "w-[252px] rounded-2xl border bg-zinc-900/95 shadow-xl",
        selected ? "border-orange-400/80 ring-2 ring-orange-400/20" : "border-white/[0.1]",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="group flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-orange-400/[0.06] px-3 py-2 text-orange-300">
        <Globe className="size-3.5 shrink-0" />
        <input
          value={d.label}
          onChange={(e) => updateNodeData(id, { label: e.target.value })}
          placeholder="Nome do link"
          className="nodrag w-full bg-transparent text-[11px] font-semibold uppercase tracking-wide text-orange-200 placeholder:text-orange-300/40 focus:outline-none"
        />
        <button
          onClick={toggleLock}
          title={d.locked ? "Destravar" : "Travar posição"}
          className="nodrag shrink-0 text-orange-300/60 hover:text-orange-200"
        >
          {d.locked ? <Lock className="size-3 text-amber-300" /> : <Unlock className="size-3 opacity-0 transition group-hover:opacity-100" />}
        </button>
      </div>
      <div className="p-2.5">
        <input
          value={d.url}
          onChange={(e) => updateNodeData(id, { url: e.target.value })}
          placeholder="https://..."
          className={cn(
            "nodrag w-full rounded-lg border bg-zinc-950 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1",
            valid ? "border-white/[0.08] focus:ring-orange-400/40" : "border-red-500/50 focus:ring-red-400/40",
          )}
        />
        {!valid && <p className="mt-1 text-[10px] text-red-300">precisa começar com http(s)://</p>}
      </div>
    </div>
  );
}

function NoteNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as NoteNodeData;
  const { updateNodeData, setNodes } = useReactFlow();
  const c = NOTE_COLORS[d.color] ?? NOTE_COLORS.amber;
  const rows = Math.min(14, Math.max(3, (d.text || "").split("\n").length));
  return (
    <div
      className={cn(
        "group relative w-[230px] rounded-xl border p-2 shadow-lg backdrop-blur transition",
        c.bg,
        c.border,
        selected ? "ring-2 ring-white/25" : "",
      )}
    >
      <div className="mb-1 flex items-center justify-between opacity-0 transition group-hover:opacity-100">
        <div className="flex items-center gap-1">
          {Object.entries(NOTE_COLORS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => updateNodeData(id, { color: k })}
              className="nodrag size-3 rounded-full ring-1 ring-black/30 transition hover:scale-110"
              style={{ background: v.dot }}
              title={`Cor ${k}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() =>
              setNodes((nds) =>
                nds.map((n) =>
                  n.id === id ? { ...n, draggable: !d.locked, data: { ...n.data, locked: !d.locked } } : n,
                ),
              )
            }
            className="nodrag rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
            title={d.locked ? "Destravar" : "Travar posição"}
          >
            {d.locked ? <Lock className="size-3 text-amber-300" /> : <Unlock className="size-3" />}
          </button>
          <button
            onClick={() => setNodes((nds) => nds.filter((n) => n.id !== id))}
            className="nodrag rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
            title="Excluir anotação"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
      <textarea
        value={d.text}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        placeholder="Anote ideias, lembretes, próximos passos…"
        rows={rows}
        className={cn(
          "nodrag nowheel w-full resize-none bg-transparent text-xs leading-snug placeholder:text-white/30 focus:outline-none",
          c.text,
        )}
      />
    </div>
  );
}

const nodeTypes = { offer: OfferNode, url: UrlNode, note: NoteNode };

/* ------------------------------- helpers -------------------------------- */

function edgeStyle(kind: "upsell" | "backredirect"): Partial<Edge> {
  const color = kind === "upsell" ? UPSELL : BACK;
  return {
    type: "smoothstep",
    animated: true,
    style: { stroke: color, strokeWidth: 2.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    label: kind === "upsell" ? "upsell" : "back-redirect",
    labelStyle: { fill: color, fontSize: 10, fontWeight: 700 },
    labelBgStyle: { fill: "#18181b", fillOpacity: 0.95 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
  };
}

type OfferMetric = { sales: number; revenueCents: number; heat: number };

/** Mapa de métricas por checkoutId, ou undefined se o servidor não mandou
 *  dados de venda (aí o nó não mostra métricas). Heat = relativo ao topo. */
function buildMetrics(offers: FunnelOffer[]): Map<string, OfferMetric> | undefined {
  const hasData = offers.some((o) => typeof o.sales === "number");
  if (!hasData) return undefined;
  const max = Math.max(1, ...offers.map((o) => o.sales ?? 0));
  const m = new Map<string, OfferMetric>();
  for (const o of offers) {
    const sales = o.sales ?? 0;
    m.set(o.id, { sales, revenueCents: o.revenueCents ?? 0, heat: sales > 0 ? sales / max : 0 });
  }
  return m;
}

function hydrateNodes(
  raw: unknown,
  offers: FunnelOffer[],
  metricsById?: Map<string, OfferMetric>,
): Node[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(offers.map((o) => [o.id, o]));
  const out: Node[] = [];
  for (const n of raw as Node[]) {
    if (n.type === "offer") {
      const cid = (n.data as Record<string, unknown> | undefined)?.checkoutId as string | undefined;
      const o = cid ? byId.get(cid) : undefined;
      if (!o) continue; // oferta removida/inativa → some do mapa
      const dd = n.data as Record<string, unknown> | undefined;
      const savedLabel = dd?.label;
      const savedEmb = dd?.embeddedUrl;
      const savedEmbLabel = dd?.embeddedLabel;
      const savedTag = dd?.tag;
      const locked = dd?.locked === true;
      const savedRouteMode = dd?.routeMode;
      const savedRouteValue = dd?.routeValue;
      const savedPP = dd?.postPurchaseEmail;
      const m = metricsById?.get(o.id);
      out.push({
        id: n.id,
        type: "offer",
        position: n.position ?? { x: 0, y: 0 },
        draggable: locked ? false : undefined,
        data: {
          checkoutId: o.id,
          slug: o.slug,
          productName: o.productName,
          productImage: o.productImage,
          price: o.priceCents,
          checkoutType: o.checkoutType,
          label: typeof savedLabel === "string" ? savedLabel : "",
          embeddedUrl: typeof savedEmb === "string" ? savedEmb : undefined,
          embeddedLabel: typeof savedEmbLabel === "string" ? savedEmbLabel : undefined,
          tag: typeof savedTag === "string" ? savedTag : undefined,
          locked,
          sales: m?.sales,
          revenueCents: m?.revenueCents,
          heat: m?.heat,
          ab: o.ab,
          upsellAcceptance: o.upsellAcceptance,
          bumps: o.bumps,
          routeMode: typeof savedRouteMode === "string" ? savedRouteMode : undefined,
          routeValue: typeof savedRouteValue === "string" ? savedRouteValue : undefined,
          postPurchaseEmail:
            savedPP && typeof savedPP === "object"
              ? (savedPP as { delayMin?: number; subject?: string; body?: string })
              : undefined,
        } satisfies OfferNodeData,
      });
    } else if (n.type === "url") {
      const dd = n.data as Record<string, unknown> | undefined;
      const locked = dd?.locked === true;
      out.push({
        id: n.id,
        type: "url",
        position: n.position ?? { x: 0, y: 0 },
        draggable: locked ? false : undefined,
        data: {
          url: String(dd?.url ?? ""),
          label: String(dd?.label ?? ""),
          locked,
        } satisfies UrlNodeData,
      });
    } else if (n.type === "note") {
      const dd = n.data as Record<string, unknown> | undefined;
      const locked = dd?.locked === true;
      out.push({
        id: n.id,
        type: "note",
        position: n.position ?? { x: 0, y: 0 },
        draggable: locked ? false : undefined,
        data: {
          text: String(dd?.text ?? ""),
          color: typeof dd?.color === "string" ? dd.color : "amber",
          locked,
        } satisfies NoteNodeData,
      });
    }
  }
  return out;
}

/** Auto-arranjo simples em camadas (esquerda→direita) pela profundidade das
 *  conexões. Anotações ficam onde estão. Não rearranja em ciclos infinitos
 *  (cap = nº de nós). */
function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const depth = new Map<string, number>();
  nodes.forEach((n) => depth.set(n.id, 0));
  for (let i = 0; i < nodes.length; i++) {
    let changed = false;
    for (const e of edges) {
      const ds = depth.get(e.source) ?? 0;
      if ((depth.get(e.target) ?? 0) < ds + 1) {
        depth.set(e.target, ds + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const COLW = 320;
  const ROWH = 168;
  const rowByCol = new Map<number, number>();
  return nodes.map((n) => {
    if (n.type === "note") return n; // anotações não entram no arranjo
    const d = depth.get(n.id) ?? 0;
    const row = rowByCol.get(d) ?? 0;
    rowByCol.set(d, row + 1);
    return { ...n, position: { x: 80 + d * COLW, y: 60 + row * ROWH } };
  });
}
function hydrateEdges(raw: unknown): Edge[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Edge[]).map((e) => {
    const dd = e.data as Record<string, unknown> | undefined;
    const kind = dd?.kind === "backredirect" ? "backredirect" : "upsell";
    const note = typeof dd?.note === "string" ? dd.note : "";
    const wRaw = Number(dd?.weight);
    const weight = Number.isFinite(wRaw) ? wRaw : undefined;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? kind,
      targetHandle: e.targetHandle ?? "in",
      data: { kind, note: note || undefined, weight },
      ...edgeStyle(kind),
      label: note || edgeKindLabel(kind),
    } as Edge;
  });
}

function serialize(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      data: {
        kind: (e.data as Record<string, unknown> | undefined)?.kind ?? "upsell",
        note: (e.data as Record<string, unknown> | undefined)?.note ?? null,
        weight: (e.data as Record<string, unknown> | undefined)?.weight ?? null,
      },
    })),
  };
}

const offerLabel = (o: FunnelOffer) => `${o.productName} · ${typeLabel(o.checkoutType)} · ${formatBRL(o.priceCents)}`;

/* -------------------------------- board --------------------------------- */

function Board({ funnelId, name, backHref, active, offers, sellerDomain, initialGraph }: FunnelLoaderProps) {
  const initial = (initialGraph ?? {}) as { nodes?: unknown; edges?: unknown };
  const metricsById = useMemo(() => buildMetrics(offers), [offers]);
  const [nodes, setNodes, onNodesChange] = useNodesState(hydrateNodes(initial.nodes, offers, metricsById));
  const [edges, setEdges, onEdgesChange] = useEdgesState(hydrateEdges(initial.edges));
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [isApplying, startApply] = useTransition();
  const [isActive, setIsActive] = useState(active);
  const [search, setSearch] = useState("");
  const { getIntersectingNodes, fitView } = useReactFlow();

  // Detecta o ciclo de upsell (A→B→A) e marca a aresta que fecha o loop —
  // pra pintar de vermelho ao vivo (o ativar também bloqueia no servidor).
  const cycleEdgeIds = useMemo(() => {
    const adj = new Map<string, { t: string; id: string }[]>();
    for (const e of edges) {
      const kind = (e.data as Record<string, unknown> | undefined)?.kind ?? "upsell";
      if (kind === "backredirect") continue;
      adj.set(e.source, [...(adj.get(e.source) ?? []), { t: e.target, id: e.id }]);
    }
    const bad = new Set<string>();
    const color = new Map<string, number>(); // 0/undef=novo, 1=na pilha, 2=ok
    const visit = (u: string) => {
      color.set(u, 1);
      for (const { t, id } of adj.get(u) ?? []) {
        const c = color.get(t);
        if (c === 1) bad.add(id);
        else if (!c) visit(t);
      }
      color.set(u, 2);
    };
    for (const u of adj.keys()) if (!color.get(u)) visit(u);
    return bad;
  }, [edges]);

  // Rótulos de teste A/B: quando uma oferta tem 2+ saídas de upsell, cada
  // aresta vira "A {peso}%", "B {peso}%"… (ordem estável por id).
  const abLabelById = useMemo(() => {
    const routeBySource = new Map<string, { mode: string; value: string }>();
    for (const n of nodes) {
      if (n.type !== "offer") continue;
      const dd = n.data as Record<string, unknown> | undefined;
      routeBySource.set(n.id, {
        mode: typeof dd?.routeMode === "string" ? dd.routeMode : "ab",
        value: dd?.routeValue != null ? String(dd.routeValue) : "",
      });
    }
    const bySource = new Map<string, Edge[]>();
    for (const e of edges) {
      if (eKind(e) === "backredirect") continue;
      bySource.set(e.source, [...(bySource.get(e.source) ?? []), e]);
    }
    const map = new Map<string, string>();
    for (const [src, list] of bySource) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
      const route = routeBySource.get(src) ?? { mode: "ab", value: "" };
      sorted.forEach((e, i) => {
        const letter = AB_LETTERS[i] ?? "V";
        if (route.mode === "ab") {
          const w = Number.isFinite(eWeight(e)) ? eWeight(e) : Math.round(100 / sorted.length);
          map.set(e.id, `${letter} ${w}%`);
        } else {
          let cond = "senão";
          if (i === 0) {
            if (route.mode === "method") cond = route.value === "PIX" ? "se pix" : "se cartão";
            else if (route.mode === "amount") cond = `se ≥R$${route.value || "?"}`;
            else if (route.mode === "uf") cond = `se ${route.value || "UF"}`;
          }
          map.set(e.id, `${letter}: ${cond}`);
        }
      });
    }
    return map;
  }, [edges, nodes]);

  // Arestas com estilo derivado: loop em vermelho > rótulo A/B > normal.
  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        if (cycleEdgeIds.has(e.id)) {
          return {
            ...e,
            animated: true,
            style: { stroke: "#ef4444", strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#ef4444", width: 16, height: 16 },
            label: "⚠ loop",
            labelStyle: { fill: "#ef4444", fontSize: 10, fontWeight: 700 },
          };
        }
        const ab = abLabelById.get(e.id);
        if (ab) {
          return {
            ...e,
            label: ab,
            labelStyle: { fill: UPSELL, fontSize: 10, fontWeight: 700 },
          };
        }
        return e;
      }),
    [edges, cycleEdgeIds, abLabelById],
  );

  // ofertas no mapa sem nenhuma saída (upsell/back) configurada
  const orphanCount = useMemo(() => {
    const srcs = new Set(edges.map((e) => e.source));
    return nodes.filter((n) => n.type === "offer" && !srcs.has(n.id)).length;
  }, [nodes, edges]);

  const onCanvas = useMemo(
    () =>
      new Set(
        nodes
          .filter((n) => n.type === "offer")
          .map((n) => (n.data as unknown as OfferNodeData).checkoutId),
      ),
    [nodes],
  );
  const q = search.toLowerCase();
  const palette = offers.filter(
    (o) =>
      !onCanvas.has(o.id) &&
      (o.productName.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)),
  );

  const mounted = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // refs vivos pros atalhos (evita re-bind do listener a cada mudança)
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  // histórico desfazer/refazer (grafos serializados) + clipboard de blocos
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const committedRef = useRef<string | null>(null);
  const skipRecord = useRef(false);
  const clipboardRef = useRef<
    { type: string; position: { x: number; y: number }; data: Record<string, unknown> }[] | null
  >(null);
  // Autosave debounced. Se o funil está ATIVO, salvar = reaplicar os links
  // (conectar oferta→link muda o upsell/backredirect na hora). Senão só grava.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const graph = serialize(nodes, edges);
      if (isActive) {
        activateFunnel(funnelId, graph).then((r) => {
          if (r.ok)
            setStatus(
              `✓ aplicado ao vivo — ${r.offersUpdated ?? 0} oferta(s)` +
                (r.warnings && r.warnings.length ? ` ⚠ ${r.warnings.join(" ")}` : ""),
            );
          else setStatus(`✗ ${r.error}`);
        });
      } else {
        saveFunnelGraph(funnelId, graph).then((r) => {
          if (r.ok) setStatus("salvo automaticamente");
        });
      }
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, funnelId, isActive]);

  // Histórico: snapshot debounced do grafo serializado (ignora flags
  // transitórias de seleção/drag). Vira a base do desfazer/refazer.
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = JSON.stringify(serialize(nodesRef.current, edgesRef.current));
      if (committedRef.current === null) {
        committedRef.current = cur;
        return;
      }
      if (skipRecord.current) {
        skipRecord.current = false;
        committedRef.current = cur;
        return;
      }
      if (cur === committedRef.current) return;
      history.current.past.push(committedRef.current);
      if (history.current.past.length > 60) history.current.past.shift();
      history.current.future = [];
      committedRef.current = cur;
    }, 500);
    return () => clearTimeout(t);
  }, [nodes, edges]);

  const applySnap = useCallback(
    (json: string) => {
      let g: { nodes?: unknown; edges?: unknown };
      try {
        g = JSON.parse(json);
      } catch {
        return;
      }
      skipRecord.current = true;
      setNodes(hydrateNodes(g.nodes, offers, metricsById));
      setEdges(hydrateEdges(g.edges));
    },
    [offers, metricsById, setNodes, setEdges],
  );
  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (prev === undefined) {
      setStatus("Nada pra desfazer.");
      return;
    }
    if (committedRef.current !== null) history.current.future.push(committedRef.current);
    committedRef.current = prev;
    applySnap(prev);
    setStatus("Desfeito (⌘/Ctrl+Z).");
  }, [applySnap]);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (next === undefined) {
      setStatus("Nada pra refazer.");
      return;
    }
    if (committedRef.current !== null) history.current.past.push(committedRef.current);
    committedRef.current = next;
    applySnap(next);
    setStatus("Refeito.");
  }, [applySnap]);
  const duplicateSel = useCallback(() => {
    setNodes((nds) => {
      const sel = nds.filter((n) => n.selected && (n.type === "url" || n.type === "note"));
      if (sel.length === 0) return nds;
      const copies: Node[] = sel.map((n) => ({
        ...n,
        id: `${n.type}_${Date.now()}_${rid()}`,
        position: { x: n.position.x + 28, y: n.position.y + 28 },
        selected: false,
        data: { ...n.data },
      }));
      return [...nds.map((n) => ({ ...n, selected: false })), ...copies];
    });
  }, [setNodes]);
  const copySel = useCallback(() => {
    const sel = nodesRef.current.filter((n) => n.selected && (n.type === "url" || n.type === "note"));
    if (sel.length === 0) return;
    const payload = sel.map((n) => ({
      type: n.type as string,
      position: n.position,
      data: n.data as Record<string, unknown>,
    }));
    clipboardRef.current = payload;
    try {
      localStorage.setItem("tp_funnel_clip", JSON.stringify(payload));
    } catch {}
    setStatus(`${sel.length} bloco(s) copiado(s) — ⌘/Ctrl+V pra colar.`);
  }, []);
  const pasteClip = useCallback(() => {
    let payload = clipboardRef.current;
    if (!payload) {
      try {
        payload = JSON.parse(localStorage.getItem("tp_funnel_clip") || "null");
      } catch {
        payload = null;
      }
    }
    if (!payload || !Array.isArray(payload) || payload.length === 0) return;
    const p = payload;
    setNodes((nds) => {
      const copies: Node[] = p.map((it, i) => ({
        id: `${it.type}_${Date.now()}_${i}_${rid()}`,
        type: it.type,
        position: { x: (it.position?.x ?? 100) + 36, y: (it.position?.y ?? 100) + 36 },
        data: { ...it.data, locked: false },
        selected: false,
      }));
      return [...nds.map((n) => ({ ...n, selected: false })), ...copies];
    });
    setStatus(`${p.length} bloco(s) colado(s).`);
  }, [setNodes]);

  // Atalhos de teclado (só fora de inputs — não sequestra edição de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "d") {
        e.preventDefault();
        duplicateSel();
      } else if (k === "c") {
        copySel();
      } else if (k === "v") {
        pasteClip();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicateSel, copySel, pasteClip]);

  const addOffer = useCallback(
    (o: FunnelOffer) => {
      setNodes((nds) => {
        const id = `offer_${o.id}`;
        if (nds.some((n) => n.id === id)) return nds;
        const offset = nds.length * 40;
        const m = metricsById?.get(o.id);
        return [
          ...nds,
          {
            id,
            type: "offer",
            position: { x: 120 + (offset % 360), y: 100 + offset },
            data: {
              checkoutId: o.id,
              slug: o.slug,
              productName: o.productName,
              productImage: o.productImage,
              price: o.priceCents,
              checkoutType: o.checkoutType,
              label: "",
              sales: m?.sales,
              revenueCents: m?.revenueCents,
              heat: m?.heat,
              ab: o.ab,
              upsellAcceptance: o.upsellAcceptance,
              bumps: o.bumps,
            } satisfies OfferNodeData,
          },
        ];
      });
    },
    [setNodes, metricsById],
  );

  const addUrlNode = useCallback(() => {
    // nó de link VAZIO — o seller nomeia + digita a URL e conecta a alça
    // verde (upsell) ou laranja (back-redirect) de uma oferta até ele.
    setNodes((nds) => [
      ...nds,
      {
        id: `url_${Date.now()}`,
        type: "url",
        position: { x: 520, y: 140 + nds.length * 30 },
        data: { url: "", label: "" },
      },
    ]);
  }, [setNodes]);

  const addNote = useCallback(() => {
    setNodes((nds) => [
      ...nds,
      {
        id: `note_${Date.now()}`,
        type: "note",
        position: { x: 200, y: 80 + nds.length * 24 },
        data: { text: "", color: "amber" },
      },
    ]);
  }, [setNodes]);

  // Reorganiza os nós em camadas e dá um fitView suave.
  const organize = useCallback(() => {
    setNodes((nds) => autoLayout(nds, edges));
    setStatus("Mapa organizado.");
    window.setTimeout(() => fitView({ duration: 400, padding: 0.2 }), 60);
  }, [edges, setNodes, fitView]);

  // Modelo "escada de upsell": liga as ofertas do canvas em sequência (de cima
  // pra baixo) por upsell — A → B → C. Substitui os upsells atuais (mantém os
  // back-redirect). Reversível com ⌘Z.
  const wireLadder = useCallback(() => {
    const offerNodes = nodesRef.current
      .filter((n) => n.type === "offer")
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    if (offerNodes.length < 2) {
      setStatus("Adicione 2+ ofertas no mapa pra montar a escada.");
      return;
    }
    setEdges((eds) => {
      const kept = eds.filter((e) => eKind(e) !== "upsell"); // mantém back-redirects
      const ladder: Edge[] = [];
      for (let i = 0; i < offerNodes.length - 1; i++) {
        const src = offerNodes[i].id;
        const tgt = offerNodes[i + 1].id;
        ladder.push({
          id: `e_${src}_up_${rid()}`,
          source: src,
          target: tgt,
          sourceHandle: "upsell",
          targetHandle: "in",
          data: { kind: "upsell", weight: 100 },
          ...edgeStyle("upsell"),
        });
      }
      return [...kept, ...ladder];
    });
    setStatus(`Escada de upsell montada (${offerNodes.length} ofertas em sequência).`);
  }, [setEdges]);

  const onConnect = useCallback(
    (conn: Connection) => {
      const kind: "upsell" | "backredirect" =
        conn.sourceHandle === "backredirect" ? "backredirect" : "upsell";
      if (conn.source === conn.target) {
        setStatus("Não dá pra conectar uma oferta nela mesma.");
        return;
      }
      const srcNode = nodes.find((n) => n.id === conn.source);
      if (srcNode?.type !== "offer") {
        setStatus("A origem da conexão precisa ser uma OFERTA.");
        return;
      }
      const mkEdge = (weight: number | undefined): Edge => ({
        id: `e_${conn.source}_${kind === "backredirect" ? "back" : "up"}_${rid()}`,
        source: conn.source!,
        target: conn.target!,
        sourceHandle: conn.sourceHandle ?? kind,
        targetHandle: conn.targetHandle ?? "in",
        data: { kind, weight },
        ...edgeStyle(kind),
      });
      setEdges((eds) => {
        if (kind === "backredirect") {
          // back-redirect é único por oferta → substitui o existente
          const cleaned = eds.filter((e) => !(e.source === conn.source && eKind(e) === "backredirect"));
          return addEdge(mkEdge(undefined), cleaned);
        }
        // upsell: permite até 2 saídas (teste A/B)
        const ups = eds.filter((e) => e.source === conn.source && eKind(e) === "upsell");
        if (ups.some((e) => e.target === conn.target)) return eds; // já existe
        if (ups.length === 0) {
          return addEdge(mkEdge(100), eds);
        }
        if (ups.length === 1) {
          // vira teste A/B 50/50: rebaixa a existente e adiciona a nova
          const base = eds.map((e) =>
            e.id === ups[0].id ? { ...e, data: { ...(e.data as object), weight: 50 } } : e,
          );
          return addEdge(mkEdge(50), base);
        }
        // já tem 2 → substitui a última (mantém A/B em 2 variantes)
        const sorted = [...ups].sort((a, b) => a.id.localeCompare(b.id));
        const last = sorted[sorted.length - 1];
        const keepW = Number.isFinite(eWeight(last)) ? eWeight(last) : 50;
        return addEdge(mkEdge(keepW), eds.filter((e) => e.id !== last.id));
      });
      const upsBefore = edges.filter((e) => e.source === conn.source && eKind(e) === "upsell");
      if (kind === "upsell" && upsBefore.length === 1 && !upsBefore.some((e) => e.target === conn.target)) {
        setStatus("Teste A/B criado (50/50). 2× clique numa seta pra ajustar o %.");
      } else if (kind !== "backredirect") {
        setStatus(null);
      }
    },
    [nodes, edges, setEdges],
  );

  // Arrastar um nó de LINK pra cima de uma oferta → o link é "absorvido" pra
  // dentro dela (vira o destino interno). Conexões que iam pro link passam a
  // apontar pra oferta que o engoliu.
  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      if (node.type !== "url") return;
      const offerHit = getIntersectingNodes(node).find((n) => n.type === "offer");
      if (!offerHit) return;
      const url = String((node.data as Record<string, unknown>)?.url ?? "");
      const lbl = String((node.data as Record<string, unknown>)?.label ?? "");
      const offName =
        String((offerHit.data as Record<string, unknown>)?.label || "") ||
        String((offerHit.data as Record<string, unknown>)?.productName || "oferta");
      setNodes((nds) =>
        nds
          .filter((n) => n.id !== node.id)
          .map((n) =>
            n.id === offerHit.id
              ? { ...n, data: { ...n.data, embeddedUrl: url, embeddedLabel: lbl } }
              : n,
          ),
      );
      setEdges((eds) =>
        eds.map((e) =>
          e.target === node.id ? { ...e, target: offerHit.id, targetHandle: "in" } : e,
        ),
      );
      setStatus(`Link embutido em "${offName}" — quem conectar nela vai pra esse link.`);
    },
    [getIntersectingNodes, setNodes, setEdges],
  );

  // Duplo-clique numa conexão:
  //  - se faz parte de um teste A/B (origem tem 2+ upsells) → ajusta o PESO %;
  //  - senão → nomeia a conexão (ex: "oferta principal").
  const onEdgeDoubleClick = useCallback(
    (_e: unknown, edge: Edge) => {
      const kind = eKind(edge);
      const siblings = edges.filter((e) => e.source === edge.source && eKind(e) === "upsell");
      const isAB = kind === "upsell" && siblings.length >= 2;
      if (isAB) {
        const cur = Number.isFinite(eWeight(edge)) ? eWeight(edge) : Math.round(100 / siblings.length);
        const v = window.prompt("Peso desta variante no teste A/B (0–100%):", String(cur));
        if (v === null) return;
        const w = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
        setEdges((eds) => {
          if (siblings.length === 2) {
            const other = siblings.find((s) => s.id !== edge.id);
            return eds.map((e) => {
              if (e.id === edge.id) return { ...e, data: { ...(e.data as object), weight: w } };
              if (other && e.id === other.id) return { ...e, data: { ...(e.data as object), weight: 100 - w } };
              return e;
            });
          }
          return eds.map((e) => (e.id === edge.id ? { ...e, data: { ...(e.data as object), weight: w } } : e));
        });
        return;
      }
      const cur = typeof (edge.data as Record<string, unknown> | undefined)?.note === "string"
        ? ((edge.data as Record<string, unknown>).note as string)
        : "";
      const v = window.prompt("Nome da conexão (vazio = padrão):", cur);
      if (v === null) return;
      const note = v.trim();
      setEdges((eds) =>
        eds.map((x) =>
          x.id === edge.id
            ? {
                ...x,
                data: { ...(x.data as object), note: note || undefined },
                label: note || edgeKindLabel(kind),
              }
            : x,
        ),
      );
    },
    [edges, setEdges],
  );

  const clearAll = useCallback(() => {
    if (!window.confirm("Limpar todo o canvas? (não desfaz links já ativados)")) return;
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  // Percorre as cadeias de upsell a partir das ofertas "raiz" (sem upsell de
  // entrada) e monta a jornada que o cliente veria. Cap por segurança.
  function buildJourneys(): JourneyData {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const nm = (nid: string): string => {
      const dd = nodeById.get(nid)?.data as Record<string, unknown> | undefined;
      const label = typeof dd?.label === "string" ? dd.label.trim() : "";
      if (label) return label;
      const t = nodeById.get(nid)?.type;
      if (t === "offer") return String(dd?.productName ?? "Oferta");
      if (t === "url") return String(dd?.embeddedLabel || dd?.url || "Link");
      return "—";
    };
    const upsellOut = new Map<string, string>(); // source -> target (upsell)
    const backOut = new Map<string, string>();
    const upsellTargets = new Set<string>();
    for (const e of edges) {
      const kind = (e.data as Record<string, unknown> | undefined)?.kind ?? "upsell";
      if (kind === "backredirect") {
        if (!backOut.has(e.source)) backOut.set(e.source, e.target);
      } else {
        if (!upsellOut.has(e.source)) upsellOut.set(e.source, e.target);
        upsellTargets.add(e.target);
      }
    }
    const offerNodes = nodes.filter((n) => n.type === "offer");
    const roots = offerNodes.filter((n) => !upsellTargets.has(n.id));
    const start = roots.length > 0 ? roots : offerNodes;
    const journeys = start.map((root) => {
      const steps: JourneyStep[] = [];
      const seen = new Set<string>();
      let cur: string | undefined = root.id;
      let guard = 0;
      while (cur && !seen.has(cur) && guard++ < 30) {
        seen.add(cur);
        const node = nodeById.get(cur);
        const dd = node?.data as Record<string, unknown> | undefined;
        steps.push({
          name: nm(cur),
          isOffer: node?.type === "offer",
          price: node?.type === "offer" ? (dd?.price as number | undefined) : undefined,
          sales: node?.type === "offer" ? (dd?.sales as number | undefined) : undefined,
          revenueCents: node?.type === "offer" ? (dd?.revenueCents as number | undefined) : undefined,
          back: backOut.has(cur) ? nm(backOut.get(cur)!) : null,
        });
        const next = upsellOut.get(cur);
        if (!next) break;
        // se o próximo NÃO é oferta (é link), registra como passo final e para
        if (nodeById.get(next)?.type !== "offer") {
          steps.push({ name: nm(next), isOffer: false, back: null });
          break;
        }
        cur = next;
      }
      return { rootName: nm(root.id), steps };
    });
    return { journeys };
  }

  function buildPreview(): PreviewData {
    const offerById = new Map(offers.map((o) => [o.id, o]));
    const nodeOffer = (nodeId: string): FunnelOffer | null => {
      const n = nodes.find((x) => x.id === nodeId);
      const cid = (n?.data as Record<string, unknown> | undefined)?.checkoutId as string | undefined;
      return cid ? offerById.get(cid) ?? null : null;
    };
    const nodeName = (nodeId: string): string => {
      const n = nodes.find((x) => x.id === nodeId);
      const dd = n?.data as Record<string, unknown> | undefined;
      const label = typeof dd?.label === "string" ? dd.label.trim() : "";
      if (label) return label;
      if (n?.type === "offer") return String(dd?.productName ?? "Oferta");
      return String(dd?.url ?? "");
    };
    const nodeUrlVal = (nodeId: string): string | null => {
      const n = nodes.find((x) => x.id === nodeId);
      const u = (n?.data as Record<string, unknown> | undefined)?.url;
      return typeof u === "string" ? u : null;
    };
    const lines: PreviewLine[] = [];
    const warns: string[] = [];
    for (const e of edges) {
      const src = nodeOffer(e.source);
      if (!src) continue;
      const kind =
        ((e.data as Record<string, unknown> | undefined)?.kind ?? "upsell") === "backredirect"
          ? "backredirect"
          : "upsell";
      const tgtOffer = nodeOffer(e.target);
      const tgtUrl = nodeUrlVal(e.target);
      const tgtNode = nodes.find((x) => x.id === e.target);
      const tgtData = tgtNode?.data as Record<string, unknown> | undefined;
      const emb = typeof tgtData?.embeddedUrl === "string" ? tgtData.embeddedUrl.trim() : "";
      let targetLabel = "";
      if (tgtOffer && emb && /^https?:\/\//i.test(emb)) {
        // oferta-alvo com link interno → vai pra ele
        const embLbl = typeof tgtData?.embeddedLabel === "string" ? tgtData.embeddedLabel.trim() : "";
        targetLabel = embLbl || emb;
      } else if (tgtOffer) {
        targetLabel = nodeName(e.target);
        if (!sellerDomain)
          warns.push(`Conecte um domínio pra aplicar upsell entre ofertas.`);
      } else if (tgtUrl) {
        targetLabel = nodeName(e.target);
      } else {
        warns.push(`"${nodeName(e.source)}" aponta pra um link vazio — vai ser ignorado.`);
        continue;
      }
      lines.push({ kind, source: nodeName(e.source), target: targetLabel });
    }
    const srcs = new Set(edges.map((e) => e.source));
    const orphans = nodes.filter((n) => n.type === "offer" && !srcs.has(n.id)).length;
    if (orphans > 0)
      warns.push(
        `${orphans} oferta(s) no mapa sem upsell/back — o cliente não é redirecionado depois delas.`,
      );
    return { lines, warnings: [...new Set(warns)] };
  }

  function confirmActivate() {
    const graph = serialize(nodes, edges);
    startApply(async () => {
      const r = await activateFunnel(funnelId, graph);
      setPreview(null);
      if (r.ok) {
        setIsActive(true);
        setStatus(
          `✓ Funil ATIVO — ${r.offersUpdated ?? 0} oferta(s) atualizada(s).` +
            (r.warnings && r.warnings.length ? ` ⚠ ${r.warnings.join(" ")}` : ""),
        );
      } else setStatus(`✗ ${r.error}`);
    });
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0c]">
      {/* TOP BAR */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-zinc-950/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] transition"
          >
            <ArrowLeft className="size-3.5" /> Sair
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="truncate text-sm font-semibold text-white">{name}</h1>
            {isActive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                <CheckCircle2 className="size-3" /> Ativo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                <Circle className="size-3" /> Inativo
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className="hidden sm:block max-w-[320px] truncate text-[11px] text-zinc-500">
              {status}
            </span>
          )}
          {orphanCount > 0 && (
            <span
              className="hidden items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-1 text-[10px] font-medium text-amber-200 md:inline-flex"
              title="Ofertas no mapa sem upsell/back configurado"
            >
              <AlertTriangle className="size-3" /> {orphanCount} sem saída
            </span>
          )}
          <div className="flex items-center rounded-full border border-white/[0.1] bg-white/[0.02]">
            <button
              onClick={undo}
              title="Desfazer (⌘/Ctrl+Z)"
              className="rounded-l-full px-2 py-1.5 text-zinc-300 hover:bg-white/[0.06]"
            >
              <Undo2 className="size-3.5" />
            </button>
            <span className="h-4 w-px bg-white/10" />
            <button
              onClick={redo}
              title="Refazer (⌘/Ctrl+Shift+Z)"
              className="rounded-r-full px-2 py-1.5 text-zinc-300 hover:bg-white/[0.06]"
            >
              <Redo2 className="size-3.5" />
            </button>
          </div>
          <button
            onClick={() => setJourney(buildJourneys())}
            title="Simula a jornada que o cliente percorre (upsell → upsell)"
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            <Play className="size-3.5" /> Simular
          </button>
          <button
            onClick={wireLadder}
            title="Modelo: liga as ofertas do mapa em escada de upsell (A→B→C)"
            className="hidden items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] lg:inline-flex"
          >
            <Workflow className="size-3.5" /> Escada
          </button>
          <button
            onClick={organize}
            title="Organiza os blocos em camadas (esquerda → direita)"
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            <LayoutGrid className="size-3.5" /> Organizar
          </button>
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            <Trash2 className="size-3.5" /> Limpar
          </button>
          <button
            onClick={() => setPreview(buildPreview())}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-semibold text-black hover:bg-cyan-300 shadow-lg shadow-cyan-400/20"
          >
            <Power className="size-3.5" /> {isActive ? "Reaplicar" : "Ativar funil"}
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-1 min-h-0">
        {/* PALETTE */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-white/[0.08] bg-zinc-950/60">
          <div className="border-b border-white/[0.06] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Suas ofertas
            </p>
            <p className="mt-1 text-[10px] leading-snug text-zinc-500">
              Clique numa oferta pra adicionar. Arraste a bolinha{" "}
              <span style={{ color: UPSELL }}>verde</span> (upsell) ou{" "}
              <span style={{ color: BACK }}>laranja</span> (back) até{" "}
              <strong className="text-zinc-300">outra oferta</strong> ou um{" "}
              <span className="text-orange-300">link</span>. Dica: arraste um{" "}
              <span className="text-orange-300">link</span> pra{" "}
              <strong className="text-zinc-300">dentro de uma oferta</strong> — aí
              tudo que conectar nela vai pra esse link.
            </p>
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5">
              <Search className="size-3.5 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar oferta…"
                className="w-full bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {palette.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-zinc-600">
                {offers.length === 0
                  ? "Você não tem ofertas (checkouts) ativas ainda."
                  : "Todas no mapa (ou nada na busca)."}
              </p>
            ) : (
              palette.map((o) => (
                <button
                  key={o.id}
                  onClick={() => addOffer(o)}
                  title={offerLabel(o)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-left hover:border-cyan-400/40 hover:bg-white/[0.04] transition"
                >
                  {o.productImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.productImage} alt="" className="size-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] shrink-0">
                      <Tag className="size-4 text-zinc-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white">{o.productName}</p>
                    <p className="text-[10px] text-zinc-500">
                      {formatBRL(o.priceCents)} · {typeLabel(o.checkoutType)}
                    </p>
                  </div>
                  <Plus className="size-4 text-zinc-500 shrink-0" />
                </button>
              ))
            )}
          </div>
          <div className="space-y-2 border-t border-white/[0.06] p-3">
            <button
              onClick={addUrlNode}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-400/30 bg-orange-400/[0.06] px-3 py-2 text-xs font-medium text-orange-200 hover:bg-orange-400/[0.12]"
            >
              <Globe className="size-3.5" /> Adicionar link (upsell/back)
            </button>
            <button
              onClick={addNote}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-300/[0.12]"
            >
              <StickyNote className="size-3.5" /> Adicionar anotação
            </button>
          </div>
        </aside>

        {/* CANVAS */}
        <div className="relative flex-1">
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-5 text-center">
                <Tag className="mx-auto size-7 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-400">
                  Clique numa oferta na barra lateral pra começar
                </p>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onEdgeDoubleClick={onEdgeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            snapToGrid
            snapGrid={[16, 16]}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background variant={BackgroundVariant.Dots} color="#3f3f46" gap={22} size={1.5} />
            <Panel position="bottom-left">
              <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-zinc-950/85 px-2.5 py-2 text-[10px] text-zinc-400 backdrop-blur">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: UPSELL }} /> upsell (após pagar)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: BACK }} /> back-redirect (saiu sem pagar)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-red-500" /> loop (corrija antes de ativar)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold" style={{ color: UPSELL }}>A/B</span> 2 upsells na mesma oferta = teste
                </span>
                <span className="flex items-center gap-1.5 text-zinc-500">
                  2× clique na seta = nomear/peso · ⌘/Ctrl+D = duplicar
                </span>
              </div>
            </Panel>
            <Controls className="!bg-zinc-900 !border-white/10 !rounded-xl overflow-hidden" />
            <MiniMap
              pannable
              zoomable
              className="!bg-zinc-900 !border !border-white/10 !rounded-xl"
              maskColor="rgba(0,0,0,0.6)"
              nodeColor={(n) =>
                n.type === "url"
                  ? BACK
                  : n.type === "note"
                    ? NOTE_COLORS[(n.data as NoteNodeData)?.color]?.dot ?? "#fcd34d"
                    : "#52525b"
              }
            />
          </ReactFlow>
        </div>
      </div>

      {preview && (
        <PreviewModal
          data={preview}
          isApplying={isApplying}
          isActive={isActive}
          onCancel={() => setPreview(null)}
          onConfirm={confirmActivate}
        />
      )}
      {journey && <JourneyModal data={journey} onClose={() => setJourney(null)} />}
    </div>
  );
}

/* --------------------------- journey simulator -------------------------- */

type JourneyStep = {
  name: string;
  isOffer: boolean;
  price?: number;
  sales?: number;
  revenueCents?: number;
  back: string | null;
};
type JourneyData = { journeys: { rootName: string; steps: JourneyStep[] }[] };

function JourneyModal({ data, onClose }: { data: JourneyData; onClose: () => void }) {
  const total = (steps: JourneyStep[]) =>
    steps.reduce((s, st) => s + (st.isOffer ? st.price ?? 0 : 0), 0);
  const realized = (steps: JourneyStep[]) =>
    steps.reduce((s, st) => s + (st.revenueCents ?? 0), 0);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <Play className="size-4 text-cyan-300" /> Simular jornada
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              O caminho que o cliente percorre seguindo os upsells. As saídas
              (back-redirect) aparecem em laranja.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06]">
            <X className="size-4" />
          </button>
        </div>
        {data.journeys.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            Adicione ofertas e conexões pra simular.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {data.journeys.map((j, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Jornada {data.journeys.length > 1 ? i + 1 : ""} — começa em “{j.rootName}”
                </p>
                <div className="space-y-1.5">
                  {j.steps.map((st, k) => (
                    <div key={k}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] text-zinc-400">
                          {k + 1}
                        </span>
                        {!st.isOffer ? (
                          <Globe className="size-3.5 shrink-0 text-orange-300" />
                        ) : (
                          <Tag className="size-3.5 shrink-0 text-cyan-300" />
                        )}
                        <span className="truncate font-medium text-white">{st.name}</span>
                        {st.isOffer && typeof st.price === "number" && (
                          <span className="ml-auto shrink-0 text-xs text-zinc-400">{formatBRL(st.price)}</span>
                        )}
                      </div>
                      {st.isOffer && typeof st.sales === "number" && (
                        <p className="ml-7 mt-0.5 text-[10px] text-cyan-300/70">
                          {st.sales} venda{st.sales !== 1 ? "s" : ""} · {formatBRL(st.revenueCents ?? 0)} recebido
                        </p>
                      )}
                      {st.back && (
                        <p className="ml-7 mt-0.5 flex items-center gap-1 text-[10px] text-orange-300/80">
                          <ArrowDownRight className="size-3" /> saída → {st.back}
                        </p>
                      )}
                      {k < j.steps.length - 1 && (
                        <div className="ml-2.5 flex items-center gap-1 py-0.5 text-[10px] text-cyan-400/70">
                          <ChevronRight className="size-3" /> upsell
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {total(j.steps) > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2 text-[11px] text-zinc-400">
                    <span>
                      Ticket máximo:{" "}
                      <span className="font-semibold text-cyan-300">{formatBRL(total(j.steps))}</span>
                    </span>
                    {realized(j.steps) > 0 && (
                      <span>
                        Receita real da cadeia:{" "}
                        <span className="font-semibold text-cyan-300">{formatBRL(realized(j.steps))}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- preview modal ----------------------------- */

type PreviewLine = { kind: "upsell" | "backredirect"; source: string; target: string };
type PreviewData = { lines: PreviewLine[]; warnings: string[] };

function PreviewModal({
  data,
  isApplying,
  isActive,
  onCancel,
  onConfirm,
}: {
  data: PreviewData;
  isApplying: boolean;
  isActive: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">
              {isActive ? "Reaplicar funil" : "Ativar funil"}
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Marca este como o funil ATIVO (desativa outro ativo) e grava os
              links de upsell / back-redirect nas ofertas abaixo.
            </p>
          </div>
          <button onClick={onCancel} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06]">
            <X className="size-4" />
          </button>
        </div>
        {data.lines.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            Nenhuma conexão. Conecte ofertas arrastando as bolinhas.
          </p>
        ) : (
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {data.lines.map((l, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm"
              >
                {l.kind === "upsell" ? (
                  <Link2 className="size-4 shrink-0" style={{ color: UPSELL }} />
                ) : (
                  <ArrowDownRight className="size-4 shrink-0" style={{ color: BACK }} />
                )}
                <span className="truncate font-medium text-white">{l.source}</span>
                <span
                  className="shrink-0 text-[10px] font-semibold uppercase"
                  style={{ color: l.kind === "upsell" ? UPSELL : BACK }}
                >
                  {l.kind === "upsell" ? "upsell →" : "back →"}
                </span>
                <span className="flex-1 truncate text-zinc-300">{l.target}</span>
              </div>
            ))}
          </div>
        )}
        {data.warnings.length > 0 && (
          <div className="mt-3 space-y-1 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200">
            {data.warnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isApplying || data.lines.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {isApplying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {isActive ? "Reaplicar" : "Confirmar e ativar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FunnelBoard(props: FunnelLoaderProps) {
  return (
    <ReactFlowProvider>
      <Board {...props} />
    </ReactFlowProvider>
  );
}
