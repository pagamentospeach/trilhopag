import Link from "next/link";
import { GraduationCap, Plus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { DeleteRowButton } from "@/components/dashboard/delete-row-button";
import { deleteMemberArea } from "./actions";

export default async function MembrosPage() {
  const userId = await requireUserId();
  const areas = await prisma.memberArea.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { courses: true, members: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-400 mb-1">
            Entrega digital
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Áreas de Membros
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Crie áreas estilo Netflix totalmente personalizáveis. Cada compra de
            produto vinculado libera acesso automático.
          </p>
        </div>
        <Link
          href="/dashboard/membros/novo"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-cyan-300 transition shadow-lg shadow-cyan-400/20"
        >
          <Plus className="size-4" /> Nova área
        </Link>
      </div>

      {areas.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <GraduationCap className="mx-auto size-10 text-zinc-600" />
          <p className="mt-4 text-base font-semibold text-white">
            Nenhuma área de membros ainda
          </p>
          <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
            Crie uma área pra entregar seu curso, mentoria ou treinamento.
            Layout Netflix, drip por dias, certificados e tudo mais.
          </p>
          <Link
            href="/dashboard/membros/novo"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300"
          >
            <Plus className="size-3.5" /> Criar primeira área
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => (
            <div
              key={a.id}
              className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden hover:border-cyan-400/30 transition relative"
            >
              <div className="absolute top-3 right-3 z-10">
                <DeleteRowButton
                  onDelete={deleteMemberArea.bind(null, a.id)}
                  confirmMessage={`Apagar área "${a.name}"?\n\nIsso vai apagar cursos, módulos, aulas, progresso dos alunos e revogar acesso de todos. Ação irreversível.`}
                  className="inline-flex size-8 items-center justify-center rounded-md bg-black/70 backdrop-blur-sm text-white/80 hover:bg-red-500/80 hover:text-white transition disabled:opacity-50"
                />
              </div>
              <Link href={`/dashboard/membros/${a.id}`} className="block">
                <div
                  className="aspect-video relative overflow-hidden"
                  style={{
                    background: a.heroImageUrl
                      ? `url(${a.heroImageUrl})`
                      : `linear-gradient(135deg, ${a.primaryColor}, ${a.accentColor})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-base font-bold text-white truncate">
                      {a.name}
                    </p>
                    {a.heroTagline && (
                      <p className="text-[11px] text-white/80 truncate">
                        {a.heroTagline}
                      </p>
                    )}
                  </div>
                  {!a.active && (
                    <span className="absolute top-3 left-3 rounded-md bg-red-500/80 px-2 py-0.5 text-[10px] font-medium text-white">
                      Inativa
                    </span>
                  )}
                </div>
                <div className="p-4 flex items-center justify-between text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="size-3.5" />
                    {a._count.courses} cursos
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" />
                    {a._count.members} alunos
                  </span>
                  <span className="text-zinc-500 inline-flex items-center gap-1">
                    /m/{a.slug}
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
