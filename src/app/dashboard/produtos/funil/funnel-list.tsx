"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Workflow,
  CheckCircle2,
  Circle,
  Loader2,
  X,
  Pencil,
  Trash2,
  Power,
  Copy,
} from "lucide-react";
import {
  createFunnel,
  activateFunnel,
  deactivateFunnel,
  deleteFunnel,
  renameFunnel,
  duplicateFunnel,
} from "./actions";

type FunnelItem = {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
};

export function FunnelList({
  funnels,
  kind = "product",
  botId,
  basePath = "/dashboard/produtos/funil",
  unitLabel = "produto",
}: {
  funnels: FunnelItem[];
  /** "product" (default) ou "bot" (funil de conversa). */
  kind?: "product" | "bot";
  /** Obrigatório quando kind="bot". */
  botId?: string;
  /** Onde abrir cada funil (basePath/[id]). */
  basePath?: string;
  /** Rótulo do que os nós representam (ex: "produto", "passo"). */
  unitLabel?: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function doCreate() {
    setError(null);
    const n = name.trim();
    if (!n) return setError("Dê um nome pro funil");
    startTransition(async () => {
      const r = await createFunnel({ name: n, kind, botId });
      if (r.ok) {
        setCreating(false);
        setName("");
        router.push(`${basePath}/${r.id}`);
      } else setError(r.error);
    });
  }

  function toggleActive(f: FunnelItem) {
    setBusyId(f.id);
    startTransition(async () => {
      const r = f.active ? await deactivateFunnel(f.id) : await activateFunnel(f.id);
      setBusyId(null);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      const warnings = (r as { warnings?: string[] }).warnings;
      if (!f.active && warnings && warnings.length) {
        alert("Funil ativado.\n\n⚠ " + warnings.join("\n"));
      }
      router.refresh();
    });
  }

  function doRename(f: FunnelItem) {
    const novo = window.prompt("Novo nome do funil:", f.name);
    if (!novo || novo.trim() === f.name) return;
    setBusyId(f.id);
    startTransition(async () => {
      await renameFunnel(f.id, novo.trim());
      setBusyId(null);
      router.refresh();
    });
  }

  function doDuplicate(f: FunnelItem) {
    setBusyId(f.id);
    startTransition(async () => {
      const r = await duplicateFunnel(f.id);
      setBusyId(null);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  function doDelete(f: FunnelItem) {
    if (!window.confirm(`Excluir o funil "${f.name}"?${f.active ? "\n\nEle está ATIVO — os links de upsell/back-redirect que ele aplicou serão limpos." : ""}`))
      return;
    setBusyId(f.id);
    startTransition(async () => {
      await deleteFunnel(f.id);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-cyan-300 transition shadow-lg shadow-cyan-400/20"
        >
          <Plus className="size-4" /> Criar funil
        </button>
      </div>

      {funnels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-10 text-center">
          <Workflow className="mx-auto size-8 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-300">
            Nenhum funil ainda
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Crie um funil, dê um nome e desenhe as conexões entre seus produtos.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300"
          >
            <Plus className="size-3.5" /> Criar meu primeiro funil
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {funnels.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 hover:border-white/[0.16] transition"
            >
              <div
                className={`flex size-10 items-center justify-center rounded-xl shrink-0 ${
                  f.active ? "bg-cyan-400/15 text-cyan-300" : "bg-white/[0.06] text-zinc-400"
                }`}
              >
                <Workflow className="size-5" />
              </div>
              <Link href={`${basePath}/${f.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="truncate text-sm font-semibold text-white">{f.name}</p>
                  {f.active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                      <CheckCircle2 className="size-3" /> Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                      <Circle className="size-3" /> Inativo
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {f.nodeCount} {unitLabel}{f.nodeCount !== 1 ? "s" : ""} · {f.edgeCount}{" "}
                  conexõe{f.edgeCount !== 1 ? "s" : "m"} · editado{" "}
                  {new Date(f.updatedAt).toLocaleDateString("pt-BR")}
                </p>
              </Link>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleActive(f)}
                  disabled={isPending && busyId === f.id}
                  title={f.active ? "Desativar" : "Ativar"}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    f.active
                      ? "border border-white/[0.1] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                      : "bg-cyan-400 text-black hover:bg-cyan-300"
                  }`}
                >
                  {isPending && busyId === f.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Power className="size-3.5" />
                  )}
                  {f.active ? "Desativar" : "Ativar"}
                </button>
                <button
                  onClick={() => doRename(f)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  title="Renomear"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => doDuplicate(f)}
                  disabled={isPending && busyId === f.id}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                  title="Duplicar (cria uma cópia desativada)"
                >
                  {isPending && busyId === f.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <button
                  onClick={() => doDelete(f)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
                  title="Excluir"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setCreating(false)}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Novo funil</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Dê um nome (ex: "Funil Black November"). Nasce desativado.
                </p>
              </div>
              <button onClick={() => setCreating(false)} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06]">
                <X className="size-4" />
              </button>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doCreate()}
              placeholder="Nome do funil"
              autoFocus
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            {error && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
              >
                Cancelar
              </button>
              <button
                onClick={doCreate}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
              >
                {isPending && <Loader2 className="size-3 animate-spin" />}
                Criar e abrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
