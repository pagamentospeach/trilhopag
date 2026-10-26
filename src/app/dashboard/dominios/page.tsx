import { Globe, ShieldCheck, Server } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DomainsClient } from "./client";
import { DomainGuide } from "./guide";

export default async function DominiosPage() {
  const userId = await requireUserId();
  // Grupo (pai + subs) — sub-account ve os dominios do pai e vice-versa,
  // porque e o mesmo dono real. Bug reportado 06/07 (adsriya0 na sub-account
  // via "dominio ja em uso por outro seller" na tela de adicionar).
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { parentUserId: true },
  });
  const rootId = me?.parentUserId ?? userId;
  const subs = await prisma.user.findMany({
    where: { parentUserId: rootId },
    select: { id: true },
  });
  const groupIds = [rootId, ...subs.map((s) => s.id)];
  const domains = await prisma.customDomain.findMany({
    where: { userId: { in: groupIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      domain: true,
      status: true,
      verifyToken: true,
      verifiedAt: true,
      useCheckout: true,
      useCloaker: true,
      useBturb: true,
      useMembros: true,
      errorMessage: true,
      lastCheckAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">Catálogo</p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <Globe className="size-6 text-cyan-400" /> Domínios próprios
        </h1>
        {/* 11/08/2026 (davi): "tire bturb, cloaker e bla bla, deixe só a
            vantagem de usar um domínio próprio". Antes listava as features
            onde o domínio se aplica; agora responde a pergunta que o seller
            realmente faz aqui, que é por que ele deveria conectar um. */}
        <p className="mt-1 text-sm text-zinc-400">
          Seu checkout passa a abrir no seu endereço, com seu nome na barra do
          navegador. O cliente vê a sua marca do início ao fim da compra.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InfoCard
          icon={ShieldCheck}
          title="Mais confiança"
          text="Endereço com seu nome na hora do pagamento gera menos desistência."
        />
        <InfoCard
          icon={Server}
          title="O link é seu"
          text="Se um dia você sair, o endereço continua funcionando do mesmo jeito."
        />
        <InfoCard
          icon={Globe}
          title="Rápido de ligar"
          text="Dois registros de DNS. Costuma ficar pronto em 5 a 30 minutos."
        />
      </div>

      {/* GUIA COMPLETO — passo a passo, providers, troubleshooting */}
      <DomainGuide />

      <DomainsClient domains={domains} />
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <Icon className="size-5 text-cyan-400" />
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-[11px] text-zinc-400">{text}</p>
    </div>
  );
}
