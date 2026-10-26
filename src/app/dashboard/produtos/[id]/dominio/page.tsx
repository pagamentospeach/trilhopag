import Link from "next/link";
import { Globe, ArrowRight, Check, AlertCircle } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DominioProprioClient } from "./client";

export default async function DominioProprioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const product = await prisma.product.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!product) notFound();

  const [checkouts, ownDomains, poolDomains] = await Promise.all([
    prisma.checkout.findMany({
      where: { productId: id, userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        active: true,
        customDomain: true,
        poolDomainId: true,
      },
    }),
    // Sub-account herda dominios da conta pai (06/07): busca no grupo.
    (async () => {
      const { getUserGroupIds } = await import("@/lib/seller-checkout-url");
      const groupIds = await getUserGroupIds(userId);
      return prisma.customDomain.findMany({
        where: {
          userId: { in: groupIds },
          status: "verified",
          useCheckout: true,
        },
        orderBy: { domain: "asc" },
        select: { id: true, domain: true },
      });
    })(),
    // Pool da plataforma — domínios disponíveis pra qualquer seller
    prisma.adminCheckoutDomain.findMany({
      where: { active: true },
      orderBy: { domain: "asc" },
      select: { id: true, domain: true, label: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/[0.08] to-transparent p-5">
        <div className="flex items-start gap-3">
          <Globe className="size-5 shrink-0 text-cyan-400" />
          <div>
            <p className="font-semibold text-white">
              Use seu próprio domínio nos checkouts deste produto
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              Em vez de <code className="font-mono">trilhopag.com/c/&lt;slug&gt;</code>,
              seu checkout abre como <code className="font-mono">seudominio.com/c/&lt;slug&gt;</code>.
              Conversão mais alta + proteção de marca.
            </p>
          </div>
        </div>
      </div>

      <DominioProprioClient
        checkouts={checkouts}
        ownDomains={ownDomains}
        poolDomains={poolDomains}
      />

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-zinc-400">
        <p className="font-semibold text-zinc-300">Como funciona:</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Cadastra seu domínio em <Link href="/dashboard/dominios" className="text-cyan-400 hover:underline">/dashboard/dominios</Link></li>
          <li>Configura DNS (TXT + CNAME → Vercel) — leva 5-15 min pra propagar</li>
          <li>Verifica → status fica &quot;Verified&quot;</li>
          <li>Volta aqui e vincula o domínio a cada checkout</li>
          <li>Pronto: <code className="font-mono">https://seudominio.com/c/&lt;slug&gt;</code></li>
        </ol>
      </div>
    </div>
  );
}
