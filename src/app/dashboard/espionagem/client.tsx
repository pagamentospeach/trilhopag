"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Eye,
  Lock,
  Sparkles,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Wallet,
  QrCode,
  Search,
  Star,
  Film,
  Image as ImageIcon,
  Layers,
} from "lucide-react";
import {
  purchaseSpyingWithBalanceAction,
  purchaseSpyingWithPixAction,
} from "./actions";
import { formatBRL } from "@/lib/utils";

type Ad = {
  id: string;
  platform: string;
  title: string;
  brand: string | null;
  niche: string;
  angle: string;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  hookText: string | null;
  description: string | null;
  cta: string | null;
  estimatedSpend: string | null;
  daysRunning: number | null;
  country: string | null;
  tags: string[];
  language: string;
  featured: boolean;
};

type Props = {
  balanceCents: number;
  ownsFacebook: boolean;
  ownsTiktok: boolean;
  facebookPriceCents: number;
  tiktokPriceCents: number;
  facebookLabel: string;
  tiktokLabel: string;
  facebookAds: Ad[];
  tiktokAds: Ad[];
};

export function EspionagemClient(props: Props) {
  const [tab, setTab] = useState<"facebook" | "tiktok">("facebook");

  const ownsActive = tab === "facebook" ? props.ownsFacebook : props.ownsTiktok;
  const priceCents =
    tab === "facebook" ? props.facebookPriceCents : props.tiktokPriceCents;
  const label = tab === "facebook" ? props.facebookLabel : props.tiktokLabel;
  const ads = tab === "facebook" ? props.facebookAds : props.tiktokAds;

  return (
    <div className="max-w-7xl space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Eye className="size-6 text-fuchsia-300" />
            Espionagem
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Biblioteca curada de anúncios de alta performance — direct response, ofertas
            quentes, copy + criativo + ângulo. Filtre por nicho, ângulo, mídia.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Saldo</p>
          <p className="font-mono text-sm text-cyan-300">{formatBRL(props.balanceCents)}</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.08]">
        <TabButton
          label={props.facebookLabel}
          owned={props.ownsFacebook}
          active={tab === "facebook"}
          onClick={() => setTab("facebook")}
          color="text-blue-300"
          activeBorder="border-blue-400"
        />
        <TabButton
          label={props.tiktokLabel}
          owned={props.ownsTiktok}
          active={tab === "tiktok"}
          onClick={() => setTab("tiktok")}
          color="text-pink-300"
          activeBorder="border-pink-400"
        />
      </div>

      {ownsActive ? (
        <SwipeFile ads={ads} platform={tab} />
      ) : (
        <UnlockCard
          platform={tab}
          priceCents={priceCents}
          balanceCents={props.balanceCents}
          label={label}
        />
      )}
    </div>
  );
}

function TabButton({
  label,
  owned,
  active,
  onClick,
  color,
  activeBorder,
}: {
  label: string;
  owned: boolean;
  active: boolean;
  onClick: () => void;
  color: string;
  activeBorder: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? `${activeBorder} ${color}`
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      <span className="inline-flex items-center gap-2">
        {label}
        {owned ? (
          <CheckCircle2 className="size-3.5 text-cyan-400" />
        ) : (
          <Lock className="size-3 text-zinc-500" />
        )}
      </span>
    </button>
  );
}

function UnlockCard({
  platform,
  priceCents,
  balanceCents,
  label,
}: {
  platform: "facebook" | "tiktok";
  priceCents: number;
  balanceCents: number;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pixModal, setPixModal] = useState<null | {
    pixCopyPaste: string;
    pixQrCodeBase64?: string | null;
  }>(null);

  const enoughBalance = balanceCents >= priceCents;

  function buyWithBalance() {
    if (!confirm(`Comprar acesso vitalício a ${label} por ${formatBRL(priceCents)}?`)) return;
    startTransition(async () => {
      setError(null);
      const r = await purchaseSpyingWithBalanceAction(platform);
      if (!r.ok) {
        setError(r.error);
      } else {
        window.location.reload();
      }
    });
  }

  function buyWithPix() {
    startTransition(async () => {
      setError(null);
      const r = await purchaseSpyingWithPixAction(platform);
      if (!r.ok) {
        setError("error" in r ? r.error : "Falha ao gerar PIX");
        return;
      }
      if ("pixCopyPaste" in r && r.pixCopyPaste) {
        setPixModal({
          pixCopyPaste: r.pixCopyPaste,
          pixQrCodeBase64: "pixQrCodeBase64" in r ? r.pixQrCodeBase64 : null,
        });
      }
    });
  }

  const accent =
    platform === "facebook"
      ? "from-blue-500/20 to-blue-700/10 border-blue-400/30"
      : "from-pink-500/20 to-pink-700/10 border-pink-400/30";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${accent} p-8`}
    >
      <div className="absolute -right-12 -top-12 size-48 rounded-full bg-white/5 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-white/10 inline-flex items-center justify-center">
            <Eye className="size-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-300">Acesso vitalício</p>
            <h2 className="text-xl font-bold text-white">Espionagem · {label}</h2>
          </div>
        </div>

        <div className="space-y-2 text-sm text-zinc-200 max-w-xl">
          <Feature text="Biblioteca curada de anúncios de alta performance" />
          <Feature text="Filtros por nicho, ângulo, mídia, longevidade" />
          <Feature text="Hook + copy + CTA detalhados para cada anúncio" />
          <Feature text="Acesso direto ao link da peça (quando disponível)" />
          <Feature text="Atualizações periódicas — novos anúncios toda semana" />
        </div>

        <div className="flex items-center gap-4 pt-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400">Investimento único</p>
            <p className="text-3xl font-bold text-white font-mono">{formatBRL(priceCents)}</p>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400">Seu saldo</p>
            <p
              className={`text-lg font-mono ${enoughBalance ? "text-cyan-300" : "text-zinc-500"}`}
            >
              {formatBRL(balanceCents)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={buyWithBalance}
            disabled={pending || !enoughBalance}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-sm font-bold text-black hover:bg-cyan-300 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wallet className="size-4" />
            )}
            Comprar com saldo
          </button>
          <button
            type="button"
            onClick={buyWithPix}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-5 py-2 text-sm font-bold text-white hover:bg-white/[0.12] disabled:opacity-40 border border-white/[0.10]"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <QrCode className="size-4" />
            )}
            Pagar com PIX
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {pixModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur p-4">
          <div className="max-w-md w-full rounded-2xl border border-white/[0.10] bg-zinc-950 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Pague para liberar acesso</h3>
            {pixModal.pixQrCodeBase64 && (
              <img
                src={
                  pixModal.pixQrCodeBase64.startsWith("data:")
                    ? pixModal.pixQrCodeBase64
                    : `data:image/png;base64,${pixModal.pixQrCodeBase64}`
                }
                alt="PIX QR Code"
                className="mx-auto rounded-lg bg-white p-2"
                width={220}
                height={220}
              />
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                Pix copia & cola
              </p>
              <textarea
                readOnly
                value={pixModal.pixCopyPaste}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="w-full text-[10px] font-mono text-zinc-300 bg-black border border-white/[0.08] rounded-lg p-2 h-20"
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              Assim que o pagamento for confirmado, o acesso será liberado automaticamente.
              Você pode fechar essa janela e voltar mais tarde.
            </p>
            <button
              type="button"
              onClick={() => setPixModal(null)}
              className="w-full rounded-lg border border-white/[0.10] py-2 text-sm text-zinc-300 hover:bg-white/[0.05]"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <p className="inline-flex items-start gap-2">
      <Sparkles className="size-4 text-fuchsia-300 mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

// ====================== SWIPE FILE ======================

function SwipeFile({ ads, platform }: { ads: Ad[]; platform: "facebook" | "tiktok" }) {
  const [q, setQ] = useState("");
  const [niche, setNiche] = useState<string>("all");
  const [angle, setAngle] = useState<string>("all");
  const [mediaType, setMediaType] = useState<string>("all");

  const niches = useMemo(
    () => uniqueSorted(ads.map((a) => a.niche)),
    [ads],
  );
  const angles = useMemo(
    () => uniqueSorted(ads.map((a) => a.angle)),
    [ads],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ads.filter((a) => {
      if (niche !== "all" && a.niche !== niche) return false;
      if (angle !== "all" && a.angle !== angle) return false;
      if (mediaType !== "all" && a.mediaType !== mediaType) return false;
      if (!needle) return true;
      return (
        a.title.toLowerCase().includes(needle) ||
        (a.brand ?? "").toLowerCase().includes(needle) ||
        (a.hookText ?? "").toLowerCase().includes(needle) ||
        (a.description ?? "").toLowerCase().includes(needle) ||
        a.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [ads, q, niche, angle, mediaType]);

  return (
    <div className="space-y-4">
      {/* Toolbar de filtros */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar marca, hook, copy, tag..."
            className="w-full bg-black/40 border border-white/[0.06] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/[0.20]"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Select value={niche} onChange={setNiche} options={["all", ...niches]} labelAll="Todos nichos" />
          <Select value={angle} onChange={setAngle} options={["all", ...angles]} labelAll="Todos ângulos" />
          <Select
            value={mediaType}
            onChange={setMediaType}
            options={["all", "video", "image", "carousel"]}
            labelAll="Todas mídias"
          />
          <span className="ml-auto text-zinc-500 self-center">
            {filtered.length} de {ads.length} anúncios
          </span>
        </div>
      </div>

      {/* Grid de cards */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 text-center">
          <Eye className="size-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">
            {ads.length === 0
              ? "A biblioteca está sendo populada. Volte em breve."
              : "Nenhum anúncio encontrado com esses filtros."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <AdCard key={a.id} ad={a} platform={platform} />
          ))}
        </div>
      )}
    </div>
  );
}

function uniqueSorted(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

function Select({
  value,
  onChange,
  options,
  labelAll,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labelAll: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-black/40 border border-white/[0.06] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/[0.20]"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o === "all" ? labelAll : capitalize(o)}
        </option>
      ))}
    </select>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function AdCard({ ad, platform }: { ad: Ad; platform: "facebook" | "tiktok" }) {
  const MediaIcon =
    ad.mediaType === "video" ? Film : ad.mediaType === "carousel" ? Layers : ImageIcon;

  return (
    <article className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden hover:border-white/[0.12] transition-colors">
      {/* Thumb */}
      <div className="aspect-video bg-gradient-to-br from-zinc-900 to-black relative overflow-hidden">
        {ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.thumbnailUrl}
            alt={ad.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <MediaIcon className="size-10 text-zinc-700" />
          </div>
        )}
        {ad.featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-yellow-500/90 text-black text-[10px] px-2 py-0.5 rounded-full font-bold">
            <Star className="size-3" /> Featured
          </span>
        )}
        <span
          className={`absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
            platform === "facebook"
              ? "bg-blue-500/90 text-white"
              : "bg-pink-500/90 text-white"
          }`}
        >
          <MediaIcon className="size-3" /> {ad.mediaType}
        </span>
      </div>

      <div className="p-4 space-y-2">
        <header>
          <h3 className="text-sm font-bold text-white line-clamp-1">{ad.title}</h3>
          {ad.brand && (
            <p className="text-[11px] text-zinc-500">{ad.brand}</p>
          )}
        </header>

        {ad.hookText && (
          <p className="text-xs text-zinc-300 italic line-clamp-2">
            “{ad.hookText}”
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          <Tag label={ad.niche} tone="emerald" />
          <Tag label={ad.angle.replace(/_/g, " ")} tone="violet" />
          {ad.country && <Tag label={ad.country} tone="zinc" />}
          {ad.estimatedSpend && (
            <Tag label={ad.estimatedSpend} tone="amber" />
          )}
          {ad.daysRunning != null && (
            <Tag label={`${ad.daysRunning}d`} tone="cyan" />
          )}
        </div>

        {ad.description && (
          <p className="text-[11px] text-zinc-400 line-clamp-3">
            {ad.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
          {ad.cta && (
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              CTA: <span className="text-zinc-300">{ad.cta}</span>
            </span>
          )}
          {ad.mediaUrl && (
            <a
              href={ad.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300 hover:text-fuchsia-200"
            >
              Ver anúncio <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

const TONES = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  zinc: "bg-zinc-500/15 text-zinc-300 border-zinc-500/20",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/20",
} as const;

function Tag({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${TONES[tone]}`}
    >
      {label}
    </span>
  );
}
