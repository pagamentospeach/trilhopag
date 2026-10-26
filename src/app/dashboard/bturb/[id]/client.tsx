"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  Loader2,
  Copy,
  Check,
  Trash2,
  Eye,
  Play,
  MousePointerClick,
  RefreshCw,
  ChevronLeft,
  Globe,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  updateBturbVideo,
  deleteBturbVideo,
  regenerateConversionKey,
} from "../actions";
import { BturbPlayer } from "@/components/bturb-player";

type DomainOption = { id: string; domain: string };

type Video = {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  thumbnailPauseUrl: string | null;
  thumbnailEndUrl: string | null;
  smartAutoplay: boolean;
  autoplayMuted: boolean;
  silentAutoplay: boolean;
  turboSpeed: boolean;
  showProgress: boolean;
  fakeProgressBar: boolean;
  fakeProgressTotalSeconds: number | null;
  loop: boolean;
  hideControls: boolean;
  blockRightClick: boolean;
  downloadProtection: boolean;
  primaryColor: string;
  ctaDelaySeconds: number | null;
  ctaText: string | null;
  ctaUrl: string | null;
  ctaPlacement: string;
  ctaCustomHtml: string | null;
  fbPixelId: string | null;
  tiktokPixelId: string | null;
  conversionKey: string | null;
  views: number;
  plays: number;
  ctaClicks: number;
  active: boolean;
  createdAt: string;
  customDomainId: string | null;
  customDomain: { id: string; domain: string; valid: boolean } | null;
};

export function BturbVideoEditor({
  video: initial,
  availableDomains,
}: {
  video: Video;
  availableDomains: DomainOption[];
}) {
  const router = useRouter();
  const [v, setV] = useState<Video>(initial);
  const [isPending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "player" | "cta" | "pixels" | "embed" | "stats"
  >("player");
  /**
   * Force-remount key do player no preview.
   * Quando mudam props "estruturais" (videoUrl, loop, smartAutoplay,
   * thumbnails), remontar é mais simples e seguro que tentar reconciliar
   * o estado interno do <video>. Outras config (cor, CTA text, progresso)
   * já reagem via useEffect dentro do BturbPlayer.
   */
  const playerKey = useMemo(
    () =>
      [
        v.videoUrl,
        v.loop,
        v.smartAutoplay,
        v.autoplayMuted,
        v.silentAutoplay,
        v.hideControls,
        v.thumbnailUrl,
        v.thumbnailPauseUrl,
        v.thumbnailEndUrl,
      ].join("|"),
    [
      v.videoUrl,
      v.loop,
      v.smartAutoplay,
      v.autoplayMuted,
      v.silentAutoplay,
      v.hideControls,
      v.thumbnailUrl,
      v.thumbnailPauseUrl,
      v.thumbnailEndUrl,
    ],
  );

  function update<K extends keyof Video>(k: K, val: Video[K]) {
    setV((s) => ({ ...s, [k]: val }));
  }

  function save() {
    setSavedMsg(null);
    setSaveErr(null);
    startTransition(async () => {
      const r = await updateBturbVideo({
        id: v.id,
        title: v.title,
        description: v.description,
        smartAutoplay: v.smartAutoplay,
        autoplayMuted: v.autoplayMuted,
        silentAutoplay: v.silentAutoplay,
        turboSpeed: v.turboSpeed,
        showProgress: v.showProgress,
        fakeProgressBar: v.fakeProgressBar,
        fakeProgressTotalSeconds: v.fakeProgressTotalSeconds,
        loop: v.loop,
        hideControls: v.hideControls,
        blockRightClick: v.blockRightClick,
        downloadProtection: v.downloadProtection,
        primaryColor: v.primaryColor,
        thumbnailUrl: v.thumbnailUrl,
        thumbnailPauseUrl: v.thumbnailPauseUrl,
        thumbnailEndUrl: v.thumbnailEndUrl,
        ctaDelaySeconds: v.ctaDelaySeconds,
        ctaText: v.ctaText,
        ctaUrl: v.ctaUrl,
        ctaPlacement: v.ctaPlacement as "below" | "overlay",
        ctaCustomHtml: v.ctaCustomHtml,
        fbPixelId: v.fbPixelId,
        tiktokPixelId: v.tiktokPixelId,
        active: v.active,
        customDomainId: v.customDomainId ?? undefined,
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
    if (!confirm("Apagar este vídeo? Não dá pra desfazer.")) return;
    startTransition(async () => {
      const r = await deleteBturbVideo(v.id);
      if (r.ok) router.push("/dashboard/bturb");
    });
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link
        href="/dashboard/bturb"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
      >
        <ChevronLeft className="size-3" /> Voltar pros vídeos
      </Link>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <input
            value={v.title}
            onChange={(e) => update("title", e.target.value)}
            className="bg-transparent text-2xl font-semibold text-white outline-none border-b border-transparent hover:border-white/[0.06] focus:border-cyan-400 transition w-full max-w-md"
          />
          <p className="text-[11px] text-zinc-500 mt-1 font-mono">
            ID: {v.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={v.active}
              onChange={(e) => update("active", e.target.checked)}
              className="size-4 rounded border-white/[0.12] bg-white/[0.04] text-cyan-400 focus:ring-cyan-400/40"
            />
            Ativo
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

      {/* Stats compactas */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Eye} label="Views" value={v.views} />
        <StatCard icon={Play} label="Plays" value={v.plays} />
        <StatCard icon={MousePointerClick} label="Cliques CTA" value={v.ctaClicks} />
      </div>

      {saveErr && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-200 inline-flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          {saveErr}
        </div>
      )}

      {/* Domínio próprio + URLs */}
      <DomainPicker
        currentId={v.customDomainId}
        currentDomain={v.customDomain}
        availableDomains={availableDomains}
        videoId={v.id}
        onChange={(id, dom) => {
          update("customDomainId", id);
          update(
            "customDomain",
            dom ? { id: dom.id, domain: dom.domain, valid: true } : null,
          );
        }}
      />

      {/* Preview do vídeo — usa o BturbPlayer EM TEMPO REAL com as
          configurações que o user está editando. Sem analytics, sem
          navegação de CTA, com badge de "TURBO 1.25x" e libera right click. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-cyan-300" />
          <p className="text-xs font-medium text-zinc-300">
            Preview ao vivo · todas as funções aplicadas em tempo real
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-black overflow-hidden aspect-video relative">
          <BturbPlayer key={playerKey} video={v} previewMode />
        </div>
        <p className="text-[11px] text-zinc-500">
          As features (autoplay, fake progress, hide controls, CTA, thumbs,
          turbo, mute, etc) refletem em tempo real conforme você ajusta os
          toggles abaixo. Tracking e pixels FB/TT só rodam na URL pública.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] overflow-x-auto">
        {(
          [
            { key: "player", label: "Player" },
            { key: "cta", label: "CTA" },
            { key: "pixels", label: "Pixels" },
            { key: "embed", label: "Embed" },
            { key: "stats", label: "Estatísticas" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === t.key
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "player" && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
          <SectionTitle>Reprodução</SectionTitle>
          <ToggleRow
            label="Smart Autoplay"
            help="Inicia o vídeo automaticamente quando entra na viewport."
            checked={v.smartAutoplay}
            onChange={(c) => update("smartAutoplay", c)}
          />
          <ToggleRow
            label="Autoplay silencioso (mudo)"
            help="Inicia sem som — contorna restrições de browser."
            checked={v.autoplayMuted}
            onChange={(c) => update("autoplayMuted", c)}
          />
          <ToggleRow
            label="Prompt 'click to unmute'"
            help="Mostra overlay sugerindo desmutar."
            checked={v.silentAutoplay}
            onChange={(c) => update("silentAutoplay", c)}
          />
          <ToggleRow
            label="Velocidade Turbo (1.25x)"
            help="Player roda a 1.25x até primeira interação do user."
            checked={v.turboSpeed}
            onChange={(c) => update("turboSpeed", c)}
          />
          <ToggleRow
            label="Loop infinito"
            checked={v.loop}
            onChange={(c) => update("loop", c)}
          />

          <SectionTitle>Barra de progresso</SectionTitle>
          <ToggleRow
            label="Mostrar barra de progresso real"
            checked={v.showProgress}
            onChange={(c) => update("showProgress", c)}
          />
          <ToggleRow
            label="Barra fake (otimização VSL)"
            help="Barra de progresso 'engana' a percepção pra reter mais."
            checked={v.fakeProgressBar}
            onChange={(c) => update("fakeProgressBar", c)}
          />
          {v.fakeProgressBar && (
            <NumberRow
              label="Duração visual da barra fake (segundos)"
              value={v.fakeProgressTotalSeconds}
              onChange={(n) => update("fakeProgressTotalSeconds", n)}
              placeholder="Ex: 600"
            />
          )}

          <SectionTitle>Proteção</SectionTitle>
          <ToggleRow
            label="Esconder controles do player"
            checked={v.hideControls}
            onChange={(c) => update("hideControls", c)}
          />
          <ToggleRow
            label="Bloquear clique direito"
            checked={v.blockRightClick}
            onChange={(c) => update("blockRightClick", c)}
          />
          <ToggleRow
            label="Proteção contra download"
            help="Ofusca URL e dificulta inspect."
            checked={v.downloadProtection}
            onChange={(c) => update("downloadProtection", c)}
          />

          <SectionTitle>Aparência</SectionTitle>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Cor primária</label>
            <input
              type="color"
              value={v.primaryColor}
              onChange={(e) => update("primaryColor", e.target.value)}
              className="size-10 rounded-md cursor-pointer bg-transparent border border-white/[0.08]"
            />
            <input
              type="text"
              value={v.primaryColor}
              onChange={(e) => update("primaryColor", e.target.value)}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-white w-28 font-mono"
            />
          </div>

          <SectionTitle>Thumbnails</SectionTitle>
          <UrlRow
            label="Thumbnail inicial (poster)"
            value={v.thumbnailUrl}
            onChange={(s) => update("thumbnailUrl", s)}
          />
          <UrlRow
            label="Thumbnail ao pausar"
            value={v.thumbnailPauseUrl}
            onChange={(s) => update("thumbnailPauseUrl", s)}
          />
          <UrlRow
            label="Thumbnail no fim do vídeo"
            value={v.thumbnailEndUrl}
            onChange={(s) => update("thumbnailEndUrl", s)}
          />
        </div>
      )}

      {activeTab === "cta" && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
          <SectionTitle>Call-to-Action</SectionTitle>
          <NumberRow
            label="Mostrar CTA depois de (segundos)"
            help="Ex: 300 = aparece aos 5min do vídeo"
            value={v.ctaDelaySeconds}
            onChange={(n) => update("ctaDelaySeconds", n)}
            placeholder="0 = imediato"
          />
          <TextRow
            label="Texto do botão"
            value={v.ctaText ?? ""}
            onChange={(s) => update("ctaText", s || null)}
            placeholder="QUERO GARANTIR MINHA VAGA →"
          />
          <UrlRow
            label="URL de destino (checkout)"
            value={v.ctaUrl}
            onChange={(s) => update("ctaUrl", s)}
            placeholder="https://trilhopag.com/c/seu-checkout"
          />
          <div>
            <label className="block text-xs text-zinc-400 mb-2">
              Posicionamento
            </label>
            <select
              value={v.ctaPlacement}
              onChange={(e) => update("ctaPlacement", e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white"
            >
              <option value="below">Abaixo do vídeo</option>
              <option value="overlay">Sobreposto (overlay)</option>
            </select>
          </div>
          <SectionTitle>HTML customizado (opcional)</SectionTitle>
          <p className="text-[11px] text-zinc-500 -mt-3">
            Se preenchido, substitui o botão padrão. Suporta qualquer HTML.
          </p>
          <textarea
            value={v.ctaCustomHtml ?? ""}
            onChange={(e) => update("ctaCustomHtml", e.target.value || null)}
            rows={4}
            placeholder="<a href='...' class='...'>Botão personalizado</a>"
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
        </div>
      )}

      {activeTab === "pixels" && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
          <SectionTitle>Pixels de tracking</SectionTitle>
          <TextRow
            label="Facebook Pixel ID"
            value={v.fbPixelId ?? ""}
            onChange={(s) => update("fbPixelId", s || null)}
            placeholder="123456789012345"
          />
          <TextRow
            label="TikTok Pixel ID"
            value={v.tiktokPixelId ?? ""}
            onChange={(s) => update("tiktokPixelId", s || null)}
            placeholder="CXXXXXXXXXXXXXXXX"
          />
          <SectionTitle>Conversion Key</SectionTitle>
          <p className="text-[11px] text-zinc-500 -mt-3">
            Chave única que liga a venda no checkout ao play do vídeo.
            Cole no parâmetro <code>bturb_key</code> da URL do CTA.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-cyan-300 font-mono break-all">
              {v.conversionKey ?? "—"}
            </code>
            <RegenButton videoId={v.id} onDone={() => router.refresh()} />
          </div>
        </div>
      )}

      {activeTab === "embed" && <EmbedTab video={v} />}

      {activeTab === "stats" && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
          <SectionTitle>Estatísticas</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Eye} label="Views totais" value={v.views} />
            <StatCard icon={Play} label="Plays" value={v.plays} />
            <StatCard
              icon={MousePointerClick}
              label="Cliques no CTA"
              value={v.ctaClicks}
            />
            <StatCard
              icon={Eye}
              label="Taxa de play"
              value={
                v.views > 0
                  ? `${((v.plays / v.views) * 100).toFixed(1)}%`
                  : "—"
              }
            />
          </div>
          <p className="text-xs text-zinc-500 pt-4">
            Mais métricas de retenção, audiência por minuto e correlação
            com vendas chegam em breve.
          </p>
        </div>
      )}
    </div>
  );
}

function RegenButton({
  videoId,
  onDone,
}: {
  videoId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        if (!confirm("Gerar nova conversion key? A antiga vai parar de funcionar."))
          return;
        startTransition(async () => {
          await regenerateConversionKey(videoId);
          onDone();
        });
      }}
      disabled={isPending}
      className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
      title="Gerar nova"
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
    </button>
  );
}

function EmbedTab({ video }: { video: Video }) {
  const [copied, setCopied] = useState<string | null>(null);

  const domainOk = !!video.customDomain?.valid;
  const host = domainOk ? video.customDomain!.domain : null;

  function copy(key: string, txt: string) {
    navigator.clipboard.writeText(txt);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!host) {
    return (
      <div className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-6 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-100">
              Configure um domínio próprio antes de embedar
            </p>
            <p className="mt-1 text-xs text-amber-100/80">
              O embed do vídeo nunca pode usar <code>trilhopag.com</code>{" "}
              — senão a plataforma de anúncio marca o domínio do gateway. Use
              um subdomínio seu (ex: <code>vsl.suamarca.com</code>) na aba
              acima.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/dominios"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 transition"
        >
          <Globe className="size-3.5" /> Cadastrar/gerenciar domínios
        </Link>
      </div>
    );
  }

  const iframeUrl = `https://${host}/v/${video.id}`;
  const iframeCode = `<iframe src="${iframeUrl}" width="100%" height="auto" style="aspect-ratio:16/9;border:0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  const scriptCode = `<div data-bturb="${video.id}"></div>\n<script src="https://${host}/scripts/bturb-player.js" async defer></script>`;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
      <p className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.05] p-3 text-[11px] text-cyan-200">
        <Globe className="inline size-3 mr-1" />
        Embeds servidos via <strong className="font-mono">{host}</strong>.
      </p>
      <SectionTitle>Embed via iframe (mais simples)</SectionTitle>
      <CodeBlock
        code={iframeCode}
        copied={copied === "iframe"}
        onCopy={() => copy("iframe", iframeCode)}
      />
      <SectionTitle>Embed via script (recomendado)</SectionTitle>
      <p className="text-[11px] text-zinc-500 -mt-3">
        Carrega o player nativo (mais leve e compatível com Elementor /
        construtores de página).
      </p>
      <CodeBlock
        code={scriptCode}
        copied={copied === "script"}
        onCopy={() => copy("script", scriptCode)}
      />
    </div>
  );
}

function DomainPicker({
  currentId,
  currentDomain,
  availableDomains,
  videoId,
  onChange,
}: {
  currentId: string | null;
  currentDomain: { id: string; domain: string; valid: boolean } | null;
  availableDomains: DomainOption[];
  videoId: string;
  onChange: (id: string | null, dom: DomainOption | null) => void;
}) {
  const domainOk = !!currentDomain?.valid;
  const embedUrl = domainOk
    ? `https://${currentDomain!.domain}/v/${videoId}`
    : "";

  return (
    <div
      className={`rounded-2xl border p-5 space-y-3 ${
        domainOk
          ? "border-cyan-400/30 bg-cyan-400/[0.04]"
          : "border-amber-400/40 bg-amber-400/[0.06]"
      }`}
    >
      <div>
        <p className="text-xs text-zinc-400 mb-2 inline-flex items-center gap-1">
          <Globe className="size-3" /> Domínio próprio do embed (sai no anúncio)
        </p>
        {availableDomains.length > 0 ? (
          <select
            value={currentId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              const dom =
                availableDomains.find((d) => d.id === id) ?? null;
              onChange(id, dom);
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
            Nenhum domínio próprio verificado com Bturb ativo.{" "}
            <Link
              href="/dashboard/dominios"
              className="underline font-semibold"
            >
              Cadastrar
            </Link>
          </div>
        )}
      </div>
      {domainOk && (
        <p className="text-[11px] text-zinc-500">
          URL pública do embed:{" "}
          <code className="text-cyan-300">{embedUrl}</code>
        </p>
      )}
    </div>
  );
}

function CodeBlock({
  code,
  copied,
  onCopy,
}: {
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="relative rounded-lg border border-white/[0.08] bg-black/40">
      <pre className="px-4 py-3 text-xs text-zinc-200 font-mono overflow-x-auto whitespace-pre-wrap break-all pr-12">
        {code}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className={`absolute top-2 right-2 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
          copied
            ? "bg-cyan-400 text-black"
            : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12]"
        }`}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-zinc-400" />
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-xl font-semibold text-white tabular-nums">
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

function NumberRow({
  label,
  help,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  help?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      {help && <p className="text-[11px] text-zinc-500 mb-2">{help}</p>}
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? null : Number(e.target.value);
          onChange(Number.isFinite(n as number) ? (n as number) : null);
        }}
        placeholder={placeholder}
        className="w-32 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      />
    </div>
  );
}

function TextRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      />
    </div>
  );
}

function UrlRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (s: string | null) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-2">{label}</label>
      <input
        type="url"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder ?? "https://..."}
        className="w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      />
    </div>
  );
}
