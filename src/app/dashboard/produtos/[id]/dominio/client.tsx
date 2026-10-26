"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Globe,
  Check,
  Loader2,
  ExternalLink,
  Layers,
} from "lucide-react";
import {
  applyDomainToCheckout,
  applyPoolDomainToCheckout,
} from "@/app/dashboard/dominios/actions";

type Checkout = {
  id: string;
  slug: string;
  active: boolean;
  customDomain: string | null;
  poolDomainId: string | null;
};
type OwnDomain = { id: string; domain: string };
type PoolDomain = { id: string; domain: string; label: string | null };

export function DominioProprioClient({
  checkouts,
  ownDomains,
  poolDomains,
}: {
  checkouts: Checkout[];
  ownDomains: OwnDomain[];
  poolDomains: PoolDomain[];
}) {
  if (checkouts.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 text-center">
        <Globe className="mx-auto size-8 text-zinc-600" />
        <p className="mt-3 text-sm text-zinc-400">
          Crie um checkout primeiro (aba Ofertas) pra poder vincular um
          domínio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Vincular domínio aos checkouts ({checkouts.length})
      </p>
      {checkouts.map((c) => (
        <CheckoutDomainRow
          key={c.id}
          checkout={c}
          ownDomains={ownDomains}
          poolDomains={poolDomains}
        />
      ))}
    </div>
  );
}

type ChoiceKey = `pool:${string}` | `own:${string}` | "";

function CheckoutDomainRow({
  checkout,
  ownDomains,
  poolDomains,
}: {
  checkout: Checkout;
  ownDomains: OwnDomain[];
  poolDomains: PoolDomain[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState(false);

  const initial: ChoiceKey = checkout.poolDomainId
    ? `pool:${checkout.poolDomainId}`
    : checkout.customDomain
      ? `own:${ownDomains.find((d) => d.domain === checkout.customDomain)?.id ?? ""}`
      : "";
  const [selected, setSelected] = useState<ChoiceKey>(initial);

  function save() {
    startTransition(async () => {
      let r;
      if (selected.startsWith("pool:")) {
        const id = selected.split(":")[1];
        r = await applyPoolDomainToCheckout({
          checkoutId: checkout.id,
          poolDomainId: id,
        });
      } else if (selected.startsWith("own:")) {
        const id = selected.split(":")[1];
        const dom = ownDomains.find((d) => d.id === id);
        if (!dom) {
          alert("Domínio não encontrado");
          return;
        }
        r = await applyDomainToCheckout({
          checkoutId: checkout.id,
          domain: dom.domain,
        });
      } else {
        r = await applyPoolDomainToCheckout({
          checkoutId: checkout.id,
          poolDomainId: null,
        });
      }
      if (r.ok) {
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 1500);
        router.refresh();
      } else {
        alert(r.error ?? "Erro");
      }
    });
  }

  let currentHost = "(auto — pool default)";
  let badge = "Auto";
  let badgeCls = "bg-zinc-700/40 text-zinc-300";
  if (checkout.customDomain) {
    currentHost = checkout.customDomain;
    badge = "Próprio";
    badgeCls = "bg-cyan-400/15 text-cyan-300";
  } else if (checkout.poolDomainId) {
    const pool = poolDomains.find((p) => p.id === checkout.poolDomainId);
    if (pool) {
      currentHost = pool.domain;
      badge = "Pool";
      badgeCls = "bg-blue-400/15 text-blue-300";
    }
  }
  const currentUrl = `https://${currentHost}/c/${checkout.slug}`;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold text-white">
            /{checkout.slug}
          </p>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-cyan-300 truncate max-w-full"
          >
            {currentUrl} <ExternalLink className="size-3 shrink-0" />
          </a>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeCls}`}
        >
          {badge}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as ChoiceKey)}
          className="flex-1 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white"
        >
          <option value="">
            Auto · sistema escolhe (1º domínio do pool ativo)
          </option>
          {poolDomains.length > 0 && (
            <optgroup label="🌐 Pool da plataforma">
              {poolDomains.map((d) => (
                <option key={d.id} value={`pool:${d.id}`}>
                  {d.domain}
                  {d.label ? ` — ${d.label}` : ""}
                </option>
              ))}
            </optgroup>
          )}
          {ownDomains.length > 0 && (
            <optgroup label="🔒 Seus domínios verificados">
              {ownDomains.map((d) => (
                <option key={d.id} value={`own:${d.id}`}>
                  {d.domain}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || selected === initial}
          className="shrink-0 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : savedMsg ? (
            <Check className="size-3.5" />
          ) : (
            "Aplicar"
          )}
        </button>
      </div>

      {poolDomains.length === 0 && ownDomains.length === 0 && (
        <p className="mt-2 text-[11px] text-yellow-300/80">
          ⚠️ Nenhum domínio disponível no pool nem entre os seus. Avise o
          admin pra cadastrar um.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
        <Layers className="size-3" />
        <span>
          {poolDomains.length} pool · {ownDomains.length} próprios disponíveis
        </span>
      </div>
    </div>
  );
}
