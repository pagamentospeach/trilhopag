"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  Plus,
  MessageSquare,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { createSaleBot, deleteSaleBot } from "./actions";
import { DeleteRowButton } from "@/components/dashboard/delete-row-button";

type BotItem = {
  id: string;
  type: "discord" | "telegram";
  name: string;
  active: boolean;
  totalSent: number;
  totalFailed: number;
  lastSentAt: string | null;
  lastError: string | null;
  hasCredentials: boolean;
};

const TYPE_META: Record<
  "discord" | "telegram",
  { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  discord: { label: "Discord", color: "#5865F2", Icon: MessageSquare },
  telegram: { label: "Telegram", color: "#229ED9", Icon: Send },
};

export function BotsClient({
  bots,
  basePath = "/dashboard/bots",
}: {
  bots: BotItem[];
  /** Pra onde o modal volta ao fechar. Permite reusar a lista de bots dentro
   *  da aba Produtos (/dashboard/produtos) apos a fusao Produtos/Bots. */
  basePath?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [modalType, setModalType] = useState<"discord" | "telegram" | null>(null);

  // Sincroniza modal com query param (?new=discord ou ?new=telegram)
  useEffect(() => {
    const n = sp.get("new");
    if (n === "discord" || n === "telegram") {
      setModalType(n);
    }
  }, [sp]);

  return (
    <div className="space-y-4">
      {/* 07/08/2026 (davi): "Tira esses dois botoes de baixo! deixa somente os
          de cima" — aqui existiam dois pills "Discord" e "Telegram" nesta mesma
          linha, à direita do contador. Eram duplicata: faziam exatamente o que
          os botões "Bot Telegram" / "Bot Discord" do topo da página de Produtos
          já fazem (abrir o modal de criar bot), e ainda por cima só apareciam
          depois que você já tinha um bot — ou seja, quem mais precisava deles
          nunca os via. Sobrou o contador.

          Nada de criação se perdeu: os botões do topo navegam pra
          `?new=telegram` / `?new=discord` e o useEffect acima abre o modal a
          partir do query param. `setModalType` continua sendo chamado por lá. */}
      {bots.length > 0 && (
        <p className="text-xs text-zinc-500">
          {bots.length} bot{bots.length !== 1 ? "s" : ""} configurado
          {bots.length !== 1 ? "s" : ""}
        </p>
      )}

      {bots.length > 0 && (
        <div className="space-y-3">
          {bots.map((b) => {
            const meta = TYPE_META[b.type];
            const Icon = meta.Icon;
            return (
              <div
                key={b.id}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-white/[0.16] transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <Link
                    href={`/dashboard/bots/${b.id}`}
                    className="flex items-start gap-4 min-w-0 flex-1"
                  >
                    <div
                      className="inline-flex size-12 items-center justify-center rounded-xl shrink-0"
                      style={{ background: `${meta.color}20`, color: meta.color }}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-semibold text-white truncate">
                          {b.name}
                        </p>
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                          {meta.label}
                        </span>
                        {b.active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                            <CheckCircle2 className="size-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                            <XCircle className="size-3" /> Pausado
                          </span>
                        )}
                        {!b.hasCredentials && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-medium text-yellow-300">
                            <AlertCircle className="size-3" /> Sem credenciais
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-[11px] text-zinc-500">
                        <span>
                          ✓ <strong className="text-cyan-300">{b.totalSent}</strong>{" "}
                          enviadas
                        </span>
                        {b.totalFailed > 0 && (
                          <span>
                            ✗ <strong className="text-red-300">{b.totalFailed}</strong>{" "}
                            falhas
                          </span>
                        )}
                        {b.lastSentAt && (
                          <span>
                            Última: {new Date(b.lastSentAt).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                      {b.lastError && (
                        <p className="mt-2 text-[11px] text-red-300 truncate">
                          ⚠ {b.lastError}
                        </p>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-start gap-2 shrink-0">
                    <Link
                      href={`/dashboard/bots/${b.id}`}
                      title="Abrir / editar bot"
                      className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white transition"
                    >
                      <ExternalLink className="size-4" />
                    </Link>
                    <DeleteRowButton
                      onDelete={deleteSaleBot.bind(null, b.id)}
                      confirmMessage={`Apagar bot "${b.name}"?\n\nIsso vai parar de enviar notificações pra esse canal.`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalType && (
        <NewBotModal
          type={modalType}
          onClose={() => {
            setModalType(null);
            router.replace(basePath);
          }}
          onCreated={(id) => {
            setModalType(null);
            // Força refresh + navegação pro editor do bot
            router.refresh();
            window.location.href = `/dashboard/bots/${id}`;
          }}
        />
      )}
    </div>
  );
}

function NewBotModal({
  type,
  onClose,
  onCreated,
}: {
  type: "discord" | "telegram";
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const meta = TYPE_META[type];
  const Icon = meta.Icon;

  // ESC pra fechar + trava scroll do body enquanto aberto
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Dê um nome pro bot");
    startTransition(async () => {
      const r = await createSaleBot({ type, name: name.trim() });
      if (r.ok) onCreated(r.id);
      else setError(r.error);
    });
  }

  // RENDER VIA PORTAL (20/07/2026, davi: "esse pop up ta super feio na hora
  // de criar um novo bot, arruma ele, deixa no meio da tela e etc").
  // Ancestrais com `animation`/`transform` (dashboard tem várias) criam
  // containing block e prendem `position: fixed` dentro do container ancestral
  // — modal aparece desalinhado (foto do david). Portal para document.body
  // tira o modal da árvore DOM interna → fixed volta a ser relativo ao viewport.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-bp-in-fade"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-gradient-to-br from-zinc-950 via-zinc-950 to-black shadow-2xl animate-bp-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow decorativo top-right com a cor do provider */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full blur-3xl opacity-25"
          style={{ background: meta.color }}
        />

        {/* Header */}
        <div className="relative flex items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div
              className="inline-flex size-11 items-center justify-center rounded-xl shrink-0 ring-1 ring-inset"
              style={{
                background: `${meta.color}20`,
                color: meta.color,
                borderColor: `${meta.color}40`,
              }}
            >
              <Icon className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">
                Novo bot {meta.label}
              </h3>
              <p className="mt-1 text-[11px] text-zinc-500 leading-snug">
                Dê um nome interno — só pra você identificar. Depois você
                conecta o token e escolhe o que notificar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200 transition"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="relative px-6 pb-2">
          <label
            className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2"
            htmlFor="bot-name-input"
          >
            Nome do bot
          </label>
          <input
            id="bot-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={`Ex: Vendas ${meta.label}`}
            autoFocus
            maxLength={60}
            className="w-full rounded-xl border border-white/[0.1] bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition"
          />
          <p className="mt-1.5 text-[10px] text-zinc-600">
            {name.length}/60
          </p>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between gap-2 border-t border-white/[0.06] bg-black/30 px-6 py-4 mt-4">
          <p className="hidden text-[10px] text-zinc-500 sm:block">
            <kbd className="rounded bg-white/[0.06] px-1 py-0.5 text-[9px] font-mono">
              Esc
            </kbd>{" "}
            pra cancelar
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/[0.1] bg-white/[0.02] px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.06] transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-bold text-black hover:bg-cyan-300 hover:shadow-[0_0_20px_rgba(34, 211, 238,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none transition"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Criar bot
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
