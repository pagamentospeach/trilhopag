import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import {
  getOwnedSpyingPlatforms,
  getSpyingPriceCents,
  SPYING_LABELS,
} from "@/lib/spying-access";
import { EspionagemClient } from "./client";

export const dynamic = "force-dynamic";

export default async function EspionagemPage() {
  const userId = await requireUserId();
  const [user, owned, fbAds, ttAds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { balanceCents: true },
    }),
    getOwnedSpyingPlatforms(userId),
    prisma.spyingAd.findMany({
      where: { platform: "facebook", active: true },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.spyingAd.findMany({
      where: { platform: "tiktok", active: true },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
  ]);

  return (
    <EspionagemClient
      balanceCents={user?.balanceCents ?? 0}
      ownsFacebook={owned.includes("facebook")}
      ownsTiktok={owned.includes("tiktok")}
      facebookPriceCents={getSpyingPriceCents("facebook")}
      tiktokPriceCents={getSpyingPriceCents("tiktok")}
      facebookLabel={SPYING_LABELS.facebook}
      tiktokLabel={SPYING_LABELS.tiktok}
      facebookAds={fbAds.map(serializeAd)}
      tiktokAds={ttAds.map(serializeAd)}
    />
  );
}

function serializeAd(a: {
  id: string;
  platform: string;
  title: string;
  brand: string | null;
  niche: string;
  angle: string;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  hookText: string | null;
  description: string | null;
  cta: string | null;
  estimatedSpend: string | null;
  daysRunning: number | null;
  country: string | null;
  tags: string[];
  language: string;
  featured: boolean;
}) {
  return {
    id: a.id,
    platform: a.platform,
    title: a.title,
    brand: a.brand,
    niche: a.niche,
    angle: a.angle,
    mediaType: a.mediaType,
    mediaUrl: a.mediaUrl,
    thumbnailUrl: a.thumbnailUrl,
    hookText: a.hookText,
    description: a.description,
    cta: a.cta,
    estimatedSpend: a.estimatedSpend,
    daysRunning: a.daysRunning,
    country: a.country,
    tags: a.tags,
    language: a.language,
    featured: a.featured,
  };
}
