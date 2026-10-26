"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2 } from "lucide-react";
import { createMemberArea } from "../actions";

export function NewMemberAreaClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Dê um nome pra área");
    startTransition(async () => {
      const r = await createMemberArea({ name });
      if (r.ok) router.push(`/dashboard/membros/${r.id}`);
      else setError(r.error);
    });
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <GraduationCap className="size-6 text-cyan-300 mt-0.5" />
        <div>
          <h1 className="text-2xl font-semibold text-white">Nova área de membros</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Crie uma área pra entregar conteúdo. Você customiza cores, banner,
            cursos, módulos e aulas no próximo passo.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            Nome da área
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mentoria Tráfego Pago Q4"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            autoFocus
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard/membros")}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-3 animate-spin" />}
            Criar área
          </button>
        </div>
      </div>
    </div>
  );
}
