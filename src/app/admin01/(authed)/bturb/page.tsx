import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminBturb({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();

  const rows = await prisma.bturbVideo.findMany({
    where: q
      ? { title: { contains: q, mode: "insensitive" } }
      : {},
    select: {
      id: true,
      title: true,
      durationSeconds: true,
      sizeBytes: true,
      plays: true,
      views: true,
      ctaClicks: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  function fmtDuration(s?: number | null) {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }
  function fmtBytes(b?: number | null) {
    if (!b) return "—";
    if (b < 1024) return `${b}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)}MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  }

  return (
    <div className="space-y-4 max-w-7xl">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-red-400">Admin · Bturb</p>
        <h1 className="text-3xl font-bold text-white mt-1">Vídeos VSL de todos os usuários</h1>
        <p className="text-sm text-zinc-400">{rows.length} vídeo(s).</p>
      </header>

      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por título ou slug..."
          className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-zinc-200"
        />
        <button className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.1]">
          Buscar
        </button>
      </form>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-12 gap-3 border-b border-white/[0.06] bg-black/30 px-5 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="col-span-4">Vídeo</span>
          <span className="col-span-3">Owner</span>
          <span className="col-span-1 text-right">Dur</span>
          <span className="col-span-1 text-right">Tamanho</span>
          <span className="col-span-1 text-right">Views</span>
          <span className="col-span-1 text-right">Plays</span>
          <span className="col-span-1 text-right">Data</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">Nenhum vídeo.</p>
        ) : (
          rows.map((v) => (
            <div
              key={v.id}
              className="grid grid-cols-12 gap-3 border-b border-white/[0.04] px-5 py-2.5 text-sm hover:bg-white/[0.02]"
            >
              <div className="col-span-4 min-w-0">
                <p className="text-white truncate">{v.title}</p>
                <p className="text-[10px] text-zinc-500 font-mono truncate">{v.id}</p>
              </div>
              <Link
                href={`/admin01/users/${v.user.id}`}
                className="col-span-3 min-w-0 hover:text-cyan-300"
              >
                <p className="text-zinc-200 text-xs truncate">{v.user.name ?? v.user.email}</p>
                <p className="text-[10px] text-zinc-500 truncate">{v.user.email}</p>
              </Link>
              <span className="col-span-1 text-right text-xs text-zinc-400 tabular-nums">
                {fmtDuration(v.durationSeconds)}
              </span>
              <span className="col-span-1 text-right text-xs text-zinc-400 tabular-nums">
                {fmtBytes(v.sizeBytes)}
              </span>
              <span className="col-span-1 text-right text-xs text-zinc-300 tabular-nums">
                {v.views}
              </span>
              <span className="col-span-1 text-right text-xs text-cyan-300 tabular-nums">
                {v.plays}
              </span>
              <span className="col-span-1 text-right text-[10px] text-zinc-500">
                {new Date(v.createdAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
