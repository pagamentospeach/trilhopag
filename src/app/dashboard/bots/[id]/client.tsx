"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Save,
  Loader2,
  Trash2,
  Send,
  MessageSquare,
  ExternalLink,
  Zap,
  Workflow,
  Terminal,
  BarChart3,
} from "lucide-react";
import {
  updateSaleBot,
  deleteSaleBot,
  registerTelegramWebhook,
} from "../actions";

/**
 * 21/07/2026 (davi): tela do bot enxuta. Toda a config de "bot notificador
 * de venda" (template, parseMode, imageUrl, gatilhos) foi removida — feature
 * morta (0.7% cobertura, 66% falha) e redundante com /dashboard/vendas +
 * push web. Aqui sobra apenas: credenciais + link pro funil de conversa.
 */

type Bot = {
  id: string;
  type: "discord" | "telegram";
  name: string;
  botToken: string | null;
  chatId: string | null;
  active: boolean;
};

export function BotEditor({ bot: initial }: { bot: Bot }) {
  const router = useRouter();
  const [b, setB] = useState<Bot>(initial);
  const [isPending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function update<K extends keyof Bot>(k: K, v: Bot[K]) {
    setB((s) => ({ ...s, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      const r = await updateSaleBot({
        id: b.id,
        name: b.name,
        botToken: b.botToken,
        chatId: b.chatId,
        active: b.active,
      });
      if (r.ok) {
        setSavedMsg(r.webhookWarning ?? "Salvo!");
        setTimeout(() => setSavedMsg(null), r.webhookWarning ? 8000 : 2000);
        router.refresh();
      }
    });
  }

  function handleRegisterWebhook() {
    setSavedMsg(null);
    startTransition(async () => {
      const s = await updateSaleBot({
        id: b.id,
        botToken: b.botToken,
      });
      if (!s.ok) {
        setSavedMsg(`✗ Falha ao salvar token: ${s.error}`);
        return;
      }
      const r = await registerTelegramWebhook(b.id);
      setSavedMsg(
        r.ok
          ? "✓ Webhook do Telegram registrado. Agora vai no Funil de conversa."
          : `✗ ${r.error}`,
      );
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Apagar este bot? Não dá pra desfazer.")) return;
    startTransition(async () => {
      const r = await deleteSaleBot(b.id);
      if (r.ok) router.push("/dashboard/produtos");
    });
  }

  const isDiscord = b.type === "discord";
  const isTelegram = b.type === "telegram";

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/produtos"
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <div className="mt-3 flex items-start gap-3 min-w-0">
          <div
            className="inline-flex size-10 sm:size-12 items-center justify-center rounded-xl shrink-0"
            style={{
              background: isDiscord ? "#5865F220" : "#229ED920",
              color: isDiscord ? "#5865F2" : "#229ED9",
            }}
          >
            {isDiscord ? (
              <MessageSquare className="size-5" />
            ) : (
              <Send className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={b.name}
              onChange={(e) => update("name", e.target.value)}
              className="bg-transparent text-lg sm:text-2xl font-semibold text-white outline-none border-b border-transparent hover:border-white/[0.06] focus:border-cyan-400 transition w-full"
            />
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <p className="text-[11px] text-zinc-500">
                {isDiscord ? "Discord" : "Telegram"}
              </p>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={b.active}
                  onChange={(e) => update("active", e.target.checked)}
                  className="size-3.5 rounded border-white/[0.12] bg-white/[0.04] text-cyan-400"
                />
                Ativo
              </label>
            </div>
          </div>
          {/* Botão Salvar sempre visível — ação primária */}
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-3 sm:px-4 py-1.5 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            <span className="hidden sm:inline">{savedMsg ?? "Salvar"}</span>
            <span className="sm:hidden">{savedMsg ? "✓" : "Salvar"}</span>
          </button>
        </div>

        {/* Nav de seções — só Telegram tem funil/comandos/etc */}
        {isTelegram && (
          <div className="mt-4 -mx-4 sm:mx-0 px-4 sm:px-0 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <Link
              href={`/dashboard/bots/${b.id}/funil`}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-400/20"
            >
              <Workflow className="size-3" /> Funil
            </Link>
            {/*
              29/07/2026 (davi: "RETIRE ESSA OPÇÃO DALI E BOTE TUDO DENTRO DO
              FLUXO DO BOT, É PARA ESTAR TUDO ALI"). A aba Broadcast saiu daqui:
              mensagem + mídia + botão de link agora são o bloco "Reengajamento"
              dentro do funil, com intervalo configurável.
            */}
            <Link
              href={`/dashboard/bots/${b.id}/comandos`}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-400/20"
            >
              <Terminal className="size-3" /> Comandos
            </Link>
            <Link
              href={`/dashboard/bots/${b.id}/analytics`}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-400/20"
            >
              <BarChart3 className="size-3" /> Analytics
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15 ml-auto"
            >
              <Trash2 className="size-3" /> Excluir
            </button>
          </div>
        )}
        {!isTelegram && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15"
            >
              <Trash2 className="size-3" /> Excluir
            </button>
          </div>
        )}
      </div>

      {/* Aviso de propósito */}
      {isDiscord ? (
        <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.04] p-4 text-xs text-yellow-100/90">
          <p className="font-semibold mb-1">Bot Discord</p>
          <p className="leading-relaxed">
            No momento só o <strong>Telegram</strong> tem funil de conversa
            interativo (mensagens, botões, enquetes, PIX). Discord fica
            reservado pra integrações futuras.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 text-xs text-cyan-100/90">
          <p className="font-semibold mb-1">Bot Telegram interativo</p>
          <p className="leading-relaxed">
            Configure as credenciais aqui e monte o fluxo de conversa em{" "}
            <strong>Funil de conversa</strong> — texto, imagem, vídeo, áudio,
            GIF, delay, botões inline, enquetes, random e localização, com PIX
            e branch pagou/não-pagou.
          </p>
        </div>
      )}

      {/* CREDENCIAIS */}
      <Section title="Credenciais" subtitle="Como o bot se autentica.">
        {isDiscord ? (
          <>
            <div>
              <Label>Bot Token (Discord Developer Portal)</Label>
              <Input
                type="password"
                value={b.botToken ?? ""}
                onChange={(v) => update("botToken", v || null)}
                placeholder="Bot Token do Discord Developer Portal"
                mono
              />
            </div>
            <div>
              <Label>Channel ID</Label>
              <Input
                value={b.chatId ?? ""}
                onChange={(v) => update("chatId", v || null)}
                placeholder="ID do canal (clique direito no canal → Copiar ID)"
                mono
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label>Bot Token (do @BotFather)</Label>
              <Input
                type="password"
                value={b.botToken ?? ""}
                onChange={(v) => update("botToken", v || null)}
                placeholder="1234567890:ABC..."
                mono
              />
              <Hint>
                No Telegram, fale com{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-300 hover:underline inline-flex items-center gap-0.5"
                >
                  @BotFather <ExternalLink className="size-3" />
                </a>{" "}
                → /newbot → siga as instruções → copie o token.
              </Hint>
            </div>
            {/* Chat ID: fica opcional. O funil interativo NÃO precisa dele
                (o chat_id vem no /start de cada cliente). Deixamos o campo por
                se um dia voltar algum uso legado, mas escondemos. */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-xs font-medium text-white">
                Webhook do Telegram
              </p>
              <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                Sem o webhook o Telegram não sabe pra onde mandar os comandos.
                Ao salvar o token o registro é automático — se precisar
                re-registrar (bot antigo, token trocado, funil não recebe
                /start), clica no botão.
              </p>
              <button
                type="button"
                onClick={handleRegisterWebhook}
                disabled={isPending || !b.botToken}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300 hover:bg-cyan-400/20 transition disabled:opacity-50"
              >
                <Zap className="size-3" />
                Registrar webhook agora
              </button>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

/* ============ Helpers ============ */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6 space-y-4">
      <div>
        <p className="text-base font-semibold text-white">{title}</p>
        {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs text-zinc-400 mb-1.5">{children}</label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type,
  mono,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[11px] text-zinc-500">{children}</p>;
}
