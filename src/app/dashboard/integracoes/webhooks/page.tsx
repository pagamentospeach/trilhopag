import Link from "next/link";
import { Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { WebhookRowActions } from "./row-actions";

export default async function WebhooksPage() {
  const userId = await requireUserId();
  const webhooks = await prisma.webhook.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { deliveries: true } },
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { succeeded: true, createdAt: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Receba eventos de transações em tempo real no seu servidor.
          </p>
        </div>
        <Link
          href="/dashboard/integracoes/webhooks/novo"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-300 transition"
        >
          <Plus className="size-4" /> Novo webhook
        </Link>
      </header>

      {webhooks.length === 0 ? (
        <EmptyState
          title="Nenhum webhook configurado"
          description="Crie um endpoint pra receber eventos quando uma venda for paga, expirar ou for reembolsada."
          cta={{
            label: "Criar webhook",
            href: "/dashboard/integracoes/webhooks/novo",
          }}
        />
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
          <div className="grid min-w-[800px] grid-cols-12 gap-4 border-b border-white/[0.06] px-5 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <span className="col-span-5">URL</span>
            <span className="col-span-2">Eventos</span>
            <span className="col-span-1">Status</span>
            <span className="col-span-2">Entregas</span>
            <span className="col-span-2">Criado</span>
          </div>
          {webhooks.map((w) => {
            const last = w.deliveries[0];
            return (
              <div
                key={w.id}
                className="group grid min-w-[800px] grid-cols-12 gap-4 border-b border-white/[0.04] px-5 py-4 text-sm last:border-b-0 hover:bg-white/[0.02] transition"
              >
                <div className="col-span-5 min-w-0">
                  <Link
                    href={`/dashboard/integracoes/webhooks/${w.id}`}
                    className="font-mono text-xs text-white hover:text-cyan-300 truncate block"
                  >
                    {w.url}
                  </Link>
                </div>
                <div className="col-span-2 text-zinc-400 text-xs">
                  {w.events.length === 0 ? "Todos" : `${w.events.length} evento(s)`}
                </div>
                <div className="col-span-1">
                  {w.active ? (
                    <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-300">
                      Ativo
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-xs text-zinc-400">
                      Off
                    </span>
                  )}
                </div>
                <div className="col-span-2 flex items-center gap-1.5 text-xs text-zinc-400">
                  {last ? (
                    last.succeeded ? (
                      <>
                        <CheckCircle2 className="size-3 text-cyan-400" />
                        <span>{w._count.deliveries} entregas</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="size-3 text-red-400" />
                        <span>{w._count.deliveries} entregas</span>
                      </>
                    )
                  ) : (
                    <span className="text-zinc-500">Sem entregas</span>
                  )}
                </div>
                <div className="col-span-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{formatDate(w.createdAt)}</span>
                  <WebhookRowActions
                    webhookId={w.id}
                    webhookUrl={w.url}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
