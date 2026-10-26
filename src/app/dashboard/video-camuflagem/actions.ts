"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

/**
 * Video Camuflagem agora é 100% GRÁTIS — nenhum débito no saldo.
 * O processamento real ocorre no browser (ffmpeg.wasm) — esta action só
 * registra o log e incrementa o contador de uso (estatística).
 * (Antes: 20 conversões grátis e R$ 0,10/uso após. Removido jun/2026.)
 */
export async function logVideoCamuflagemUse({
  sizeBytes,
  preset,
  success,
  errorMessage,
}: {
  sizeBytes: number;
  preset: string;
  success: boolean;
  errorMessage?: string;
}) {
  const userId = await requireUserId();

  // Validações básicas
  if (typeof sizeBytes !== "number" || sizeBytes < 0) {
    return { ok: false as const, error: "Tamanho inválido" };
  }
  if (typeof preset !== "string" || preset.length > 30) {
    return { ok: false as const, error: "Preset inválido" };
  }
  if (sizeBytes > 500 * 1024 * 1024) {
    return { ok: false as const, error: "Arquivo muito grande (limite 500MB)" };
  }

  // GRÁTIS — só conta uso success (estatística). Falhas não incrementam.
  // Nenhum débito no saldo.
  if (success) {
    await prisma.user.update({
      where: { id: userId },
      data: { metadadosUsesUsed: { increment: 1 } },
    });
  }

  await prisma.videoCamuflagem.create({
    data: {
      userId,
      originalUrl: "browser-processed", // processamento client-side, sem upload
      processedUrl: success ? "browser-processed" : null,
      status: success ? "done" : "failed",
      errorMessage: errorMessage ?? null,
      sizeBytes,
      preset,
    },
  });

  revalidatePath("/dashboard/video-camuflagem");
  // charged sempre false agora (recurso grátis) — mantido p/ compat. da API.
  return { ok: true as const, charged: false };
}
