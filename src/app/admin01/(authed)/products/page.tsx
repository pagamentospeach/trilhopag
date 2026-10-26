import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/utils";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { transactions: { where: { status: "PAID" } } } },
    },
  });

  return (
    <div className="space-y-5 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold text-white">Produtos</h1>
        <p className="text-sm text-zinc-400">
          Todos os produtos cadastrados na plataforma.
        </p>
      </header>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="col-span-4">Produto</span>
          <span className="col-span-3">Seller</span>
          <span className="col-span-2 text-right">Preço</span>
          <span className="col-span-2 text-right">Vendas</span>
          <span className="col-span-1">Status</span>
        </div>
        {products.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-3 text-sm hover:bg-white/[0.02]"
          >
            <div className="col-span-4 min-w-0">
              <p className="text-white truncate">{p.name}</p>
              <p className="text-[10px] text-zinc-500 truncate font-mono">/{p.slug}</p>
            </div>
            <div className="col-span-3 min-w-0">
              <p className="text-zinc-300 truncate text-xs">
                {p.user.name ?? p.user.email}
              </p>
            </div>
            <span className="col-span-2 text-right font-mono text-zinc-200">
              {formatBRL(p.priceCents)}
            </span>
            <span className="col-span-2 text-right text-cyan-300 tabular-nums">
              {p._count.transactions}
            </span>
            <span className="col-span-1">
              {p.active ? (
                <span className="rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[10px] text-cyan-300">
                  Ativo
                </span>
              ) : (
                <span className="rounded-full bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  Off
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
