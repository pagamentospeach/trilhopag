import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { FunnelList } from "../../../produtos/funil/funnel-list";

export const dynamic = "force-dynamic";

/**
 * Lista de funis de CONVERSA de um bot. Reusa a mesma UI/CRUD dos funis de
 * produto (kind="bot", botId). 1 ativo por bot. Cada um abre num canvas.
 */
export default async function BotFunilListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: botId } = await params;
  const userId = await requireUserId();

  const bot = await prisma.saleBot.findFirst({
    where: { id: botId, userId },
    select: { id: true, name: true, type: true },
  });
  if (!bot) notFound();

  const funnels = await prisma.funnel.findMany({
    where: { userId, kind: "bot", botId },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, active: true, updatedAt: true, graph: true },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/dashboard/bots/${botId}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05] transition"
        >
          <ArrowLeft className="size-3.5" />
          Bot
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-400 mb-0.5">
            Funil de conversa
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {bot.name}
          </h1>
        </div>
      </header>

      <p className="text-sm text-zinc-400">
        Desenhe a conversa do bot como um mapa mental: mensagens + ofertas
        (que geram PIX no chat), com ramificações de{" "}
        <span className="text-cyan-300">upsell</span> (pagou) e{" "}
        <span className="text-orange-300">downsell</span> (não pagou). Crie
        vários e ative só 1 por vez — nascem desativados.
      </p>

      <FunnelList
        kind="bot"
        botId={botId}
        basePath={`/dashboard/bots/${botId}/funil`}
        unitLabel="bloco"
        funnels={funnels.map((f) => {
          const g = (f.graph as { nodes?: unknown[]; edges?: unknown[] } | null) ?? {};
          return {
            id: f.id,
            name: f.name,
            active: f.active,
            updatedAt: f.updatedAt.toISOString(),
            nodeCount: Array.isArray(g.nodes) ? g.nodes.length : 0,
            edgeCount: Array.isArray(g.edges) ? g.edges.length : 0,
          };
        })}
      />
    </div>
  );
}
