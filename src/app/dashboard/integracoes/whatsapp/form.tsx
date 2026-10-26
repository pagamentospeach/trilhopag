"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveWhatsappConfig } from "./actions";

export function WhatsappForm({
  defaults,
}: {
  defaults?: {
    phoneNumberId?: string;
    businessAccountId?: string | null;
    accessToken?: string;
    recoveryEnabled?: boolean;
    recoveryDelayMinutes?: number;
    recoveryTemplate?: string | null;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await saveWhatsappConfig(fd);
      if (!r.ok) setError(r.error ?? "Erro");
      else {
        setOk(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label htmlFor="phoneNumberId">Phone Number ID</Label>
        <Input
          id="phoneNumberId"
          name="phoneNumberId"
          required
          defaultValue={defaults?.phoneNumberId}
          placeholder="123456789012345"
        />
      </div>
      <div>
        <Label htmlFor="businessAccountId">Business Account ID (opcional)</Label>
        <Input
          id="businessAccountId"
          name="businessAccountId"
          defaultValue={defaults?.businessAccountId ?? ""}
          placeholder="987654321098765"
        />
      </div>
      <div>
        <Label htmlFor="accessToken">Access Token</Label>
        <Input
          id="accessToken"
          name="accessToken"
          type="password"
          required
          defaultValue={defaults?.accessToken ?? ""}
          placeholder={defaults?.accessToken ? "•••••••••••••" : "EAAGm0PX4ZCp..."}
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Token de longa duração (60 dias ou permanente).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="recoveryDelayMinutes">
            Disparo após (minutos de abandono)
          </Label>
          <Input
            id="recoveryDelayMinutes"
            name="recoveryDelayMinutes"
            type="number"
            min={5}
            max={1440}
            defaultValue={defaults?.recoveryDelayMinutes ?? 15}
          />
        </div>
        <div>
          <Label htmlFor="recoveryTemplate">Nome do template Meta</Label>
          <Input
            id="recoveryTemplate"
            name="recoveryTemplate"
            defaultValue={defaults?.recoveryTemplate ?? ""}
            placeholder="abandono_carrinho"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="recoveryEnabled"
          name="recoveryEnabled"
          type="checkbox"
          defaultChecked={defaults?.recoveryEnabled ?? true}
          className="size-4 rounded border-white/15 bg-white/[0.05] text-cyan-400 focus:ring-cyan-400/30"
        />
        <Label htmlFor="recoveryEnabled" className="mb-0">
          Recuperação ativa
        </Label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-300">
          Configuração salva.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={isPending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
