"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// 08/08/2026: a lista era escrita à mão aqui e divergia da que o backend
// dispara — faltavam 3 eventos reais e sobrava `transaction.failed`, que nada
// emite. Agora vem do catálogo. Ver lib/webhook-events.ts.
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_GROUPS,
} from "@/lib/webhook-events";

export function WebhookForm({
  defaults,
  action,
  submitLabel,
}: {
  defaults?: { url?: string; events?: string[]; active?: boolean };
  action: (formData: FormData) => Promise<{
    ok: boolean;
    error?: string;
    fieldErrors?: Record<string, string[]>;
  } | undefined>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await action(fd);
      if (r && !r.ok) setError(r.error ?? "Erro");
    });
  }

  const activeEvents = defaults?.events ?? [];

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <Label htmlFor="url">URL do endpoint</Label>
        <Input
          id="url"
          name="url"
          type="url"
          required
          defaultValue={defaults?.url}
          placeholder="https://seu-servidor.com/webhooks/trilhopag"
        />
      </div>

      <div>
        <Label>Eventos para receber</Label>
        <p className="-mt-1 mb-3 text-xs text-zinc-500">
          Se nenhum for selecionado, todos os eventos serão enviados.
        </p>
        {/* Agrupado por assunto: com "Saques" na lista, uma grade única de
            oito caixas misturava dois mundos que o dev do outro lado trata em
            handlers diferentes. */}
        <div className="space-y-4">
          {WEBHOOK_EVENT_GROUPS.map((grupo) => (
            <div key={grupo}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {grupo}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {WEBHOOK_EVENTS.filter((e) => e.group === grupo).map((e) => (
                  <label
                    key={e.key}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm hover:bg-white/[0.06]"
                  >
                    <input
                      type="checkbox"
                      name={`event_${e.key}`}
                      defaultChecked={
                        activeEvents.length === 0 || activeEvents.includes(e.key)
                      }
                      className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
                    />
                    <span className="text-zinc-300">{e.label}</span>
                    <code className="ml-auto font-mono text-[10px] text-zinc-500">
                      {e.key}
                    </code>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="active"
          name="active"
          type="checkbox"
          defaultChecked={defaults?.active ?? true}
          className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
        />
        <Label htmlFor="active" className="mb-0">
          Webhook ativo
        </Label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
