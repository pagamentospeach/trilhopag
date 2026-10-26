import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminCloakers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();

  const rows = await prisma.cloakerCampaign.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      mode: true,
      totalRequests: true,
      passedToMoney: true,
      sentToWhite: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { totalRequests: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4 max-w-7xl">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-red-400">Admin · Cloakers</p>
        <h1 className="text-3xl font-bold text-white mt-1">Cloakers de todos os usuários</h1>
        <p className="text-sm text-zinc-400">
          {rows.length} cloaker(s) listados, ordenados por requests.
        </p>
      </header>

      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou slug..."
          className="flex-1 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-sm text-zinc-200"
        />
        <button className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.1]">
          Buscar
        </button>
      </form>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-12 gap-3 border-b border-white/[0.06] bg-black/30 px-5 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="col-span-3">Nome / slug</span>
          <span className="col-span-3">Owner</span>
          <span className="col-span-1">Modo</span>
          <span className="col-span-1 text-right">Reqs</span>
          <span className="col-span-1 text-right">Money</span>
          <span className="col-span-1 text-right">White</span>
          <span className="col-span-1 text-right">Pass %</span>
          <span className="col-span-1 text-right">Status</span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">Nenhum cloaker.</p>
        ) : (
          rows.map((c) => {
            const passRate = c.totalRequests > 0 ? (c.passedToMoney / c.totalRequests) * 100 : 0;
            return (
              <div
                key={c.id}
                className="grid grid-cols-12 gap-3 border-b border-white/[0.04] px-5 py-2.5 text-sm hover:bg-white/[0.02]"
              >
                <div className="col-span-3 min-w-0">
                  <p className="text-white truncate">{c.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono truncate">/c/{c.slug}</p>
                </div>
                <Link
                  href={`/admin01/users/${c.user.id}`}
                  className="col-span-3 min-w-0 hover:text-cyan-300"
                >
                  <p className="text-zinc-200 text-xs truncate">{c.user.name ?? c.user.email}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{c.user.email}</p>
                </Link>
                <span className="col-span-1 text-xs text-zinc-400">{c.mode}</span>
                <span className="col-span-1 text-right text-xs text-zinc-300 tabular-nums">
                  {c.totalRequests}
                </span>
                <span className="col-span-1 text-right text-xs text-cyan-300 tabular-nums">
                  {c.passedToMoney}
                </span>
                <span className="col-span-1 text-right text-xs text-zinc-500 tabular-nums">
                  {c.sentToWhite}
                </span>
                <span className="col-span-1 text-right text-xs text-zinc-200 tabular-nums">
                  {passRate.toFixed(1)}%
                </span>
                <span className="col-span-1 text-right">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ${
                      c.active
                        ? "bg-cyan-400/15 text-cyan-300"
                        : "bg-zinc-700/30 text-zinc-400"
                    }`}
                  >
                    {c.active ? "On" : "Off"}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
