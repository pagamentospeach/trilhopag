import Link from "next/link";
import { Video, Plus, Play, MousePointerClick, Eye } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { DeleteRowButton } from "@/components/dashboard/delete-row-button";
import { deleteBturbVideo } from "./actions";

export default async function BturbPage() {
  const userId = await requireUserId();
  const videos = await prisma.bturbVideo.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      videoUrl: true,
      thumbnailUrl: true,
      durationSeconds: true,
      views: true,
      plays: true,
      ctaClicks: true,
      active: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Hospedagem VSL
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Hospede vídeos VSL com player otimizado pra conversão, tracking
            ponta-a-ponta e CTAs sincronizados.
          </p>
        </div>
        <Link
          href="/dashboard/bturb/novo"
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 transition"
        >
          <Plus className="size-3.5" />
          Novo vídeo
        </Link>
      </div>

      {videos.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <Video className="mx-auto size-10 text-zinc-600" />
          <p className="mt-4 text-base font-semibold text-white">
            Você ainda não subiu nenhum vídeo
          </p>
          <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
            Suba sua VSL ou vídeo de venda. Nosso player tem smart autoplay,
            barra fake, CTA sincronizado, proteção contra download e tracking
            até a venda.
          </p>
          <Link
            href="/dashboard/bturb/novo"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300"
          >
            <Plus className="size-3.5" /> Subir primeiro vídeo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <div
              key={v.id}
              className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden hover:border-cyan-400/30 transition"
            >
              <Link href={`/dashboard/bturb/${v.id}`} className="block">
                <div className="aspect-video bg-black relative overflow-hidden">
                  {v.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="size-10 text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Play className="size-10 text-white fill-white" />
                  </div>
                  {v.durationSeconds && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-mono text-white">
                      {formatDuration(v.durationSeconds)}
                    </span>
                  )}
                  {!v.active && (
                    <span className="absolute top-2 left-2 rounded-md bg-red-500/80 px-2 py-0.5 text-[10px] font-medium text-white">
                      Inativo
                    </span>
                  )}
                </div>
              </Link>
              <div className="p-4 flex items-start justify-between gap-3">
                <Link
                  href={`/dashboard/bturb/${v.id}`}
                  className="min-w-0 flex-1 group/title"
                >
                  <p className="text-sm font-semibold text-white truncate group-hover/title:text-cyan-300">
                    {v.title}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-[11px] text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3" /> {v.views}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Play className="size-3" /> {v.plays}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MousePointerClick className="size-3" /> {v.ctaClicks}
                    </span>
                  </div>
                </Link>
                <DeleteRowButton
                  onDelete={deleteBturbVideo.bind(null, v.id)}
                  confirmMessage={`Apagar vídeo "${v.title}"?\n\nIsso vai apagar o arquivo + todos os eventos de tracking.`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
