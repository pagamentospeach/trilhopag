import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  videoId: z.string().max(40),
  type: z.string().max(40),
  visitorId: z.string().max(80).optional().nullable(),
  positionSeconds: z.number().int().min(0).max(86400).optional().nullable(),
  utmSource: z.string().max(200).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
  utmMedium: z.string().max(200).optional().nullable(),
  utmContent: z.string().max(200).optional().nullable(),
});

/**
 * Eventos permitidos. Antes aceitava `type` arbitrário, abria espaço pra
 * log injection e inflar a tabela de eventos.
 */
const ALLOWED_TYPES = new Set([
  "view",
  "play",
  "pause",
  "complete",
  "cta_click",
  "milestone_25",
  "milestone_50",
  "milestone_75",
]);

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 422 });
  }
  const { videoId, type } = parsed.data;

  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 422 });
  }

  const ipForRl = getClientIp(request);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const userAgent = request.headers.get("user-agent");

  // Rate limit AGRESSIVO por (IP, videoId): protege contra atacante que
  // dispara milhões de `type:"play"` pra inflar a tabela de eventos e as
  // métricas do seller (o uso é grátis, mas flood ainda é abuso).
  // 60/min/(IP+vídeo) é suficiente pra player real (~ a cada segundo se
  // alguém der seek frenético) mas mata flood.
  const rl = rateLimit(`bturb-event:${ipForRl}:${videoId}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Confirma que o vídeo existe e está ativo. Antes a rota gravava evento
  // pra videoId inexistente — atacante poderia inflar tabela arbitrariamente.
  const video = await prisma.bturbVideo.findUnique({
    where: { id: videoId },
    select: { id: true, active: true, userId: true },
  });
  if (!video || !video.active) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Cria evento + incrementa contador agregado em paralelo
  await Promise.all([
    prisma.bturbVideoEvent.create({
      data: {
        videoId,
        type,
        visitorId: parsed.data.visitorId ?? null,
        positionSeconds: parsed.data.positionSeconds ?? null,
        utmSource: parsed.data.utmSource ?? null,
        utmCampaign: parsed.data.utmCampaign ?? null,
        utmMedium: parsed.data.utmMedium ?? null,
        utmContent: parsed.data.utmContent ?? null,
        ip,
        userAgent,
      },
    }),
    incrementCounter(videoId, type),
  ]);

  return NextResponse.json({ ok: true });
}

async function incrementCounter(videoId: string, type: string) {
  if (type === "view") {
    await prisma.bturbVideo.update({
      where: { id: videoId },
      data: { views: { increment: 1 } },
    });
  } else if (type === "play") {
    // Incrementa play do vídeo + contador de plays do owner (uso é grátis,
    // sem cobrança no saldo).
    const video = await prisma.bturbVideo.update({
      where: { id: videoId },
      data: { plays: { increment: 1 } },
      select: { userId: true },
    });
    if (video?.userId) {
      await chargeBturbPlay(video.userId).catch((e) =>
        console.error("[bturb/event] charge failed:", e),
      );
    }
  } else if (type === "cta_click") {
    await prisma.bturbVideo.update({
      where: { id: videoId },
      data: { ctaClicks: { increment: 1 } },
    });
  }
  // Outros eventos (milestones, pause, etc) só ficam no log.
}

/**
 * Bturb agora é 100% GRÁTIS — nenhum débito no saldo por play.
 * Mantemos apenas o contador `bturbPlaysUsed` como estatística de uso.
 * (Antes: 4000 plays grátis e R$ 0,01/play após. Removido jun/2026.)
 */
async function chargeBturbPlay(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { bturbPlaysUsed: { increment: 1 } },
  });
}
