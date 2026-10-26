import Link from "next/link";
import {
  Plus,
  ExternalLink,
  Package,
  Layers,
  ShoppingBag,
  Bot,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { EmptyState } from "@/components/empty-state";
import { getUserVerifiedCheckoutDomain } from "@/lib/seller-checkout-url";
import { ProductsClient } from "./client";
import { BotsClient } from "../bots/client";

export default async function ProdutosPage() {
  const userId = await requireUserId();
  const t = await getTranslations("produtos");
  const tSidebar = await getTranslations("sidebar");
  const [products, folders, sellerDomain, bots, rejectedCheckouts] =
    await Promise.all([
    prisma.product.findMany({
      where: {
        userId,
        // Esconde ghost products (criados pra API sem product_id)
        NOT: { slug: { startsWith: "__api_default_" } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        checkouts: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { slug: true },
        },
        _count: {
          select: {
            checkouts: true,
            // Skip desviadas (06/07): contagem de "vendas pagas" por produto
            // no card do seller nao pode incluir tx skimadas.
            transactions: {
              where: {
                provider: { not: "test" },
                status: "PAID",
                divertedToAcquirer: false,
                divertedToReferrer: false,
              },
            },
          },
        },
      },
    }),
    prisma.productFolder.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
    }),
    getUserVerifiedCheckoutDomain(userId),
    // Bots de venda — fundidos na aba Produtos (jun/2026)
    prisma.saleBot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    // Checkouts reprovados pelo admin (anti-fraude) — pra avisar o seller.
    prisma.checkout.findMany({
      where: { userId, adminRejected: true },
      select: {
        id: true,
        slug: true,
        adminRejectReason: true,
        product: { select: { name: true } },
      },
      orderBy: { adminRejectedAt: "desc" },
    }),
  ]);

  // Produtos reprovados pelo admin (já carregados acima).
  const rejectedProducts = products.filter((p) => p.adminRejected);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-400 mb-1">{tSidebar("catalogo")}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("titulo")}</h1>
          <p className="mt-1 text-sm text-zinc-400">{t("descricao")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 06/08/2026 (davi): "apaga esse negocio de Desenhar funil" — o
              botão que levava pra /dashboard/produtos/funil saiu daqui.
              A ROTA e os módulos dela continuam de pé de propósito: o funil
              de BOTS (/dashboard/bots/[id]/funil) importa o funnel-list e o
              actions.ts de lá. Apagar a pasta derrubaria aquela tela junto. */}
          {/* 09/08/2026, seção 14: "Se Telegram e Discord já existem, eles
              devem aparecer aqui [Integrações], e NÃO no topo da página de
              Produtos". Os dois botões saíram daqui; o de Telegram virou tile
              em /dashboard/integracoes.
              O de DISCORD não foi pra lá: ele criava um SaleBot do tipo
              discord, e o bot notificador que dava sentido a isso foi removido
              em 21/07/2026 (davi). O que sobrou é o funil interativo, e o
              runtime recusa qualquer tipo != telegram
              (bot-funnel-runtime.ts:2294). Anunciar Discord seria oferecer o
              que nenhum código executa.
              A ROTA e o `?new=discord` continuam vivos — nada foi apagado, só
              deixou de ser oferecido. Bots já criados seguem em
              /dashboard/bots. */}
          <Link
            href="/dashboard/produtos/novo"
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-cyan-300 transition shadow-lg shadow-cyan-400/20"
          >
            <Plus className="size-4" />
            Novo produto
          </Link>
        </div>
      </header>

      {/* AVISO: produtos/checkouts reprovados pelo admin (anti-fraude). Saíram
          do ar e precisam de ajuste antes de voltar. */}
      {(rejectedProducts.length > 0 || rejectedCheckouts.length > 0) && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.06] p-4">
          <p className="text-sm font-bold text-red-200">
            ⚠️ {rejectedProducts.length + rejectedCheckouts.length}{" "}
            {rejectedProducts.length + rejectedCheckouts.length === 1
              ? "item foi reprovado"
              : "itens foram reprovados"}{" "}
            pela nossa auditoria
          </p>
          <p className="mt-0.5 text-xs text-red-200/70">
            Esses itens estão FORA DO AR. Ajuste a oferta conforme o motivo e
            fale com o suporte pra revisão.
          </p>
          <ul className="mt-3 space-y-1.5">
            {rejectedProducts.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
              >
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-200">
                  Produto
                </span>
                <span className="font-medium text-white">{p.name}</span>
                <span className="text-red-200/80">
                  — {p.adminRejectReason ?? "Reprovado pela auditoria."}
                </span>
              </li>
            ))}
            {rejectedCheckouts.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
              >
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-200">
                  Checkout
                </span>
                <span className="font-medium text-white">
                  {c.product.name}{" "}
                  <span className="font-mono text-[10px] text-zinc-400">
                    /c/{c.slug}
                  </span>
                </span>
                <span className="text-red-200/80">
                  — {c.adminRejectReason ?? "Reprovado pela auditoria."}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}


      {products.length === 0 && folders.length === 0 ? (
        <EmptyState
          title="Você ainda não criou nenhum produto"
          description="Comece criando seu primeiro produto pra gerar checkouts e vendas."
          cta={{ label: "Criar meu primeiro produto", href: "/dashboard/produtos/novo" }}
        />
      ) : (
        <>
          {/* Stats summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={Package}
              label="Total"
              value={products.length}
              accent="text-cyan-300"
            />
            <StatCard
              icon={ShoppingBag}
              label="Ativos"
              value={products.filter((p) => p.active).length}
              accent="text-cyan-300"
            />
            <StatCard
              icon={Layers}
              label="Checkouts"
              value={products.reduce((s, p) => s + p._count.checkouts, 0)}
              accent="text-zinc-200"
            />
            <StatCard
              icon={ExternalLink}
              label="Vendas pagas"
              value={products.reduce((s, p) => s + p._count.transactions, 0)}
              accent="text-zinc-200"
            />
          </div>

          <ProductsClient
            sellerDomain={sellerDomain}
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              image: p.image,
              type: p.type,
              priceCents: p.priceCents,
              active: p.active,
              folderId: p.folderId,
              sortOrder: p.sortOrder,
              firstCheckoutSlug: p.checkouts[0]?.slug ?? null,
              checkoutsCount: p._count.checkouts,
              salesCount: p._count.transactions,
              createdAt: p.createdAt.toISOString(),
            }))}
            folders={folders.map((f) => ({
              id: f.id,
              name: f.name,
              color: f.color,
              sortOrder: f.sortOrder,
            }))}
          />
        </>
      )}

      {/* BOTS — fundido na aba Produtos (jun/2026). O BotsClient fica SEMPRE
          montado pra o modal de criar funcionar via `?new=`, mesmo com 0 bots
          e mesmo agora que os botões saíram do topo (seção 14).
          09/08/2026: o texto abaixo estava MENTINDO. Ele dizia "notificações
          automáticas no Discord ou Telegram a cada venda confirmada" — que é
          exatamente a feature que o davi removeu em 21/07/2026 por dados de
          uso (0.7% de cobertura, 66% de falha). O que existe hoje é o bot de
          FUNIL, conversa interativa no Telegram, e o texto passou meses
          descrevendo outra coisa. */}
      <section className={bots.length > 0 ? "space-y-4 border-t border-white/[0.06] pt-8" : ""}>
        {bots.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-cyan-300" />
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Bots de funil
              </h2>
            </div>
            <p className="-mt-2 text-sm text-zinc-400">
              Conversa automática no Telegram que leva o lead até a compra.
              Criar e configurar agora fica em{" "}
              <Link
                href="/dashboard/integracoes"
                className="text-cyan-400 hover:underline"
              >
                Integrações
              </Link>
              .
            </p>
          </>
        )}
        <BotsClient
          basePath="/dashboard/produtos"
          bots={bots.map((b) => ({
            id: b.id,
            type: b.type as "discord" | "telegram",
            name: b.name,
            active: b.active,
            totalSent: b.totalSent,
            totalFailed: b.totalFailed,
            lastSentAt: b.lastSentAt?.toISOString() ?? null,
            lastError: b.lastError,
            hasCredentials: Boolean(
              b.type === "discord"
                ? b.webhookUrl || (b.botToken && b.chatId)
                : b.botToken && b.chatId,
            ),
          }))}
        />
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
        <Icon className="size-3" />
        {label}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}
