import { prisma } from "@/lib/prisma";
import { AdsManager } from "./client";

export const dynamic = "force-dynamic";

export default async function AdminEspionagemPage() {
  const ads = await prisma.spyingAd.findMany({
    orderBy: [{ platform: "asc" }, { featured: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-5 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold text-white">Espionagem · Biblioteca</h1>
        <p className="text-sm text-zinc-400">
          Gerencie a biblioteca de anuncios das alas Facebook Ads e TikTok Ads.
          Sellers que compraram acesso (R$ 67 FB / R$ 97 TT) podem filtrar / buscar
          essa lista.
        </p>
      </header>
      <AdsManager ads={ads.map(serialize)} />
    </div>
  );
}

function serialize(a: {
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
  active: boolean;
}) {
  return {
    id: a.id,
    platform: a.platform,
    title: a.title,
    brand: a.brand ?? "",
    niche: a.niche,
    angle: a.angle,
    mediaType: a.mediaType,
    mediaUrl: a.mediaUrl ?? "",
    thumbnailUrl: a.thumbnailUrl ?? "",
    hookText: a.hookText ?? "",
    description: a.description ?? "",
    cta: a.cta ?? "",
    estimatedSpend: a.estimatedSpend ?? "",
    daysRunning: a.daysRunning,
    country: a.country ?? "",
    tags: a.tags,
    language: a.language,
    featured: a.featured,
    active: a.active,
  };
}
