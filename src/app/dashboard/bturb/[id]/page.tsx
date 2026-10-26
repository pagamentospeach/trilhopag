import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { listVerifiedDomainsForFeature } from "@/lib/custom-host";
import { isPlatformHost } from "@/lib/platform-domains";
import { BturbVideoEditor } from "./client";

export default async function BturbVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const [video, availableDomains] = await Promise.all([
    prisma.bturbVideo.findFirst({
      where: { id, userId },
      include: {
        customDomain: {
          select: { id: true, domain: true, status: true, useBturb: true },
        },
      },
    }),
    listVerifiedDomainsForFeature(userId, "useBturb"),
  ]);
  if (!video) notFound();

  const domainSafe =
    video.customDomain &&
    video.customDomain.status === "verified" &&
    video.customDomain.useBturb &&
    !isPlatformHost(video.customDomain.domain);

  return (
    <BturbVideoEditor
      video={{
        ...video,
        createdAt: video.createdAt.toISOString(),
        customDomain: domainSafe
          ? {
              id: video.customDomain!.id,
              domain: video.customDomain!.domain,
              valid: true,
            }
          : null,
      }}
      availableDomains={availableDomains}
    />
  );
}
