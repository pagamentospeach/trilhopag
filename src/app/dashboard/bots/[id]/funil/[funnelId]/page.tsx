import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { getUserVerifiedCheckoutDomain } from "@/lib/seller-checkout-url";
import { CHECKOUT_HOST } from "@/lib/checkout-url";
import { BotFunnelLoader } from "../bot-funnel-loader";

export const dynamic = "force-dynamic";

export default async function BotFunilCanvasPage({
  params,
}: {
  params: Promise<{ id: string; funnelId: string }>;
}) {
  const { id: botId, funnelId } = await params;
  const userId = await requireUserId();

  const [bot, funnel, products, checkouts, verifiedDomain] = await Promise.all([
    prisma.saleBot.findFirst({
      where: { id: botId, userId },
      select: {
        id: true, name: true, type: true, funnelRuntimeEnabled: true,
        // 30/07/2026: veredito do monitor 24/7 (/api/cron/bot-health). Sem
        // isso o canvas exibia "✓ Bot rodando" mesmo com o bot mudo há dias
        // — foi exatamente o que fez o seller achar que estava tudo certo.
        healthStatus: true, healthIssue: true, healthDetail: true,
        healthCheckedAt: true,
      },
    }),
    prisma.funnel.findFirst({
      where: { id: funnelId, userId, kind: "bot", botId },
      select: { id: true, name: true, active: true, graph: true },
    }),
    prisma.product.findMany({
      where: { userId, active: true, NOT: { slug: { startsWith: "__api_default_" } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, image: true, priceCents: true },
    }),
    // 21/07/2026 (davi): bloco "payment" precisa de checkouts (não só produtos)
    // pra o seller poder escolher o checkout ESPECÍFICO (com order bump/AB) e
    // pra ter slug pronto pra montar a URL do checkout web.
    prisma.checkout.findMany({
      where: { userId, active: true },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        product: { select: { name: true, image: true, priceCents: true } },
      },
      take: 100,
    }),
    getUserVerifiedCheckoutDomain(userId),
  ]);
  if (!bot || !funnel) notFound();

  return (
    /**
     * 30/07/2026 (seller: "volta pra como estava antes! O problema é que
     * quando eu clico numa sidebar, nao estou sendo redirecionado! somente
     * quando estou nessa tela!").
     *
     * Volta ao layout tela-cheia com negative-margins: o problema NUNCA foi
     * espaco/z-index/pointer-capture (todas essas teorias falharam).
     *
     * Causa real, medida no React DevTools desta tela: as lanes de transicao
     * do root ficavam ENTALADAS (pendingLanes = expiredLanes =
     * entangledLanes = 3584, entanglements 9/10/11 apontando entre si). Como
     * navegacao do App Router e uma transition, o <Link> dava
     * preventDefault(), o RSC voltava 200 — e o history.pushState nunca
     * rodava, porque a transition jamais commitava. Clicar na sidebar nao
     * fazia nada.
     *
     * As duas fontes de realimentacao que entupiam as lanes (onSelectionChange
     * recriando array a cada tick do store do ReactFlow e o autosave Server
     * Action disparando sem edicao) estao corrigidas em bot-funnel-board.tsx,
     * que tambem tem um escape hatch em fase de captura: link interno fora do
     * canvas navega via window.location.assign, entao o sintoma nao volta nem
     * que uma lane trave de novo.
     */
    <div className="-mx-3 -mt-4 -mb-24 h-[calc(100dvh-4rem)] overflow-clip sm:-mx-6 sm:-mt-6 md:-mx-8 md:-mt-8">
      <BotFunnelLoader
        funnelId={funnel.id}
        name={funnel.name}
        backHref={`/dashboard/bots/${botId}/funil`}
        botId={bot.id}
        botType={bot.type === "discord" ? "discord" : "telegram"}
        active={funnel.active}
        runtimeEnabled={bot.funnelRuntimeEnabled}
        health={{
          status: bot.healthStatus,
          issue: bot.healthIssue,
          detail: bot.healthDetail,
          checkedAt: bot.healthCheckedAt?.toISOString() ?? null,
        }}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          image: p.image,
          priceCents: p.priceCents,
        }))}
        checkouts={checkouts.map((c) => ({
          id: c.id,
          slug: c.slug,
          // Nome do checkout = nome do produto (Checkout model não tem campo
          // name próprio — o "nome" percebido pelo seller é o do produto).
          name: c.product.name,
          productName: c.product.name,
          image: c.product.image,
          priceCents: c.product.priceCents,
        }))}
        checkoutHost={verifiedDomain ?? CHECKOUT_HOST}
        initialGraph={(funnel.graph as Record<string, unknown> | null) ?? null}
      />
    </div>
  );
}
