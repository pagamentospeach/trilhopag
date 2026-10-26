import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isPlatformHost } from "@/lib/platform-domains";
import { BturbPlayer } from "./player";

export const dynamic = "force-dynamic";

export default async function PublicBturbPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // HARD GUARD: embed de Bturb SÓ é servido via domínio próprio do seller.
  // Se vier via hostname da PLATAFORMA (trilhopag.com etc) → 404.
  const hdrs = await headers();
  const host = hdrs.get("host");
  if (isPlatformHost(host)) {
    notFound();
  }

  const { id } = await params;
  const v = await prisma.bturbVideo.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      videoUrl: true,
      thumbnailUrl: true,
      thumbnailPauseUrl: true,
      thumbnailEndUrl: true,
      smartAutoplay: true,
      autoplayMuted: true,
      silentAutoplay: true,
      turboSpeed: true,
      showProgress: true,
      fakeProgressBar: true,
      fakeProgressTotalSeconds: true,
      loop: true,
      hideControls: true,
      blockRightClick: true,
      downloadProtection: true,
      primaryColor: true,
      ctaDelaySeconds: true,
      ctaText: true,
      ctaUrl: true,
      ctaPlacement: true,
      ctaCustomHtml: true,
      fbPixelId: true,
      tiktokPixelId: true,
      conversionKey: true,
      active: true,
    },
  });
  if (!v || !v.active) notFound();
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#000", overflow: "hidden" }}>
        <div style={{ width: "100vw", height: "100vh" }}>
          <BturbPlayer video={v} />
        </div>
      </body>
    </html>
  );
}
