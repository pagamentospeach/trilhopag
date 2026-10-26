import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * Upload de arquivos (KYC, produtos, checkout, etc).
 *
 * Server-side via @vercel/blob `put` — confiável e simples. O cliente
 * (FileUpload) COMPRIME imagens antes de enviar, então o corpo fica bem
 * abaixo do limite de ~4.5MB da função serverless da Vercel. Arquivos não
 * comprimíveis (PDF/vídeo) acima disso são barrados no cliente com mensagem
 * clara, então nunca chegam a estourar o limite da função.
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10MB (teto lógico; imagens são comprimidas)

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/gif", // 20/07/2026 (davi): funil do bot aceita GIF/animation
  "application/pdf",
  // Vídeo curto pra galeria do TikTok Shop + funil do bot
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov (iPhone default)
  // Áudio pro funil do bot (Telegram sendAudio/sendVoice)
  "audio/mpeg", // .mp3
  "audio/ogg", // .ogg / .oga (Telegram voice)
  "audio/mp4", // .m4a
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

export async function POST(request: Request) {
  const userId = await requireUserId();
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  const purpose = String(form.get("purpose") || "misc").replace(
    /[^a-z0-9_-]/gi,
    "",
  );
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Arquivo muito grande (máx 10MB)." },
      { status: 413 },
    );
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      {
        error: "bad_type",
        message:
          "Tipo não suportado. Use JPG, PNG, WEBP, HEIC, GIF, PDF, MP4/WEBM/MOV, MP3/OGG/M4A/WAV.",
      },
      { status: 415 },
    );
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeExt = ext?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const id = randomBytes(8).toString("hex");
  const path = `users/${userId}/${purpose}/${Date.now()}-${id}.${safeExt}`;

  try {
    const blob = await put(path, file, {
      access: "public",
      contentType: file.type || undefined,
      addRandomSuffix: false,
    });

    // 21/07/2026 (davi): media library — arquivos com purpose="bot-funnel"
    // caem automaticamente na biblioteca do seller pra reuso em outros funis.
    // Se falhar (tabela ainda não migrada, race, etc), NÃO propaga — o upload
    // em si já foi bem-sucedido e o funil funciona igual.
    if (purpose === "bot-funnel") {
      const kind = kindFromMime(file.type);
      if (kind) {
        prisma.mediaAsset
          .create({
            data: {
              userId,
              kind,
              url: blob.url,
              filename: file.name || null,
              mimeType: file.type || null,
              sizeBytes: file.size || null,
            },
          })
          .catch((e) => console.warn("[upload] media library insert falhou:", e));
      }
    }

    return NextResponse.json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
      type: file.type,
    });
  } catch (e) {
    console.error("[upload] blob error:", e);
    return NextResponse.json(
      { error: "upload_failed", message: "Falha ao subir o arquivo." },
      { status: 500 },
    );
  }
}

/** Deriva o `kind` da media library a partir do MIME type do upload.
 *  Retorna null se for algo que a biblioteca não indexa (ex: PDF). */
function kindFromMime(mime: string): "image" | "video" | "audio" | "gif" | null {
  if (!mime) return null;
  if (mime === "image/gif") return "gif";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}
