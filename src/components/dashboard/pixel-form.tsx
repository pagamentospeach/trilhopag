"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const PLATFORM_HELP: Record<string, { tokenLabel: string; tokenHint: string; idHint: string }> = {
  FACEBOOK: {
    tokenLabel: "Access Token (CAPI)",
    tokenHint: "Token de longa duração do Meta Business Manager.",
    idHint: "Pixel ID (15-16 dígitos).",
  },
  TIKTOK: {
    tokenLabel: "Access Token (Events API)",
    tokenHint: "Token gerado no TikTok Events Manager.",
    idHint: "Pixel ID do TikTok.",
  },
  KWAI: {
    tokenLabel: "Access Token",
    tokenHint: "Token da API de eventos Kwai.",
    idHint: "Pixel ID do Kwai for Business.",
  },
  GOOGLE_ADS: {
    tokenLabel: "OAuth Token : Conversion Action ID",
    tokenHint: "Formato: <token>:<conversion_action_id>",
    idHint: "Customer ID da conta Google Ads.",
  },
  GA4: {
    tokenLabel: "API Secret",
    tokenHint: "API secret do Measurement Protocol.",
    idHint: "Measurement ID (G-XXXXXXX).",
  },
  TABOOLA: {
    tokenLabel: "API Key",
    tokenHint: "Chave da API Taboola.",
    idHint: "Account ID Taboola.",
  },
};

export function PixelForm({
  defaults,
  action,
  submitLabel,
}: {
  defaults?: {
    platform?: string;
    pixelId?: string;
    capiToken?: string | null;
    testEventCode?: string | null;
    active?: boolean;
  };
  action: (formData: FormData) => Promise<{
    ok: boolean;
    error?: string;
    fieldErrors?: Record<string, string[]>;
  } | undefined>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [platform, setPlatform] = useState(defaults?.platform ?? "FACEBOOK");
  const [error, setError] = useState<string | null>(null);

  const help = PLATFORM_HELP[platform];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await action(fd);
      if (r && !r.ok) setError(r.error ?? "Erro");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <Label htmlFor="platform">Plataforma</Label>
        <Select
          id="platform"
          name="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="FACEBOOK">Facebook / Instagram</option>
          <option value="TIKTOK">TikTok</option>
          <option value="KWAI">Kwai</option>
          <option value="GOOGLE_ADS">Google Ads</option>
          <option value="GA4">Google Analytics 4</option>
          <option value="TABOOLA">Taboola</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="pixelId">Pixel ID</Label>
        <Input
          id="pixelId"
          name="pixelId"
          required
          defaultValue={defaults?.pixelId}
          placeholder="123456789012345"
        />
        <p className="mt-1.5 text-xs text-zinc-500">{help.idHint}</p>
      </div>

      <div>
        <Label htmlFor="capiToken">{help.tokenLabel}</Label>
        <Input
          id="capiToken"
          name="capiToken"
          type="password"
          defaultValue={defaults?.capiToken ?? ""}
          placeholder="•••••••••••••••••"
        />
        <p className="mt-1.5 text-xs text-zinc-500">{help.tokenHint}</p>
      </div>

      <div>
        <Label htmlFor="testEventCode">Test event code (opcional)</Label>
        <Input
          id="testEventCode"
          name="testEventCode"
          defaultValue={defaults?.testEventCode ?? ""}
          placeholder="TEST12345"
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Pra debugar no Test Events do Meta / TikTok.
        </p>
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
          Pixel ativo
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
