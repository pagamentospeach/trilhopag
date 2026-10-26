import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function AdminAuditPage() {
  const logs = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-5 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold text-white">Auditoria</h1>
        <p className="text-sm text-zinc-400">
          Histórico de todas as ações administrativas (últimas 200).
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] bg-black/30 px-5 py-3 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="col-span-3">Data</span>
          <span className="col-span-3">Ação</span>
          <span className="col-span-3">Target</span>
          <span className="col-span-3">Payload</span>
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-zinc-500">
            Sem ações registradas ainda.
          </p>
        ) : (
          logs.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-3 text-xs hover:bg-white/[0.02]"
            >
              <span className="col-span-3 text-zinc-400">
                {formatDate(l.createdAt)}
              </span>
              <span className="col-span-3 font-mono text-cyan-300">{l.action}</span>
              <span className="col-span-3 font-mono text-zinc-300 truncate">
                {l.target ?? "—"}
              </span>
              <span className="col-span-3 font-mono text-zinc-500 truncate">
                {JSON.stringify(l.payload)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
