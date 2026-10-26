import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUserId } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 22/07/2026 (davi: "Nao po, eu quero que os sellers consigam upar um video
 * no bot de telegram da trilho"). Upload DIRETO pro Vercel Blob (bypass do
 * limite 4.5MB do serverless).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 24/07/2026 (davi: "O video fica carregando infinitamente") — CORREÇÃO.
 *
 * A v1 desta rota usava `onUploadCompleted` pra registrar o arquivo na
 * MediaAsset library. ERRO CONHECIDO neste repo (ver histórico no header de
 * src/app/api/bturb/upload/route.ts: "handleUpload + onUploadCompleted →
 * trava em 'carregando'").
 *
 * Motivo: quando `onUploadCompleted` existe, o SDK embute um `callbackUrl`
 * no client token e o SERVIÇO do Blob (infra da Vercel) precisa fazer um
 * POST server-to-server de volta pra esta rota. O upload só é considerado
 * concluído depois que esse callback responde 200. Se ele não chega
 * (deployment protection, preview URL, localhost, cold start lento), o
 * `upload()` no browser NUNCA resolve → spinner infinito.
 *
 * Correção: sem `onUploadCompleted`. O registro na media library virou uma
 * server action (`registerMediaAsset`) chamada pelo próprio cliente depois
 * que o upload resolve. Mesmo resultado, zero dependência de callback.
 *
 * Bug #2 (silencioso): o `pathname` devolvido pelo onBeforeGenerateToken é
 * IGNORADO pelo SDK — ele assina sempre o pathname que o CLIENTE mandou
 * (handleUpload faz `{...tokenOptions, pathname}` com o pathname do body).
 * Ou seja: o namespace `users/<id>/` nunca era aplicado e todo mundo subia
 * na raiz do bucket com o nome original do arquivo. Com addRandomSuffix
 * false + allowOverwrite false, o SEGUNDO seller que subisse um "video.mp4"
 * tomava erro de blob duplicado. Agora o cliente manda o path completo, a
 * rota VALIDA, e sufixo aleatório + overwrite ficam ligados como rede de
 * segurança.
 */

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif",
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/ogg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm",
]);

const MAX_BYTES = 500 * 1024 * 1024; // 500MB

export async function POST(request: Request): Promise<NextResponse> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json(
      { error: "unauthorized", message: "Faça login pra subir arquivos." },
      { status: 401 },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("[upload-client-token] BLOB_READ_WRITE_TOKEN ausente!");
    return NextResponse.json(
      {
        error: "blob_not_configured",
        message: "Storage não configurado (BLOB_READ_WRITE_TOKEN faltando).",
      },
      { status: 503 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        console.log("[upload-client-token] token pedido", { userId, pathname });
        return {
          allowedContentTypes: [...ALLOWED_MIME],
          maximumSizeInBytes: MAX_BYTES,
          // Sufixo aleatório + overwrite: mata colisão de nome entre sellers
          // (o SDK assina o pathname do cliente, não dá pra reescrever aqui).
          addRandomSuffix: true,
          allowOverwrite: true,
          // 6h — vídeo de 500MB em 3G do seller demora. Token curto expirava
          // no meio do multipart e as partes seguintes ficavam em retry.
          validUntil: Date.now() + 6 * 60 * 60 * 1000,
        };
        // SEM onUploadCompleted / callbackUrl — ver comentário no topo.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    console.error("[upload-client-token] handleUpload falhou:", e);
    return NextResponse.json(
      {
        error: "upload_token_failed",
        message: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
