import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * UPLOAD EM PEDAÇOS, 100% SAME-ORIGIN — o caminho que funciona quando o
 * browser do seller não consegue falar com `vercel.com`.
 *
 * 26/07/2026 (davi: "Aind ta carregando infinitamente!!! / ta dando erro de
 * 90s"). O upload direto browser→Blob é o caminho rápido e funciona pra
 * maioria, mas quando falha no ambiente do seller (CSP antiga em cache,
 * extensão/adblock, proxy corporativo) não existia plano B pra vídeo: a rota
 * server-side morre no teto de 4.5MB de body.
 *
 * Tentei antes um espelho same-origin (`/_blob` via rewrite) e NÃO dá:
 *   - rewrite da Edge devolve 413 a partir de ~4.4MB (medido: 4MB passa,
 *     4.4MB não) — o teto de 4.5MB vale pra Function E pra rewrite;
 *   - as partes do multipart do SDK são de 8MB, e não são configuráveis;
 *   - baixar pra 4MB por parte também não resolve, porque o Blob exige o
 *     mínimo de 5MB do S3 ("Your proposed upload is smaller than the minimum
 *     allowed size" — testado com 4MB e 3.5MB).
 * 4.5MB de teto contra 5MB de mínimo: não fecha por nenhum lado.
 *
 * Então aqui NÃO se usa multipart. O cliente manda pedaços abaixo do teto,
 * cada um vira um blob temporário, e no fim o servidor emenda tudo num único
 * `put()` com stream — o mínimo de 5MB não existe nesse caminho, e o stream
 * evita segurar o arquivo inteiro na memória da função.
 *
 * Fluxo:
 *   init   → devolve um ticket assinado (HMAC) com userId + sessão + limites
 *   part   → body cru do pedaço → blob temporário `tmp-upload/<user>/<sess>/`
 *   finish → emenda os temporários em ordem no arquivo final, apaga os
 *            temporários e registra na media library
 *
 * O ticket é assinado pra que o cliente não consiga trocar userId, tamanho ou
 * content-type entre as chamadas — o servidor não guarda estado nenhum entre
 * as requisições.
 */

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif",
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/ogg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm",
]);

/** Teto do arquivo montado. Acima disso a emenda numa função fica arriscada. */
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
/** Teto de um pedaço. O limite da plataforma é 4.5MB — margem pros headers. */
const MAX_PART_BYTES = 4 * 1024 * 1024;
/** Ticket curto: sessão de upload não deveria passar de algumas horas. */
const TICKET_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PARTS = Math.ceil(MAX_TOTAL_BYTES / (3.5 * 1024 * 1024)) + 8;

type Ticket = {
  u: string; // userId
  s: string; // sessionId
  n: string; // filename original
  t: string; // contentType
  z: number; // tamanho total declarado
  e: number; // expiração (epoch ms)
};

function ticketSecret(): string {
  return (
    process.env.UPLOAD_CHUNK_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    process.env.APP_ENCRYPTION_KEY ??
    ""
  );
}

function signTicket(t: Ticket): string {
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  const mac = createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function verifyTicket(raw: unknown, userId: string): Ticket | null {
  if (typeof raw !== "string" || !raw.includes(".")) return null;
  const [payload, mac] = raw.split(".", 2);
  if (!payload || !mac) return null;

  const expected = createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let t: Ticket;
  try {
    t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Ticket;
  } catch {
    return null;
  }
  // O ticket é assinado, mas ainda assim confere contra a sessão ATUAL: um
  // ticket vazado não serve pra escrever na conta de outro seller.
  if (t.u !== userId) return null;
  if (!t.e || Date.now() > t.e) return null;
  return t;
}

/** Prefixo dos temporários. Contém userId + sessão, então dá pra validar as
 *  URLs que o cliente devolve sem confiar nelas. */
function tmpPrefix(t: Ticket): string {
  return `tmp-upload/${t.u}/${t.s}/`;
}

function safeExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "bin";
  return filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
}

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
    return NextResponse.json(
      { error: "blob_not_configured", message: "Storage não configurado." },
      { status: 503 },
    );
  }
  if (!ticketSecret()) {
    console.error("[upload-chunk] sem secret pra assinar ticket");
    return NextResponse.json({ error: "misconfigured" }, { status: 503 });
  }

  const action = new URL(request.url).searchParams.get("action");

  if (action === "init") return handleInit(request, userId);
  if (action === "part") return handlePart(request, userId);
  if (action === "finish") return handleFinish(request, userId);

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

async function handleInit(request: Request, userId: string): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const filename = String(body.filename ?? "arquivo").slice(0, 200);
  const contentType = String(body.contentType ?? "");
  const size = Number(body.size ?? 0);

  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "invalid_size" }, { status: 400 });
  }
  if (size > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        error: "too_large",
        message: `Arquivo muito grande (máx ${Math.floor(MAX_TOTAL_BYTES / 1024 / 1024)}MB por este caminho).`,
      },
      { status: 413 },
    );
  }
  if (contentType && !ALLOWED_MIME.has(contentType)) {
    return NextResponse.json(
      { error: "bad_type", message: "Tipo de arquivo não suportado." },
      { status: 415 },
    );
  }

  const ticket: Ticket = {
    u: userId,
    s: randomBytes(9).toString("base64url"),
    n: filename,
    t: contentType,
    z: size,
    e: Date.now() + TICKET_TTL_MS,
  };
  console.log("[upload-chunk] init", { userId, size, contentType });
  return NextResponse.json({
    ok: true,
    ticket: signTicket(ticket),
    partSize: 3.5 * 1024 * 1024,
  });
}

async function handlePart(request: Request, userId: string): Promise<NextResponse> {
  const ticket = verifyTicket(request.headers.get("x-upload-ticket"), userId);
  if (!ticket) return NextResponse.json({ error: "bad_ticket" }, { status: 403 });

  const n = Number(new URL(request.url).searchParams.get("n"));
  if (!Number.isInteger(n) || n < 0 || n > MAX_PARTS) {
    return NextResponse.json({ error: "bad_part_number" }, { status: 400 });
  }

  const bytes = await request.arrayBuffer().catch(() => null);
  if (!bytes || bytes.byteLength === 0) {
    return NextResponse.json({ error: "empty_part" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_PART_BYTES) {
    return NextResponse.json({ error: "part_too_large" }, { status: 413 });
  }

  try {
    // Nome fixo por índice + overwrite: reenviar um pedaço que falhou não
    // duplica nada, o retry simplesmente sobrescreve.
    const blob = await put(
      `${tmpPrefix(ticket)}${String(n).padStart(4, "0")}`,
      Buffer.from(bytes),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/octet-stream",
      },
    );
    return NextResponse.json({ ok: true, n, url: blob.url });
  } catch (e) {
    console.error("[upload-chunk] parte falhou", { userId, n, e });
    return NextResponse.json(
      { error: "part_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}

async function handleFinish(request: Request, userId: string): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as {
    ticket?: unknown;
    urls?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const ticket = verifyTicket(body.ticket, userId);
  if (!ticket) return NextResponse.json({ error: "bad_ticket" }, { status: 403 });

  const urls = Array.isArray(body.urls) ? body.urls.map(String) : [];
  if (urls.length === 0 || urls.length > MAX_PARTS) {
    return NextResponse.json({ error: "bad_parts" }, { status: 400 });
  }
  // As URLs vêm do cliente, então TODAS precisam estar dentro do prefixo desta
  // sessão. Sem isso, dava pra mandar o servidor emendar qualquer URL pública
  // (SSRF) ou o arquivo temporário de outro seller.
  const prefix = tmpPrefix(ticket);
  const bad = urls.find(
    (u) =>
      !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//.test(u) ||
      !u.includes(prefix),
  );
  if (bad) {
    console.warn("[upload-chunk] url de parte fora da sessão", { userId, bad });
    return NextResponse.json({ error: "bad_part_url" }, { status: 400 });
  }

  const finalPath = `bot-funnel/${Date.now()}-${randomBytes(5).toString("hex")}.${safeExt(ticket.n)}`;

  try {
    const blob = await put(finalPath, concatStream(urls), {
      access: "public",
      contentType: ticket.t || undefined,
      addRandomSuffix: true,
    });

    // ⚠️ Os dois `await` abaixo são obrigatórios — não troque por
    // fire-and-forget (`void`/sem await). Medido em produção em 26/07/2026:
    // a Function congela assim que a resposta sai, então promessa pendente
    // simplesmente não roda. Com `void del(...)` os temporários NUNCA eram
    // apagados (cada upload cobrava storage em dobro, pra sempre) e o
    // MediaAsset não entrava na biblioteca do seller. Não existe `waitUntil`
    // aqui (o @vercel/functions não é dependência do projeto).
    //
    // Custo real: ~200ms num vídeo de 10MB. Falha em qualquer um dos dois é
    // logada mas não derruba o upload — o arquivo final já está de pé.
    const kind = kindFromMime(ticket.t);
    await Promise.allSettled([
      del(urls).catch((e) => {
        console.warn("[upload-chunk] limpeza dos temporários falhou:", e);
        throw e;
      }),
      kind
        ? prisma.mediaAsset
            .create({
              data: {
                userId,
                kind,
                url: blob.url,
                filename: ticket.n || null,
                mimeType: ticket.t || null,
                sizeBytes: ticket.z || null,
              },
            })
            .catch((e) => {
              console.warn("[upload-chunk] media library falhou:", e);
              throw e;
            })
        : Promise.resolve(),
    ]);

    console.log("[upload-chunk] finish OK", { userId, parts: urls.length, url: blob.url });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (e) {
    console.error("[upload-chunk] emenda falhou", { userId, e });
    // await pelo mesmo motivo do caminho de sucesso: sem isso os temporários
    // do upload que falhou ficariam pra trás.
    await del(urls).catch(() => {});
    return NextResponse.json(
      { error: "assemble_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}

/**
 * Emenda os pedaços em ordem, sem materializar o arquivo inteiro: puxa um
 * blob temporário por vez e repassa os bytes conforme o `put()` consome.
 */
function concatStream(urls: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (!reader) {
          if (i >= urls.length) {
            controller.close();
            return;
          }
          const res = await fetch(urls[i]!, { cache: "no-store" });
          if (!res.ok || !res.body) {
            throw new Error(`parte ${i} indisponível (HTTP ${res.status})`);
          }
          i++;
          reader = res.body.getReader();
        }
        const { done, value } = await reader.read();
        if (done) {
          reader = null;
          continue;
        }
        controller.enqueue(value);
        return;
      }
    },
    async cancel() {
      await reader?.cancel().catch(() => {});
    },
  });
}

function kindFromMime(mime: string): "image" | "video" | "audio" | "gif" | null {
  if (!mime) return null;
  if (mime === "image/gif") return "gif";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}
