import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUserId } from "@/lib/auth-helpers";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Vercel Pro permite até 4.5MB de body. Pra files maiores precisamos
// migrar pra outra estratégia (Tus/multipart presigned URL). Por ora,
// 4MB é confortável pra a maioria das VSLs de teste.
export const runtime = "nodejs";

/**
 * Upload Bturb — versão TOTALMENTE SERVER-SIDE.
 *
 * Histórico (5 tentativas anteriores falharam):
 *  1. handleUpload + onUploadCompleted → trava em "carregando"
 *  2. + multipart → "request was aborted"
 *  3. sem AbortController → 0% pra sempre
 *  4. generateClientTokenFromReadWriteToken + put() client → ainda travava
 *
 * Esta versão é a quinta e definitiva:
 *  - Client envia FormData direto pra esta rota
 *  - Servidor usa `put` SERVER-SIDE do @vercel/blob (não o /client!)
 *  - Sem callbacks, sem token signing, sem client SDK
 *
 * Limite: Vercel Functions body de 4.5MB. Pra files maiores, próximo passo
 * seria implementar TUS/multipart upload com URLs presignadas — mas a
 * grande maioria das VSLs de teste cabem em 4MB.
 *
 * Log AGRESSIVO em cada etapa pra que qualquer falha futura seja visível
 * em /admin01 → vercel logs.
 */
export async function POST(request: Request) {
  console.log("[bturb/upload] ===== INCOMING REQUEST =====");

  let userId: string;
  try {
    userId = await requireUserId();
    console.log("[bturb/upload] auth OK userId=" + userId);
  } catch (e) {
    console.error("[bturb/upload] auth FAIL:", e);
    return NextResponse.json(
      { error: "unauthorized", message: "Faça login pra subir vídeos." },
      { status: 401 },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("[bturb/upload] BLOB_READ_WRITE_TOKEN não configurado!");
    return NextResponse.json(
      {
        error: "blob_not_configured",
        message: "Blob storage não configurado (env var faltando).",
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[bturb/upload] formData parse fail:", e);
    return NextResponse.json(
      { error: "invalid_form", message: "Corpo da requisição inválido." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  // FormData.get retorna File | string | null. Pra arquivos, é sempre
  // um File-like com size/name/type. Checamos pelo método 'arrayBuffer'.
  if (
    !file ||
    typeof file === "string" ||
    typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
  ) {
    console.error("[bturb/upload] no file in formData");
    return NextResponse.json(
      { error: "no_file", message: "Nenhum arquivo enviado." },
      { status: 400 },
    );
  }

  const blobFile = file as Blob & { name?: string };
  const fileSize = blobFile.size;
  const fileName = blobFile.name ?? `video-${Date.now()}.mp4`;
  const fileType = blobFile.type || "video/mp4";

  console.log("[bturb/upload] file received", {
    name: fileName,
    sizeMB: (fileSize / 1024 / 1024).toFixed(2),
    type: fileType,
  });

  // Validações
  if (fileSize > 4 * 1024 * 1024) {
    console.warn("[bturb/upload] file too large:", fileSize);
    return NextResponse.json(
      {
        error: "file_too_large",
        message:
          "Arquivo excede 4MB. Pra vídeos maiores, comprima antes ou use a opção 'URL externa'.",
      },
      { status: 413 },
    );
  }

  // Sanitiza nome
  const safeName =
    fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) ||
    `video-${Date.now()}.mp4`;
  const id = randomBytes(6).toString("hex");
  const pathname = `users/${userId}/bturb/${Date.now()}-${id}-${safeName}`;

  try {
    console.log("[bturb/upload] uploading to blob storage…", { pathname });
    const blob = await put(pathname, blobFile, {
      access: "public",
      contentType: fileType,
      addRandomSuffix: false,
    });
    console.log("[bturb/upload] ✓ uploaded successfully", { url: blob.url });

    return NextResponse.json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: fileSize,
    });
  } catch (e) {
    console.error("[bturb/upload] put() FAILED:", e);
    return NextResponse.json(
      {
        error: "blob_put_failed",
        message:
          e instanceof Error
            ? e.message.slice(0, 300)
            : "Erro ao enviar para o storage.",
      },
      { status: 500 },
    );
  }
}
