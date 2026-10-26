"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * Media library do seller (21/07/2026, davi). Retorna as N últimas mídias
 * daquele tipo (image / video / audio / gif). Uploads via
 * /api/dashboard/upload?purpose=bot-funnel caem automaticamente aqui.
 */
export async function listMediaAssets(
  kind: "image" | "video" | "audio" | "gif",
  limit = 60,
): Promise<
  | { ok: true; items: Array<{ id: string; url: string; filename: string | null; createdAt: string; sizeBytes: number | null }> }
  | { ok: false; error: string }
> {
  const userId = await requireUserId();
  if (!["image", "video", "audio", "gif"].includes(kind)) {
    return { ok: false, error: "kind inválido" };
  }
  try {
    const items = await prisma.mediaAsset.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(1, limit)),
      select: { id: true, url: true, filename: true, createdAt: true, sizeBytes: true },
    });
    return {
      ok: true,
      items: items.map((i) => ({
        id: i.id,
        url: i.url,
        filename: i.filename,
        createdAt: i.createdAt.toISOString(),
        sizeBytes: i.sizeBytes,
      })),
    };
  } catch {
    // Tabela ainda não migrada em algum ambiente → devolve lista vazia
    // pra UI não quebrar. Depois da migração, funciona normal.
    return { ok: true, items: [] };
  }
}

/**
 * Registra um arquivo recém-subido na media library do seller.
 *
 * 24/07/2026 (davi: "O video fica carregando infinitamente") — antes isso
 * era feito no `onUploadCompleted` do handleUpload, que exige um callback
 * server-to-server da infra do Blob de volta pro deployment. Quando esse
 * callback não fechava, o `upload()` no browser nunca resolvia (spinner
 * infinito). Agora o próprio cliente chama esta action DEPOIS que o upload
 * terminou — mesmo efeito, sem callback nenhum no caminho crítico.
 *
 * Nunca lança: se falhar, o arquivo já está no Blob e o funil funciona
 * igual — só não aparece na aba Biblioteca.
 */
export async function registerMediaAsset(input: {
  url: string;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}): Promise<{ ok: boolean }> {
  try {
    const userId = await requireUserId();
    const url = String(input.url || "");
    if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) {
      return { ok: false };
    }
    const kind = kindFromMime(String(input.mimeType || ""));
    if (!kind) return { ok: false };

    // Idempotente: o cliente pode reenviar (retry de rede) e não queremos
    // duplicar a mesma URL na biblioteca.
    const existing = await prisma.mediaAsset.findFirst({
      where: { userId, url },
      select: { id: true },
    });
    if (existing) return { ok: true };

    await prisma.mediaAsset.create({
      data: {
        userId,
        kind,
        url,
        filename: input.filename?.slice(0, 200) || null,
        mimeType: input.mimeType || null,
        sizeBytes:
          typeof input.sizeBytes === "number" && input.sizeBytes > 0
            ? input.sizeBytes
            : null,
      },
    });
    return { ok: true };
  } catch (e) {
    console.warn("[registerMediaAsset] falhou:", e);
    return { ok: false };
  }
}

function kindFromMime(mime: string): "image" | "video" | "audio" | "gif" | null {
  if (!mime) return null;
  if (mime === "image/gif") return "gif";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** Remove um asset da biblioteca (não apaga o Blob — outros funis podem estar
 *  usando essa mesma URL; apagar quebraria eles). Só remove a REFERÊNCIA. */
export async function deleteMediaAsset(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const r = await prisma.mediaAsset.deleteMany({ where: { id, userId } });
  return r.count > 0 ? { ok: true } : { ok: false, error: "não encontrado" };
}
