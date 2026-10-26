import Link from "next/link";
import {
  Shield,
  Plus,
  Eye,
  CheckCircle2,
  XCircle,
  Globe,
  AlertTriangle,
  ShieldCheck,
  FileVideo,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { cn } from "@/lib/utils";
import { DeleteRowButton } from "@/components/dashboard/delete-row-button";
import { deleteCloakerCampaign } from "./actions";
import { listVerifiedDomainsForFeature } from "@/lib/custom-host";
import { isPlatformHost } from "@/lib/platform-domains";
import { VideoCamuflagemClient } from "../video-camuflagem/client";
import { ImageCamuflagemClient } from "./image-client";

type Tab = "site" | "video" | "imagem";

export default async function CamuflagensPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const tab: Tab =
    sp.tab === "video" ? "video" : sp.tab === "imagem" ? "imagem" : "site";

  // Busca só o que a aba ativa precisa.
  const [siteData, videoHistory] = await Promise.all([
    tab === "site"
      ? Promise.all([
          prisma.cloakerCampaign.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              slug: true,
              whiteUrl: true,
              moneyUrl: true,
              active: true,
              totalRequests: true,
              passedToMoney: true,
              sentToWhite: true,
              createdAt: true,
              customDomain: {
                select: { domain: true, status: true, useCloaker: true },
              },
            },
          }),
          listVerifiedDomainsForFeature(userId, "useCloaker"),
        ])
      : Promise.resolve(null),
    tab === "video"
      ? prisma.videoCamuflagem.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            preset: true,
            status: true,
            sizeBytes: true,
            createdAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const tabs: { key: Tab; label: string; icon: typeof Shield }[] = [
    { key: "site", label: "Site", icon: Shield },
    { key: "video", label: "Vídeo", icon: FileVideo },
    { key: "imagem", label: "Imagem", icon: ImageIcon },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Camuflagens
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Camufla criativos e ofertas pra proteger suas contas de anúncio:
          cloaker de <strong className="text-zinc-300">site</strong>,{" "}
          <strong className="text-zinc-300">vídeo</strong> e{" "}
          <strong className="text-zinc-300">imagem</strong>.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/dashboard/cloaker?tab=${t.key}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                active
                  ? "border-cyan-400/50 bg-cyan-400/[0.08] text-cyan-300"
                  : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              <Icon className="size-4" /> {t.label}
            </Link>
          );
        })}
      </div>

      {/* ============ SITE (cloaker de URL: white vs money) ============ */}
      {tab === "site" && siteData && (
        <SiteCloaker
          campaigns={siteData[0]}
          hasUsableDomain={siteData[1].length > 0}
        />
      )}

      {/* ============ VÍDEO (limpa metadata + filtro sutil via ffmpeg) ============ */}
      {tab === "video" && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-400">
            Limpa metadados, aplica filtros sutis e ajusta a assinatura digital
            do vídeo pra ajudar na aprovação em plataformas de anúncios.{" "}
            <strong className="text-zinc-300">Sem perda de qualidade.</strong>
          </p>
          <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/[0.04] p-4 text-xs text-yellow-100/90">
            ⚠️ <strong>Uso por sua conta e risco.</strong> Esta ferramenta apenas
            prepara o arquivo — o conteúdo precisa estar dentro das políticas das
            plataformas. Não fazemos milagre nem garantimos aprovação.
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={ShieldCheck}
              title="Metadados limpos"
              desc="Remove EXIF, GPS, software de origem, datas e qualquer rastro do arquivo original."
            />
            <FeatureCard
              icon={Sparkles}
              title="Filtro inteligente"
              desc="Brilho +2%, contraste +2%, saturação +5% e ajuste fino — invisível pra você, suficiente pro detector."
            />
            <FeatureCard
              icon={FileVideo}
              title="Qualidade preservada"
              desc="CRF 20 (visualmente lossless), preset fast, áudio 128 kbps."
            />
          </div>
          <VideoCamuflagemClient history={videoHistory ?? []} />
        </div>
      )}

      {/* ============ IMAGEM (strip EXIF + filtro sutil via canvas) ============ */}
      {tab === "imagem" && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-400">
            Limpa metadados e aplica um filtro sutil na imagem pra mudar a
            assinatura digital do criativo e ajudar na aprovação em plataformas
            de anúncios.{" "}
            <strong className="text-zinc-300">Sem perda de qualidade.</strong>
          </p>
          <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/[0.04] p-4 text-xs text-yellow-100/90">
            ⚠️ <strong>Uso por sua conta e risco.</strong> Esta ferramenta apenas
            prepara o arquivo — o conteúdo precisa estar dentro das políticas das
            plataformas. Não fazemos milagre nem garantimos aprovação.
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={ShieldCheck}
              title="Metadados limpos"
              desc="Remove EXIF, GPS, modelo de câmera, datas e qualquer rastro do arquivo original."
            />
            <FeatureCard
              icon={Sparkles}
              title="Filtro inteligente"
              desc="Brilho, contraste, saturação e hue ajustados sutilmente — invisível pra você, suficiente pro detector."
            />
            <FeatureCard
              icon={ImageIcon}
              title="Qualidade preservada"
              desc="Re-encode em alta qualidade (JPG 95% ou PNG), direto no seu navegador. Zero upload."
            />
          </div>
          <ImageCamuflagemClient />
        </div>
      )}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Shield;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <Icon className="size-5 text-cyan-400" />
      <h3 className="mt-2 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-[11px] text-zinc-400">{desc}</p>
    </div>
  );
}

type Campaign = {
  id: string;
  name: string;
  slug: string;
  whiteUrl: string;
  moneyUrl: string;
  active: boolean;
  totalRequests: number;
  passedToMoney: number;
  sentToWhite: number;
  createdAt: Date;
  customDomain: { domain: string; status: string; useCloaker: boolean } | null;
};

function SiteCloaker({
  campaigns,
  hasUsableDomain,
}: {
  campaigns: Campaign[];
  hasUsableDomain: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Camada de proteção entre seu anúncio e a oferta. Filtra bots,
          moderadores, datacenters e países pra proteger sua conta de ads.
        </p>
        {hasUsableDomain ? (
          <Link
            href="/dashboard/cloaker/novo"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 transition"
          >
            <Plus className="size-3.5" /> Nova campanha
          </Link>
        ) : (
          <Link
            href="/dashboard/dominios"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-300 transition"
          >
            <Globe className="size-3.5" /> Cadastrar domínio próprio
          </Link>
        )}
      </div>

      {/* Avisos */}
      <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/[0.04] p-4 text-xs text-yellow-100/90">
        ⚠️ <strong>Use com responsabilidade.</strong> Cloaking pode violar termos
        de uso de plataformas de anúncio. As Camuflagens fornecem a ferramenta —
        o uso é por sua conta e risco.
      </div>

      {/* Sem domínio próprio cadastrado: bloqueia uso */}
      {!hasUsableDomain && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-300 mt-0.5 shrink-0" />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-amber-100">
                  Cadastre um domínio próprio antes de criar campanhas
                </p>
                <p className="text-xs text-amber-100/80 mt-1">
                  O link do cloaker <strong>nunca</strong> pode ficar no domínio
                  da Trilho — se ele for parar no anúncio, marca a plataforma
                  inteira. Use um domínio seu (ex: <code>go.suamarca.com</code>)
                  cadastrado e verificado.
                </p>
              </div>
              <Link
                href="/dashboard/dominios"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 transition"
              >
                <Globe className="size-3.5" /> Ir pra Domínios
              </Link>
            </div>
          </div>
        </div>
      )}

      {campaigns.length === 0 ? (
        hasUsableDomain && (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
            <Shield className="mx-auto size-10 text-zinc-600" />
            <p className="mt-4 text-base font-semibold text-white">
              Nenhuma campanha cloaker ainda
            </p>
            <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
              Crie uma campanha pra começar. Você define uma URL{" "}
              <strong>white</strong> (segura, mostrada pra bots/moderadores) e uma{" "}
              <strong>money</strong> (oferta real, mostrada pro tráfego pago).
            </p>
            <Link
              href="/dashboard/cloaker/novo"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300"
            >
              <Plus className="size-3.5" /> Criar primeira campanha
            </Link>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const passRate =
              c.totalRequests > 0
                ? ((c.passedToMoney / c.totalRequests) * 100).toFixed(1)
                : "—";
            const domainOk =
              !!c.customDomain &&
              c.customDomain.status === "verified" &&
              c.customDomain.useCloaker &&
              !isPlatformHost(c.customDomain.domain);
            const url = domainOk
              ? `https://${c.customDomain!.domain}/cl/${c.slug}`
              : "Domínio próprio não configurado";
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-cyan-400/30 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <Link
                    href={`/dashboard/cloaker/${c.id}`}
                    className="min-w-0 flex-1 group"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="size-4 text-zinc-400" />
                      <p className="text-base font-semibold text-white group-hover:text-cyan-300 transition">
                        {c.name}
                      </p>
                      {c.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                          <CheckCircle2 className="size-3" /> Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-600/15 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                          <XCircle className="size-3" /> Pausada
                        </span>
                      )}
                      {!domainOk && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                          <AlertTriangle className="size-3" /> Sem domínio
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[11px] font-mono mt-2 truncate ${
                        domainOk ? "text-cyan-300" : "text-amber-300"
                      }`}
                    >
                      {url}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                      <div className="truncate">
                        🟢 Money:{" "}
                        <span className="text-zinc-300">{c.moneyUrl}</span>
                      </div>
                      <div className="truncate">
                        ⚪ White:{" "}
                        <span className="text-zinc-300">{c.whiteUrl}</span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-start gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-zinc-500">
                        Taxa de pass
                      </p>
                      <p className="text-xl font-semibold text-white tabular-nums">
                        {passRate}%
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-1 inline-flex items-center gap-1">
                        <Eye className="size-3" /> {c.totalRequests} hits
                      </p>
                    </div>
                    <DeleteRowButton
                      onDelete={deleteCloakerCampaign.bind(null, c.id)}
                      confirmMessage={`Apagar cloaker "${c.name}"?\n\nIsso vai apagar a campanha e todo o histórico de hits.`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
