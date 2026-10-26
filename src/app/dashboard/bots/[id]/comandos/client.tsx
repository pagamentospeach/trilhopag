"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Terminal, Plus, Loader2, Trash2 } from "lucide-react";
import { createBotCommand, deleteBotCommand, updateBotCommand } from "./actions";

type Cmd = { id: string; command: string; startNodeId: string | null; active: boolean };

export function CommandsClient({
  bot,
  funnel,
  funnelNodes,
  commands,
}: {
  bot: { id: string; name: string };
  funnel: { id: string; name: string } | null;
  funnelNodes: Array<{ id: string; type: string; label: string }>;
  commands: Cmd[];
}) {
  const router = useRouter();
  const [newCmd, setNewCmd] = useState("/comprar");
  const [newStart, setNewStart] = useState("");
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function create() {
    setMsg(null);
    startTransition(async () => {
      const r = await createBotCommand({
        botId: bot.id,
        command: newCmd,
        startNodeId: newStart || null,
      });
      if (!r.ok) setMsg(`✗ ${r.error}`);
      else {
        setMsg("✓ Criado");
        setNewCmd("/");
        setNewStart("");
        router.refresh();
      }
    });
  }
  function toggleActive(c: Cmd) {
    startTransition(async () => {
      await updateBotCommand({ id: c.id, active: !c.active });
      router.refresh();
    });
  }
  function updateStart(c: Cmd, startNodeId: string) {
    startTransition(async () => {
      await updateBotCommand({ id: c.id, startNodeId: startNodeId || null });
      router.refresh();
    });
  }
  function remove(c: Cmd) {
    if (!confirm(`Apagar comando ${c.command}?`)) return;
    startTransition(async () => {
      await deleteBotCommand(c.id);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <header>
        <Link
          href={`/dashboard/bots/${bot.id}`}
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          <ChevronLeft className="size-3" /> Voltar
        </Link>
        <div className="mt-3 flex items-center gap-3 min-w-0">
          <div className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300">
            <Terminal className="size-5 sm:size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg sm:text-2xl font-semibold text-white">
              Comandos · <span className="text-cyan-200">{bot.name}</span>
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
              Além de <code>/start</code>, mapeie <code>/comprar</code>,
              <code>/suporte</code> etc a blocos específicos do funil.
            </p>
          </div>
        </div>
      </header>

      {!funnel && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs text-amber-100">
          ⚠ Este bot não tem funil ativo. Comandos só disparam quando há um
          funil ativo — ative um em{" "}
          <Link href={`/dashboard/bots/${bot.id}/funil`} className="underline">
            Funil de conversa
          </Link>
          .
        </div>
      )}

      {/* Novo */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6 space-y-3">
        <p className="text-base font-semibold text-white">Novo comando</p>
        <div className="space-y-2 sm:grid sm:grid-cols-[180px_1fr_auto] sm:gap-2 sm:space-y-0">
          <input
            value={newCmd}
            onChange={(e) => setNewCmd(e.target.value)}
            placeholder="/comprar"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
          <select
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          >
            <option value="">Início do funil (findStart)</option>
            {funnelNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <button
            onClick={create}
            disabled={busy || !newCmd.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Criar comando
          </button>
        </div>
        {msg && <p className="text-[11px] text-zinc-400">{msg}</p>}
      </div>

      {/* Lista */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6 space-y-3">
        <p className="text-base font-semibold text-white">Comandos cadastrados</p>
        {commands.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nenhum comando ainda. Só <code>/start</code> funciona (padrão do bot).
          </p>
        ) : (
          <div className="space-y-2">
            {commands.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-white/[0.06] bg-black/20 p-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3"
              >
                <div className="flex items-center gap-3 sm:contents">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={c.active}
                      onChange={() => toggleActive(c)}
                      className="size-4 rounded border-white/[0.12] bg-white/[0.04] text-cyan-400"
                    />
                  </label>
                  <code className="text-sm font-mono text-cyan-300 flex-1 sm:flex-none sm:min-w-[100px] truncate">
                    {c.command}
                  </code>
                  <button
                    onClick={() => remove(c)}
                    disabled={busy}
                    className="sm:hidden shrink-0 rounded-full border border-red-500/25 p-1.5 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <select
                  value={c.startNodeId ?? ""}
                  onChange={(e) => updateStart(c, e.target.value)}
                  className="w-full sm:flex-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="">Início do funil</option>
                  {funnelNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => remove(c)}
                  disabled={busy}
                  className="hidden sm:inline-flex rounded-full border border-red-500/25 p-1.5 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
