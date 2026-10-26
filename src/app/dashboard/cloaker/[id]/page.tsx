import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { listVerifiedDomainsForFeature } from "@/lib/custom-host";
import { isPlatformHost } from "@/lib/platform-domains";
import { CloakerEditor } from "./client";

export default async function CloakerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const campaign = await prisma.cloakerCampaign.findFirst({
    where: { id, userId },
    include: {
      customDomain: { select: { id: true, domain: true, status: true, useCloaker: true } },
    },
  });
  if (!campaign) notFound();

  const [recentHits, availableDomains] = await Promise.all([
    prisma.cloakerHit.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        decision: true,
        reason: true,
        ip: true,
        country: true,
        userAgent: true,
        referer: true,
        utmSource: true,
        createdAt: true,
      },
    }),
    listVerifiedDomainsForFeature(userId, "useCloaker"),
  ]);

  // Defesa em profundidade: se por qualquer motivo o customDomain
  // apontar pra plataforma (impossível normalmente, mas seguro),
  // tratamos como "sem domínio" e bloqueamos a URL.
  const domainSafe =
    campaign.customDomain &&
    campaign.customDomain.status === "verified" &&
    campaign.customDomain.useCloaker &&
    !isPlatformHost(campaign.customDomain.domain);

  return (
    <CloakerEditor
      campaign={{
        ...campaign,
        customDomain: domainSafe
          ? {
              id: campaign.customDomain!.id,
              domain: campaign.customDomain!.domain,
              valid: true,
            }
          : null,
      }}
      recentHits={recentHits.map((h) => ({
        ...h,
        createdAt: h.createdAt.toISOString(),
      }))}
      availableDomains={availableDomains}
    />
  );
}
