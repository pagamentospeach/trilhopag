import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 26/07/2026: varre os pedaços órfãos do `/api/dashboard/upload-chunk`.
 *
 * O caminho feliz já limpa sozinho (o `finish` apaga os temporários antes de
 * responder). Isto aqui cobre o caminho infeliz, que é comum: o seller fecha
 * a aba no meio do upload de um vídeo, ou perde o 4G. Os pedaços que já
 * subiram ficam em `tmp-upload/` sem ninguém pra apagar — e um vídeo de
 * 100MB deixa ~29 pedaços de 3.5MB pra trás.
 *
 * Corta em 24h porque o ticket de upload vale 6h; nada em `tmp-upload/` com
 * mais de um dia pode estar em uso.
 */
const PREFIX = "tmp-upload/";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;

  try {
    do {
      const page = await list({ prefix: PREFIX, limit: 1000, cursor });
      scanned += page.blobs.length;

      const stale = page.blobs
        .filter((b) => b.uploadedAt.getTime() < cutoff)
        .map((b) => b.url);

      // `del` aceita lote; mandamos em fatias pra não montar payload gigante.
      for (let i = 0; i < stale.length; i += 100) {
        const slice = stale.slice(i, i + 100);
        await del(slice);
        deleted += slice.length;
      }

      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (e) {
    console.error("[upload-parts-cleanup] falhou", e);
    return NextResponse.json(
      {
        error: "cleanup_failed",
        message: e instanceof Error ? e.message : "unknown",
        scanned,
        deleted,
      },
      { status: 500 },
    );
  }

  if (deleted > 0) {
    console.log("[upload-parts-cleanup] removidos", { scanned, deleted });
  }
  return NextResponse.json({ ok: true, scanned, deleted });
}
