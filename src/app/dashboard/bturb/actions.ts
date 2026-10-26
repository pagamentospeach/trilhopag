"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { randomBytes } from "crypto";
import {
  listVerifiedDomainsForFeature,
  resolveDomainHost,
} from "@/lib/custom-host";
import { safeHttpUrl } from "@/lib/security/safe-url";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  videoUrl: z.string().url(),
  mimeType: z.string().optional().nullable(),
  durationSeconds: z.number().int().optional().nullable(),
  sizeBytes: z.number().int().optional().nullable(),
  /**
   * OBRIGATÓRIO: domínio próprio (verificado + useBturb=true) que serve o
   * embed /v/<id>. Nunca usa trilhopag.com no anúncio.
   */
  customDomainId: z.string().min(1),
});

export async function createBturbVideo(input: z.infer<typeof CreateSchema>) {
  const userId = await requireUserId();
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };

  const resolved = await resolveDomainHost(
    userId,
    parsed.data.customDomainId,
    "useBturb",
  );
  if (!resolved) {
    return {
      ok: false as const,
      error:
        "Domínio inválido. Cadastre um domínio próprio em Domínios, verifique-o e ative 'Vídeos Bturb'.",
    };
  }

  const v = await prisma.bturbVideo.create({
    data: {
      userId,
      title: parsed.data.title,
      description: parsed.data.description,
      videoUrl: parsed.data.videoUrl,
      mimeType: parsed.data.mimeType,
      durationSeconds: parsed.data.durationSeconds,
      sizeBytes: parsed.data.sizeBytes,
      conversionKey: randomBytes(8).toString("hex"),
      customDomainId: resolved.customDomainId,
    },
  });
  revalidatePath("/dashboard/bturb");
  return { ok: true as const, id: v.id };
}

const UpdateSchema = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  smartAutoplay: z.boolean().optional(),
  autoplayMuted: z.boolean().optional(),
  silentAutoplay: z.boolean().optional(),
  turboSpeed: z.boolean().optional(),
  showProgress: z.boolean().optional(),
  fakeProgressBar: z.boolean().optional(),
  fakeProgressTotalSeconds: z.number().int().nullable().optional(),
  loop: z.boolean().optional(),
  hideControls: z.boolean().optional(),
  blockRightClick: z.boolean().optional(),
  downloadProtection: z.boolean().optional(),
  primaryColor: z.string().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  thumbnailPauseUrl: z.string().url().nullable().optional(),
  thumbnailEndUrl: z.string().url().nullable().optional(),
  ctaDelaySeconds: z.number().int().nullable().optional(),
  ctaText: z.string().nullable().optional(),
  ctaUrl: safeHttpUrl().nullable().optional(),
  ctaPlacement: z.enum(["below", "overlay"]).optional(),
  ctaCustomHtml: z.string().nullable().optional(),
  fbPixelId: z.string().nullable().optional(),
  tiktokPixelId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  customDomainId: z.string().min(1).optional(),
});

export async function updateBturbVideo(input: z.infer<typeof UpdateSchema>) {
  const userId = await requireUserId();
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Dados inválidos" };
  const { id, ...data } = parsed.data;
  const v = await prisma.bturbVideo.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!v) return { ok: false as const, error: "Vídeo não encontrado" };

  // Se está mudando o domínio, valida que é dele + verificado + useBturb
  if (data.customDomainId) {
    const resolved = await resolveDomainHost(
      userId,
      data.customDomainId,
      "useBturb",
    );
    if (!resolved) {
      return { ok: false as const, error: "Domínio inválido pra Bturb." };
    }
  }

  // XSS prevention: sanitiza ctaCustomHtml antes de gravar
  if (data.ctaCustomHtml !== undefined) {
    const { sanitizeHtml } = await import("@/lib/security/sanitize");
    data.ctaCustomHtml = data.ctaCustomHtml
      ? sanitizeHtml(data.ctaCustomHtml, "rich")
      : null;
  }
  await prisma.bturbVideo.update({ where: { id }, data });
  revalidatePath("/dashboard/bturb");
  revalidatePath(`/dashboard/bturb/${id}`);
  return { ok: true as const };
}

/** Lista domínios verificados do user disponíveis pra Bturb (UI). */
export async function listBturbDomains() {
  const userId = await requireUserId();
  return listVerifiedDomainsForFeature(userId, "useBturb");
}

export async function deleteBturbVideo(id: string) {
  const userId = await requireUserId();
  const v = await prisma.bturbVideo.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!v) return { ok: false as const, error: "Vídeo não encontrado" };
  await prisma.bturbVideo.delete({ where: { id } });
  revalidatePath("/dashboard/bturb");
  return { ok: true as const };
}

/**
 * Lista vídeos Bturb do user (id + título + thumbnail + videoUrl).
 * Usado pelo seletor de VSL no checkout builder.
 */
export async function listBturbVideosForPicker() {
  const userId = await requireUserId();
  const videos = await prisma.bturbVideo.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      videoUrl: true,
      thumbnailUrl: true,
      durationSeconds: true,
    },
  });
  // Mapeia pro shape esperado pelo picker (durationSec)
  return {
    ok: true as const,
    videos: videos.map((v) => ({
      id: v.id,
      title: v.title,
      videoUrl: v.videoUrl,
      thumbnailUrl: v.thumbnailUrl,
      durationSec: v.durationSeconds,
    })),
  };
}

export async function regenerateConversionKey(id: string) {
  const userId = await requireUserId();
  const v = await prisma.bturbVideo.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!v) return { ok: false as const, error: "Vídeo não encontrado" };
  const newKey = randomBytes(8).toString("hex");
  await prisma.bturbVideo.update({
    where: { id },
    data: { conversionKey: newKey },
  });
  revalidatePath(`/dashboard/bturb/${id}`);
  return { ok: true as const, conversionKey: newKey };
}
