"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Plus,
  Send,
  Power,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  createSalesChannel,
  updateSalesChannel,
  toggleSalesChannel,
  deleteSalesChannel,
  testSalesChannel,
  type ChannelInput,
} from "./actions";
import { OPS_MODE_LABEL, OPS_MODES } from "@/lib/ops-modes";

type Channel = {
  id: string;
  name: string;
  botToken: string;
  chatId: string;
  modes: string[];
  showCustomer: boolean;
  showTotals: boolean;
  active: boolean;
  totalSent: number;
  totalFailed: number;
  lastSentAt: string | null;
  lastError: string | null;
};

const MODES = OPS_MODES.map((value) => ({
  value,
  label: OPS_MODE_LABEL[value],
}));

export function ChannelPanel({ channels }: { channels: Channel[] }) {
  // `editing` guarda o canal em edição; `"new"` abre o modal vazio.
  const [editing, setEditing] = useState<Channel | "new" | null>(null);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-white">Canais conectados</p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black transition hover:bg-cyan-300"
        >
          <Plus className="size-3.5" /> Adicionar canal
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] px-5 py-10 text-center">
            <p className="text-sm text-zinc-300">Nenhum canal conectado ainda.</p>
            <p className="mt-1 text-xs text-zinc-500">
              Adicione um canal e cada venda aprovada vira mensagem lá na hora.
            </p>
          </div>
        ) : (
          channels.map((c) => (
            <ChannelRow key={c.id} channel={c} onEdit={() => setEditing(c)} />
          ))
        )}
      </div>

      {editing && (
        <ChannelModal
          channel={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  onEdit,
}: {
  channel: Channel;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onDelete() {
    if (!confirm(`Remover o canal "${channel.name}"?`)) return;
    startTransition(async () => {
      await deleteSalesChannel(channel.id);
      router.refresh();
    });
  }
  function onToggle() {
    startTransition(async () => {
      await toggleSalesChannel(channel.id, !channel.active);
      router.refresh();
    });
  }
  function onTest() {
    setMsg(null);
    startTransition(async () => {
      const r = await testSalesChannel(channel.id);
      setMsg(
        r.ok
          ? { ok: true, text: "Mensagem de teste enviada. Confira o canal." }
          : { ok: false, text: r.error },
      );
      router.refresh();
    });
  }

  // Só mostra o erro se ele for o ÚLTIMO evento. Se mandou com sucesso
  // depois, o lastError já foi zerado pelo dispatcher.
  const broken = !!channel.lastError;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition hover:bg-white/[0.04]">
      <div className="group flex items-center gap-3">
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
            broken
              ? "bg-red-500/15 text-red-300"
              : channel.active
                ? "bg-sky-400/15 text-sky-300"
                : "bg-zinc-700/30 text-zinc-500"
          }`}
        >
          <Send className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {channel.name}
          </p>
          <p className="truncate font-mono text-xs text-zinc-400">
            {channel.chatId}
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {channel.modes.length > 0 &&
            channel.modes.map((m) => (
              <span
                key={m}
                className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-300"
              >
                {m}
              </span>
            ))}
          {!channel.active && (
            <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              Pausado
            </span>
          )}
        </div>

        <div className="flex shrink-0 gap-1 opacity-60 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={onTest}
            disabled={isPending}
            className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            title="Enviar mensagem de teste"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            title="Editar"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={isPending}
            className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            title={channel.active ? "Pausar" : "Ativar"}
          >
            <Power className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
            title="Remover"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Rodapé de entrega. A lição do notificador antigo (66% de falha e
          ninguém sabia) foi virar isso aqui em cima da tela do seller. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.05] pt-2 text-[11px] text-zinc-500">
        <span>
          <strong className="text-zinc-300">{channel.totalSent}</strong> enviada
          {channel.totalSent === 1 ? "" : "s"}
        </span>
        {channel.totalFailed > 0 && (
          <span className="text-red-300/80">
            <strong>{channel.totalFailed}</strong> falha
            {channel.totalFailed === 1 ? "" : "s"}
          </span>
        )}
        {channel.lastSentAt && (
          <span>
            Último envio:{" "}
            {new Date(channel.lastSentAt).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </span>
        )}
      </div>

      {broken && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-red-200">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>
            Telegram recusou o último envio: <strong>{channel.lastError}</strong>
            . Confirme que o bot ainda é <strong>admin</strong> do canal.
          </span>
        </p>
      )}

      {msg && (
        <p
          className={`mt-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
            msg.ok
              ? "border border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200"
              : "border border-red-500/25 bg-red-500/[0.07] text-red-200"
          }`}
        >
          {msg.ok ? (
            <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          )}
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}

function ChannelModal({
  channel,
  onClose,
}: {
  channel: Channel | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(channel?.name ?? "");
  const [botToken, setBotToken] = useState(channel?.botToken ?? "");
  const [chatId, setChatId] = useState(channel?.chatId ?? "");
  const [modes, setModes] = useState<string[]>(channel?.modes ?? []);
  const [showCustomer, setShowCustomer] = useState(
    channel?.showCustomer ?? true,
  );
  const [showTotals, setShowTotals] = useState(channel?.showTotals ?? true);

  function toggleMode(m: string) {
    setModes((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const input: ChannelInput = {
      name,
      botToken,
      chatId,
      modes: modes as ChannelInput["modes"],
      showCustomer,
      showTotals,
    };
    startTransition(async () => {
      const r = channel
        ? await updateSalesChannel(channel.id, input)
        : await createSalesChannel(input);
      if (!r.ok) setError(r.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h3 className="text-base font-semibold text-white">
            {channel ? "Editar canal" : "Adicionar canal"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 overflow-y-auto p-6">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2 text-[11px] leading-relaxed text-cyan-100/80">
            O bot precisa ser <strong>ADMINISTRADOR</strong> do canal com permissão
            de publicar mensagens. Ao salvar, mandamos uma mensagem de teste — se
            o Telegram recusar, o canal não é criado.
          </div>

          <div>
            <label className="mb-2 block text-xs text-zinc-400">
              Nome do canal (só pra você identificar aqui)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              placeholder="Vendas Aprovadas — BLACK"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs text-zinc-400">
              Token do bot (@BotFather)
            </label>
            <input
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              required
              placeholder="8123456789:AAF..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs text-zinc-400">chat_id do canal</label>
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              required
              placeholder="-1001234567890 ou @nomedocanal"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Canal público: <code>@nomedocanal</code>. Canal privado: encaminhe
              uma mensagem dele pro <strong>@userinfobot</strong> e copie o id
              (começa com -100).
            </p>
          </div>

          <div className="border-t border-white/[0.06] pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Filtrar por modo da conta
            </p>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => {
                const on = modes.includes(m.value);
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => toggleMode(m.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "bg-cyan-400 text-black"
                        : "border border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              Nenhum selecionado = recebe vendas de{" "}
              <strong className="text-zinc-400">qualquer modo</strong>. Selecione
              se quiser um canal só pro black e outro só pro white, por exemplo.
            </p>
          </div>

          <div className="border-t border-white/[0.06] pt-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              O que aparece na mensagem
            </p>
            <div className="space-y-3">
              <ToggleRow
                label="Dados do cliente (nome, email, IP)"
                checked={showCustomer}
                onChange={setShowCustomer}
              />
              <ToggleRow
                label="Total de vendas e faturamento da campanha no dia"
                checked={showTotals}
                onChange={setShowTotals}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
            >
              {isPending && <Loader2 className="size-3 animate-spin" />}
              {channel
                ? "Salvar"
                : isPending
                  ? "Testando canal..."
                  : "Testar e adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs text-zinc-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? "bg-cyan-400" : "bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block size-3.5 rounded-full bg-white transition ${
            checked ? "translate-x-[1.15rem]" : "translate-x-[0.15rem]"
          }`}
        />
      </button>
    </label>
  );
}
