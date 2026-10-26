import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { CommandsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function BotCommandsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: botId } = await params;
  const userId = await requireUserId();

  const bot = await prisma.saleBot.findFirst({
    where: { id: botId, userId, type: "telegram" },
    select: { id: true, name: true },
  });
  if (!bot) notFound();

  const [commands, activeFunnel] = await Promise.all([
    prisma.botCommand.findMany({
      where: { botId: bot.id },
      orderBy: { command: "asc" },
      select: { id: true, command: true, startNodeId: true, active: true },
    }),
    prisma.funnel.findFirst({
      where: { userId, kind: "bot", botId: bot.id, active: true },
      select: { id: true, name: true, graph: true },
    }),
  ]);

  // Extrai nós do funil ativo pra o seller poder escolher onde o comando começa
  const funnelNodes: Array<{ id: string; type: string; label: string }> = [];
  if (activeFunnel?.graph && typeof activeFunnel.graph === "object") {
    const g = activeFunnel.graph as { nodes?: Array<Record<string, unknown>> };
    const nodes = Array.isArray(g.nodes) ? g.nodes : [];
    for (const n of nodes) {
      const type = String(n.type ?? "");
      const d = (n.data ?? {}) as Record<string, unknown>;
      let label = type;
      if (type === "message") label = `msg: ${String(d.text ?? "").slice(0, 40)}`;
      else if (type === "payment") label = `pagamento: ${String(d.checkoutName ?? d.productName ?? "?")}`;
      else if (type === "botproduct") label = `oferta: ${String(d.name ?? "?")}`;
      else if (type === "input") label = `pergunta: ${String(d.prompt ?? "").slice(0, 40)}`;
      else if (type === "buttons") label = `botões: ${String(d.text ?? "").slice(0, 40)}`;
      else if (type === "poll") label = `enquete: ${String(d.question ?? "").slice(0, 40)}`;
      funnelNodes.push({ id: String(n.id ?? ""), type, label });
    }
  }

  return (
    <CommandsClient
      bot={{ id: bot.id, name: bot.name }}
      funnel={activeFunnel ? { id: activeFunnel.id, name: activeFunnel.name } : null}
      funnelNodes={funnelNodes}
      commands={commands}
    />
  );
}
