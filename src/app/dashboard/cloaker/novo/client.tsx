"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield, AlertCircle, Globe } from "lucide-react";
import { createCloakerCampaign } from "../actions";

type DomainOption = { id: string; domain: string };

export function NewCloakerClient({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [whiteUrl, setWhiteUrl] = useState("");
  const [moneyUrl, setMoneyUrl] = useState("");
  const [customDomainId, setCustomDomainId] = useState(domains[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Dê um nome pra campanha");
    if (!whiteUrl.trim()) return setError("Informe a URL white (página segura)");
    if (!moneyUrl.trim()) return setError("Informe a URL money (oferta)");
    if (!customDomainId) return setError("Escolha um domínio próprio");
    startTransition(async () => {
      const r = await createCloakerCampaign({
        name: name.trim(),
        whiteUrl: whiteUrl.trim(),
        moneyUrl: moneyUrl.trim(),
        customDomainId,
      });
      if (r.ok) {
        router.push(`/dashboard/cloaker/${r.id}`);
      } else {
        setError(r.error);
      }
    });
  }

  const selectedDomain = domains.find((d) => d.id === customDomainId);
  const slugExample = name
    ? name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 30) || "sua-campanha"
    : "sua-campanha";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Shield className="size-6 text-cyan-300 mt-0.5" />
        <div>
          <h1 className="text-2xl font-semibold text-white">Nova campanha</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Configure as duas URLs. Por padrão, bloqueamos crawlers (Facebook,
            Google etc), datacenters e moderadores. Refine as regras depois.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            Nome da campanha
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Black Friday — Cloaker FB"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            <Globe className="inline size-3 mr-1" />
            Domínio próprio (de onde o anúncio vai sair)
          </label>
          <select
            value={customDomainId}
            onChange={(e) => setCustomDomainId(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id} className="bg-zinc-900">
                {d.domain}
              </option>
            ))}
          </select>
          {selectedDomain && (
            <p className="mt-1.5 text-[11px] text-zinc-500">
              URL final do anúncio:{" "}
              <code className="text-cyan-300">
                https://{selectedDomain.domain}/cl/{slugExample}
              </code>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            URL White (página segura — pra bots/moderadores)
          </label>
          <input
            type="url"
            value={whiteUrl}
            onChange={(e) => setWhiteUrl(e.target.value)}
            placeholder="https://blog.exemplo.com/artigo-suave"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
          <p className="text-[11px] text-zinc-500 mt-1.5">
            Use um blog post, artigo, página institucional — algo que passe
            review de qualquer plataforma.
          </p>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            URL Money (oferta real — pro tráfego pago)
          </label>
          <input
            type="url"
            value={moneyUrl}
            onChange={(e) => setMoneyUrl(e.target.value)}
            placeholder="https://checkout.suamarca.com/c/sua-oferta"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-200 flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard/cloaker")}
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
            Criar campanha
          </button>
        </div>
      </div>
    </div>
  );
}
