"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  Loader2,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { updateCloakerCampaign, deleteCloakerCampaign } from "../actions";

type DomainOption = { id: string; domain: string };

type Campaign = {
  id: string;
  name: string;
  slug: string;
  whiteUrl: string;
  moneyUrl: string;
  active: boolean;
  mode: string;
  blockDatacenterIps: boolean;
  blockBotUA: boolean;
  blockNoReferer: boolean;
  blockCountries: string[];
  allowCountries: string[];
  blockProxy: boolean;
  blockOldBrowsers: boolean;
  requireReferer: string | null;
  blockedIps: string[];
  allowedIps: string[];
  blockedUAs: string[];
  requireUtmSources: string[];
  totalRequests: number;
  passedToMoney: number;
  sentToWhite: number;
  customDomainId: string | null;
  customDomain: { id: string; domain: string; valid: boolean } | null;
};

type Hit = {
  id: string;
  decision: string;
  reason: string | null;
  ip: string | null;
  country: string | null;
  userAgent: string | null;
  referer: string | null;
  utmSource: string | null;
  createdAt: string;
};

export function CloakerEditor({
  campaign: initial,
  recentHits,
  availableDomains,
}: {
  campaign: Campaign;
  recentHits: Hit[];
  availableDomains: DomainOption[];
}) {
  const router = useRouter();
  const [c, setC] = useState<Campaign>(initial);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function update<K extends keyof Campaign>(k: K, v: Campaign[K]) {
    setC((s) => ({ ...s, [k]: v }));
  }

  function save() {
    setSavedMsg(null);
    setSaveErr(null);
    startTransition(async () => {
      const r = await updateCloakerCampaign({
        id: c.id,
        name: c.name,
        whiteUrl: c.whiteUrl,
        moneyUrl: c.moneyUrl,
        active: c.active,
        mode: c.mode as "redirect" | "rewrite",
        blockDatacenterIps: c.blockDatacenterIps,
        blockBotUA: c.blockBotUA,
        blockNoReferer: c.blockNoReferer,
        blockCountries: c.blockCountries,
        allowCountries: c.allowCountries,
        blockProxy: c.blockProxy,
        blockOldBrowsers: c.blockOldBrowsers,
        requireReferer: c.requireReferer,
        blockedIps: c.blockedIps,
        allowedIps: c.allowedIps,
        blockedUAs: c.blockedUAs,
        requireUtmSources: c.requireUtmSources,
        customDomainId: c.customDomainId ?? undefined,
      });
      if (r.ok) {
        setSavedMsg("Salvo!");
        setTimeout(() => setSavedMsg(null), 2000);
        router.refresh();
      } else {
        setSaveErr(r.error ?? "Erro ao salvar");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Apagar esta campanha cloaker?")) return;
    startTransition(async () => {
      const r = await deleteCloakerCampaign(c.id);
      if (r.ok) router.push("/dashboard/cloaker");
    });
  }

  const domainOk =
    !!c.customDomain && c.customDomain.valid;
  const cloakerUrl = domainOk
    ? `https://${c.customDomain!.domain}/cl/${c.slug}`
    : "";
  function copyUrl() {
    if (!cloakerUrl) return;
    navigator.clipboard.writeText(cloakerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const passRate =
    c.totalRequests > 0
      ? ((c.passedToMoney / c.totalRequests) * 100).toFixed(1)
      : "—";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link
        href="/dashboard/cloaker"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
      >
        <ChevronLeft className="size-3" /> Voltar pros cloakers
      </Link>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <input
            value={c.name}
            onChange={(e) => update("name", e.target.value)}
            className="bg-transparent text-2xl font-semibold text-white outline-none border-b border-transparent hover:border-white/[0.06] focus:border-cyan-400 transition w-full max-w-md"
          />
          <p className="text-[11px] text-zinc-500 mt-1 font-mono">
            slug: {c.slug}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={c.active}
              onChange={(e) => update("active", e.target.checked)}
              className="size-4 rounded border-white/[0.12] bg-white/[0.04] text-cyan-400 focus:ring-cyan-400/40"
            />
            Ativa
          </label>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/[0.06] px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/15 disabled:opacity-50"
          >
            <Trash2 className="size-3" /> Excluir
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            {savedMsg ?? "Salvar"}
          </button>
        </div>
      </div>
      {saveErr && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-200 inline-flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          {saveErr}
        </div>
      )}

      {/* Domínio próprio + URL pública */}
      <div
        className={`rounded-2xl border p-5 space-y-3 ${
          domainOk
            ? "border-cyan-400/30 bg-cyan-400/[0.05]"
            : "border-amber-400/40 bg-amber-400/[0.06]"
        }`}
      >
        <div>
          <p className="text-xs text-zinc-400 mb-2 inline-flex items-center gap-1">
            <Globe className="size-3" /> Domínio próprio (sai no anúncio)
          </p>
          {availableDomains.length > 0 ? (
            <select
              value={c.customDomainId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const dom = availableDomains.find((d) => d.id === id) ?? null;
                update("customDomainId", id);
                update(
                  "customDomain",
                  dom ? { id: dom.id, domain: dom.domain, valid: true } : null,
                );
              }}
              className="w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            >
              <option value="" disabled className="bg-zinc-900">
                — escolher domínio —
              </option>
              {availableDomains.map((d) => (
                <option key={d.id} value={d.id} className="bg-zinc-900">
                  {d.domain}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/[0.08] p-3 text-xs text-amber-100">
              <AlertTriangle className="inline size-3.5 mr-1" />
              Nenhum domínio próprio verificado com Cloaker ativo.{" "}
              <Link
                href="/dashboard/dominios"
                className="underline font-semibold"
              >
                Cadastrar
              </Link>
            </div>
          )}
        </div>

        {domainOk ? (
          <div>
            <p className="text-xs text-zinc-400 mb-2">
              URL pra colar no anúncio (cole essa, NÃO a money diretamente):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-black/40 px-3 py-2 text-sm text-cyan-300 font-mono break-all">
                {cloakerUrl}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs font-medium transition ${
                  copied
                    ? "bg-cyan-400 text-black"
                    : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12]"
                }`}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-amber-100/80">
            Escolha um domínio próprio acima pra gerar o link do anúncio. Sem
            domínio próprio o cloaker não funciona — o link <em>nunca</em> pode
            ser <code>trilhopag.com</code>.
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Hits totais" value={c.totalRequests} />
        <StatCard label="→ Money" value={c.passedToMoney} color="text-cyan-300" />
        <StatCard label="→ White" value={c.sentToWhite} color="text-zinc-400" />
        <StatCard label="Taxa pass" value={`${passRate}%`} color="text-cyan-300" />
      </div>

      {/* URLs */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
        <SectionTitle>URLs</SectionTitle>
        <UrlRow
          label="🟢 Money — pra tráfego pago real"
          value={c.moneyUrl}
          onChange={(s) => update("moneyUrl", s)}
        />
        <UrlRow
          label="⚪ White — pra bots/moderadores"
          value={c.whiteUrl}
          onChange={(s) => update("whiteUrl", s)}
        />
        <div>
          <label className="block text-xs text-zinc-400 mb-2">Modo</label>
          <select
            value={c.mode}
            onChange={(e) => update("mode", e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
          >
            <option value="redirect">Redirect 302 (rápido)</option>
            <option value="rewrite">Rewrite/Proxy (mantém URL)</option>
          </select>
        </div>
      </div>

      {/* Regras */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
        <SectionTitle>Filtros automáticos</SectionTitle>
        <ToggleRow
          label="Bloquear user-agents de bots"
          help="Facebook, Google, TikTok crawlers, scrapers, headless browsers..."
          checked={c.blockBotUA}
          onChange={(b) => update("blockBotUA", b)}
        />
        <ToggleRow
          label="Bloquear IPs de datacenter"
          help="AWS, GCP, Azure, Hetzner, OVH, DigitalOcean, Linode..."
          checked={c.blockDatacenterIps}
          onChange={(b) => update("blockDatacenterIps", b)}
        />
        <ToggleRow
          label="Bloquear acesso sem referer"
          help="Acesso direto (sem clique em link) — geralmente bot/moderador."
          checked={c.blockNoReferer}
          onChange={(b) => update("blockNoReferer", b)}
        />
        <ToggleRow
          label="Bloquear proxy/VPN"
          help="Detecta acessos via VPNs/proxies conhecidos."
          checked={c.blockProxy}
          onChange={(b) => update("blockProxy", b)}
        />
        <ToggleRow
          label="Bloquear browsers antigos (IE, Trident)"
          checked={c.blockOldBrowsers}
          onChange={(b) => update("blockOldBrowsers", b)}
        />

        <SectionTitle>Geo (códigos ISO ex: BR, US, PT)</SectionTitle>
        <CsvRow
          label="Permitir SOMENTE estes países (whitelist)"
          value={c.allowCountries}
          onChange={(arr) => update("allowCountries", arr)}
          placeholder="BR,PT"
        />
        <CsvRow
          label="Bloquear estes países"
          value={c.blockCountries}
          onChange={(arr) => update("blockCountries", arr)}
          placeholder="US,RU,IN"
        />

        <SectionTitle>Listas manuais</SectionTitle>
        <CsvRow
          label="IPs sempre permitidos (override)"
          value={c.allowedIps}
          onChange={(arr) => update("allowedIps", arr)}
          placeholder="1.2.3.4,5.6.7.8"
        />
        <CsvRow
          label="IPs sempre bloqueados"
          value={c.blockedIps}
          onChange={(arr) => update("blockedIps", arr)}
          placeholder="9.8.7.6"
        />
        <CsvRow
          label="User-agents bloqueados (substring)"
          value={c.blockedUAs}
          onChange={(arr) => update("blockedUAs", arr)}
          placeholder="customBot,scraper"
        />

        <SectionTitle>Referer</SectionTitle>
        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            Referer obrigatório (regex; vazio = qualquer)
          </label>
          <input
            type="text"
            value={c.requireReferer ?? ""}
            onChange={(e) => update("requireReferer", e.target.value || null)}
            placeholder="facebook\\.com|instagram\\.com"
            className="w-full rounded-md border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-white font-mono"
          />
        </div>

        <SectionTitle>UTM</SectionTitle>
        <CsvRow
          label="Permitir SOMENTE estes utm_source"
          value={c.requireUtmSources}
          onChange={(arr) => update("requireUtmSources", arr)}
          placeholder="FB,IG,fb-ads"
        />
      </div>

      {/* Hits recentes */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        <SectionTitle>Últimos 30 hits</SectionTitle>
        {recentHits.length === 0 ? (
          <p className="text-xs text-zinc-500 py-6 text-center">
            Sem hits ainda. Cole sua URL{" "}
            <code className="text-cyan-300">/cl/{c.slug}</code> no anúncio pra
            começar a receber tráfego.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-zinc-500">
                <tr>
                  <th className="text-left py-2 pr-3">Decisão</th>
                  <th className="text-left py-2 pr-3">Motivo</th>
                  <th className="text-left py-2 pr-3">IP</th>
                  <th className="text-left py-2 pr-3">UTM</th>
                  <th className="text-left py-2 pr-3">UA</th>
                  <th className="text-left py-2">Quando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {recentHits.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-3">
                      {h.decision === "money" ? (
                        <span className="inline-flex items-center gap-1 text-cyan-300">
                          <CheckCircle2 className="size-3" /> Money
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-zinc-400">
                          <XCircle className="size-3" /> White
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-zinc-400">{h.reason || "—"}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-300">
                      {h.ip ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-zinc-400">
                      {h.utmSource ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-zinc-500 max-w-[200px] truncate">
                      {h.userAgent ?? "—"}
                    </td>
                    <td className="py-2 text-zinc-500">
                      {timeAgo(h.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return `${Math.floor(s / 86400)}d atrás`;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          color ?? "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold pt-2">
      {children}
    </p>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {help && <p className="text-[11px] text-zinc-500 mt-0.5">{help}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 inline-flex h-5 w-9 items-center rounded-full transition ${
          checked ? "bg-cyan-400" : "bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

function UrlRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-2">{label}</label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      />
    </div>
  );
}

function CsvRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (a: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-2">{label}</label>
      <input
        type="text"
        value={value.join(",")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder={placeholder}
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 font-mono"
      />
      <p className="text-[11px] text-zinc-500 mt-1">
        Separe por vírgula. Vazio = sem filtro.
      </p>
    </div>
  );
}
