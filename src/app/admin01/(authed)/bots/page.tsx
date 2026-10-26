import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminBots({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const type = sp.type;

  const rows = await prisma.saleBot.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(type ? { type } : {}),
    },
    select: {
      id: true,
      name: true,
      type: true,
      category: true,
      active: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4 max-w-7xl">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-red-400">Admin · Bots</p>
        <h1 className="text-3xl font-bold text-white mt-1">Bots de venda</h1>
        <p className="text-sm text-zinc-400">{rows.length} bot(s).</p>
      </header>

      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome..."
          className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-zinc-200"
        />
        <select
          name="type"
          defaultValue={type}
          className="rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="">Todos</option>
          <option value="discord">Discord</option>
          <option value="telegram">Telegram</option>
        </select>
        <button className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.1]">
          Filtrar
        </button>
      </form>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-12 gap-3 border-b border-white/[0.06] bg-black/30 px-5 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="col-span-4">Bot</span>
          <span className="col-span-3">Owner</span>
          <span className="col-span-2">Tipo</span>
          <span className="col-span-1 text-right">Categoria</span>
          <span className="col-span-1 text-right">Status</span>
          <span className="col-span-1 text-right">Data</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">Nenhum bot.</p>
        ) : (
          rows.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-12 gap-3 border-b border-white/[0.04] px-5 py-2.5 text-sm hover:bg-white/[0.02]"
            >
              <div className="col-span-4 min-w-0">
                <p className="text-white truncate">{b.name}</p>
                <p className="text-[10px] text-zinc-500 font-mono truncate">{b.id}</p>
              </div>
              <Link
                href={`/admin01/users/${b.user.id}`}
                className="col-span-3 min-w-0 hover:text-cyan-300"
              >
                <p className="text-zinc-200 text-xs truncate">{b.user.name ?? b.user.email}</p>
                <p className="text-[10px] text-zinc-500 truncate">{b.user.email}</p>
              </Link>
              <span className="col-span-2 text-xs text-zinc-300">{b.type}</span>
              <span className="col-span-1 text-right text-xs text-zinc-400">{b.category}</span>
              <span className="col-span-1 text-right">
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${
                    b.active
                      ? "bg-cyan-400/15 text-cyan-300"
                      : "bg-zinc-700/30 text-zinc-400"
                  }`}
                >
                  {b.active ? "On" : "Off"}
                </span>
              </span>
              <span className="col-span-1 text-right text-[10px] text-zinc-500">
                {new Date(b.createdAt).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
