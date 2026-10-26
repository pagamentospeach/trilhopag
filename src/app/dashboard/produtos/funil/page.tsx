import Link from "next/link";
import { ArrowLeft, AlertTriangle, Globe } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { getUserVerifiedCheckoutDomain } from "@/lib/seller-checkout-url";
import { FunnelList } from "./funnel-list";

export const dynamic = "force-dynamic";

/**
 * Lista de funis de PRODUTO (mapa mental). O seller cria vários por nome e
 * ativa só 1 por vez (o ativo grava upsellUrl/backRedirectUrl nas ofertas).
 * Cada funil abre num canvas próprio em /funil/[id].
 */
export default async function FunilListPage() {
  const userId = await requireUserId();
  const [funnels, sellerDomain] = await Promise.all([
    prisma.funnel.findMany({
      where: { userId, kind: "product" },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      select: { id: true, name: true, active: true, updatedAt: true, graph: true },
    }),
    getUserVerifiedCheckoutDomain(userId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/produtos"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05] transition"
          >
            <ArrowLeft className="size-3.5" />
            Produtos
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-400 mb-0.5">
              Funis
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Funis de produto
            </h1>
          </div>
        </div>
      </header>

      <p className="text-sm text-zinc-400">
        Crie quantos funis quiser (cada um com um nome). Desenhe as conexões de{" "}
        <span className="text-cyan-300">upsell</span> e{" "}
        <span className="text-orange-300">back-redirect</span> entre os produtos.
        Só <strong>1 funil fica ativo por vez</strong> — o ativo é o que vale
        nas suas ofertas. Funis novos nascem desativados.
      </p>

      {!sellerDomain && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 flex items-start gap-2.5">
          <AlertTriangle className="size-4 shrink-0 text-amber-300 mt-0.5" />
          <p className="text-xs text-amber-100/80 leading-relaxed">
            Sem <strong>domínio verificado</strong> dá pra desenhar, mas o upsell
            entre produtos só aplica com um domínio.{" "}
            <Link href="/dashboard/dominios" className="underline inline-flex items-center gap-1">
              <Globe className="size-3" /> Conectar
            </Link>
          </p>
        </div>
      )}

      <FunnelList
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
