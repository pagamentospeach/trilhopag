/**
 * Runtime do FUNIL DE CONVERSA do bot (Telegram).
 *
 * Blocos: message · image · video · audio · gif · delay · buttons · poll ·
 * location · random · payment · botproduct · reengage · input · coupon ·
 * condition.
 *
 * Pausas (bloqueios do fluxo):
 *  - `botproduct` / `payment` (mode chat) → gera PIX, aguarda pagamento
 *  - `buttons`   → aguarda clique (callback_query)
 *  - `poll`      → aguarda resposta (poll_answer)
 *  - `input`     → aguarda mensagem de texto do cliente
 *  - `reengage`  → dorme até scheduledResumeAt (cron acorda), manda a próxima
 *                  mensagem da sequência e dorme de novo
 *
 * Todo evento executado emite BotAnalyticsEvent (drop-off analytics).
 *
 * SEGURANÇA: só roda quando `SaleBot.funnelRuntimeEnabled === true` E há um
 * funil de bot ATIVO. Default false → nenhum bot existente é afetado.
 */
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { generateBotFunnelPix } from "@/lib/bot-funnel-pix";

/* ------------------------------ Telegram -------------------------------- */

function tgApi(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

type InlineButton =
  | { text: string; url: string }
  | { text: string; callback_data: string }
  /**
   * 22/07/2026 (davi: "quando a pessoa clica no botao de copiar o pix ja
   * copie o pix DIRETO"). Bot API 7.7+ (jul/2024): botão que copia texto
   * pro clipboard do cliente em 1 clique. Limite: 256 chars no `text` do
   * copy_text. PIX EMV pode passar disso — fallback é callback_data que
   * re-envia como `<code>` (tap-to-copy manual).
   */
  | { text: string; copy_text: { text: string } };
type InlineKeyboard = InlineButton[][];

async function tgSend(
  token: string,
  chatId: string,
  text: string,
  opts?: { html?: boolean; keyboard?: InlineKeyboard; disablePreview?: boolean },
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: opts?.disablePreview ?? true,
  };
  if (opts?.html) body.parse_mode = "HTML";
  if (opts?.keyboard) body.reply_markup = { inline_keyboard: opts.keyboard };
  await fetch(tgApi(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
async function tgSendPhoto(
  token: string,
  chatId: string,
  photo: string,
  caption: string,
  keyboard?: InlineKeyboard,
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
  };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(tgApi(token, "sendPhoto"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
/**
 * Envia foto binária (Buffer) via multipart/form-data. Usado pra QR codes
 * gerados no server (SafePix não devolve imagem, geramos com lib qrcode).
 */
async function tgSendPhotoBuffer(
  token: string,
  chatId: string,
  buffer: Buffer,
  caption: string,
  filename = "qr.png",
): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append("chat_id", chatId);
    if (caption) {
      fd.append("caption", caption.slice(0, 1000));
      fd.append("parse_mode", "HTML");
    }
    const blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
    fd.append("photo", blob, filename);
    const res = await fetch(tgApi(token, "sendPhoto"), { method: "POST", body: fd });
    return res.ok;
  } catch (e) {
    console.warn("[tgSendPhotoBuffer] falhou:", e);
    return false;
  }
}
/** Converte data URL (base64) em Buffer e envia via multipart. */
async function tgSendPhotoDataUrl(
  token: string,
  chatId: string,
  dataUrl: string,
  caption: string,
): Promise<boolean> {
  const m = dataUrl.match(/^data:image\/(?:png|jpeg|jpg);base64,(.+)$/);
  if (!m) return false;
  const buf = Buffer.from(m[1], "base64");
  return tgSendPhotoBuffer(token, chatId, buf, caption);
}

/**
 * 22/07/2026 (davi print): mensagem estilizada do PIX após o bot gerar a
 * cobrança. Layout:
 *  - Título (⚡ Pagamento via PIX Copia e Cola ⚡) — negrito, com emoji
 *  - Bloco <code> com o EMV (Telegram permite tap-to-copy)
 *  - Legenda explicativa
 *  - Até 3 botões inline (Copiar código / Pagar via QR / Já paguei)
 * Tudo configurável pelo seller (ver PaymentData no board).
 */
async function tgSendPixPaymentUI(
  token: string,
  chatId: string,
  opts: {
    title: string;
    copyPaste: string;
    instruction: string;
    help?: string;
    copyButtonLabel?: string;
    qrButtonLabel?: string;
    verifyButtonLabel?: string;
    showCopyButton: boolean;
    showQrButton: boolean;
    showVerifyButton: boolean;
    /** 22/07/2026 (davi feature 4): countdown timer. Se passado, mostra
     *  "⏰ Este PIX expira em Xmin (HH:MM)" logo antes da instrução. */
    expiresAt?: Date | null;
  },
): Promise<void> {
  const parts: string[] = [];
  if (opts.title.trim()) {
    parts.push(`<b>${escapeHtml(opts.title.trim())}</b>`);
  }
  parts.push(`<code>${escapeHtml(opts.copyPaste)}</code>`);
  if (opts.expiresAt) {
    const now = Date.now();
    const diffMs = opts.expiresAt.getTime() - now;
    if (diffMs > 0) {
      const totalMin = Math.floor(diffMs / 60_000);
      const timeStr =
        totalMin >= 60
          ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}min`
          : `${totalMin} minutos`;
      const hhmm = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(opts.expiresAt);
      parts.push(`⏰ <b>Este PIX expira em ${timeStr}</b> (${hhmm})`);
    }
  }
  if (opts.instruction.trim()) {
    parts.push(opts.instruction.trim());
  }
  if (opts.help && opts.help.trim()) {
    parts.push(opts.help.trim());
  }
  const text = parts.join("\n\n");

  const kb: InlineKeyboard = [];
  if (opts.showCopyButton) {
    const copyLabel = opts.copyButtonLabel || "📋 Copiar código PIX";
    // 22/07/2026 (davi): Bot API 7.7+ tem `copy_text` — clique copia
    // direto pro clipboard (sem alertinha nem clique extra no <code>).
    // Limite: 256 chars. PIX EMV varia — se passar, fallback callback.
    if (opts.copyPaste.length <= 256) {
      kb.push([
        { text: copyLabel, copy_text: { text: opts.copyPaste } },
      ]);
    } else {
      // Fallback pra códigos maiores que 256 (raro): callback re-envia
      // como <code> pra cliente tap-copy manual.
      kb.push([
        { text: copyLabel, callback_data: "pixcopy" },
      ]);
    }
  }
  if (opts.showQrButton) {
    kb.push([
      { text: opts.qrButtonLabel || "📱 Pagar via QR Code", callback_data: "pixqr" },
    ]);
  }
  if (opts.showVerifyButton) {
    kb.push([
      { text: opts.verifyButtonLabel || "✅ Já paguei, verificar", callback_data: "pixcheck" },
    ]);
  }

  await tgSend(token, chatId, text, {
    html: true,
    keyboard: kb.length ? kb : undefined,
  });
}

/**
 * Envia vídeo com fallback duplo (davi 22/07/2026: "Video no bot nao esta
 * carregando"). Causa comum: Telegram falha em baixar da URL quando:
 *  - Content-Type do host é octet-stream (Vercel Blob às vezes)
 *  - URL redireciona (nossa Blob sem redirect, mas alguns proxies têm)
 *  - Tamanho > 20MB no envio-por-URL (limite Telegram)
 *
 * Estratégia:
 *   1. Tenta enviar por URL (rápido, Telegram baixa direto)
 *   2. Se falhar, baixa nosso lado e sobe via multipart (limite 50MB)
 *   3. Loga erro do Telegram (era silenciado antes, cegou o problema)
 */
async function tgSendVideo(
  token: string,
  chatId: string,
  video: string,
  caption?: string,
  keyboard?: InlineKeyboard,
): Promise<boolean> {
  // === Tentativa 1: por URL ===
  try {
    const res = await fetch(tgApi(token, "sendVideo"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        video,
        ...(caption ? { caption, parse_mode: "HTML" } : {}),
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
        supports_streaming: true,
      }),
    });
    if (res.ok) return true;
    const j = (await res.json().catch(() => ({}))) as {
      description?: string;
      error_code?: number;
    };
    console.warn(
      "[tgSendVideo] URL falhou, tentando multipart:",
      j.error_code,
      j.description,
      "url:",
      video.slice(0, 100),
    );
  } catch (e) {
    console.warn("[tgSendVideo] URL exception:", e);
  }

  // === Tentativa 2: baixa + multipart ===
  try {
    const dl = await fetch(video);
    if (!dl.ok) {
      console.warn("[tgSendVideo] download falhou:", dl.status, video.slice(0, 100));
      return false;
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    // Telegram limite: 50MB via multipart. Guarda.
    if (buf.length > 50 * 1024 * 1024) {
      console.warn(
        "[tgSendVideo] video muito grande pra multipart:",
        buf.length,
        "bytes",
      );
      return false;
    }
    const inferred =
      dl.headers.get("content-type")?.split(";")[0]?.trim() || "video/mp4";
    const contentType =
      inferred.startsWith("video/") ? inferred : "video/mp4";
    const filename =
      video.split("/").pop()?.split("?")[0] || "video.mp4";
    const fd = new FormData();
    fd.append("chat_id", chatId);
    if (caption) {
      fd.append("caption", caption.slice(0, 1000));
      fd.append("parse_mode", "HTML");
    }
    fd.append("supports_streaming", "true");
    // multipart não aceita objeto: reply_markup vai como JSON string.
    if (keyboard) fd.append("reply_markup", JSON.stringify({ inline_keyboard: keyboard }));
    const blob = new Blob([new Uint8Array(buf)], { type: contentType });
    fd.append("video", blob, filename);
    const res = await fetch(tgApi(token, "sendVideo"), { method: "POST", body: fd });
    if (res.ok) return true;
    const j = (await res.json().catch(() => ({}))) as {
      description?: string;
      error_code?: number;
    };
    console.warn(
      "[tgSendVideo] multipart falhou:",
      j.error_code,
      j.description,
    );
    return false;
  } catch (e) {
    console.warn("[tgSendVideo] multipart exception:", e);
    return false;
  }
}
/**
 * Álbum: várias mídias numa mensagem só (davi 01/08/2026: "poderia colocar
 * uma opção pra agrupar as imagens e videos tipo assim").
 *
 * No Telegram isso é `sendMediaGroup`. As regras da API é que ditam o
 * desenho da feature:
 *  - 2 a 10 itens. Com 1 item a API dá erro — por isso o walker só agrupa
 *    a partir do segundo.
 *  - foto e vídeo podem se misturar no mesmo álbum. Áudio e documento NÃO
 *    (cada um só com iguais) e GIF/animation nem entra. Daí a opção só
 *    aparecer nos blocos de imagem e vídeo.
 *  - a legenda que aparece embaixo do álbum é a do 1º item; as outras só
 *    aparecem quando o cliente abre cada mídia.
 *
 * Devolve false em qualquer falha, pra quem chamou reenviar item a item —
 * que é o caminho antigo, com fallback de download+multipart no vídeo.
 */
type AlbumItem = { type: "photo" | "video"; url: string; caption?: string };

async function tgSendMediaGroup(
  token: string,
  chatId: string,
  items: AlbumItem[],
): Promise<boolean> {
  if (items.length < 2 || items.length > 10) return false;
  const media = items.map((it) => ({
    type: it.type,
    media: it.url,
    ...(it.caption ? { caption: trimCaption(it.caption), parse_mode: "HTML" } : {}),
    ...(it.type === "video" ? { supports_streaming: true } : {}),
  }));
  try {
    const res = await fetch(tgApi(token, "sendMediaGroup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, media }),
    });
    if (res.ok) return true;
    const j = (await res.json().catch(() => ({}))) as {
      description?: string;
      error_code?: number;
    };
    console.warn(
      "[tgSendMediaGroup] falhou, caindo pro envio individual:",
      j.error_code,
      j.description,
      `${items.length} itens`,
    );
    return false;
  } catch (e) {
    console.warn("[tgSendMediaGroup] exception:", e);
    return false;
  }
}

/**
 * Áudio como MENSAGEM DE VOZ (a bolinha com a ondinha), não como arquivo.
 *
 * === Histórico, porque este bug já voltou duas vezes ===
 *
 * 01/08/2026 (davi mandou print): o bloco de áudio usava `sendAudio`, e o
 * Telegram desenha isso como faixa de música — cartão com o NOME DO ARQUIVO.
 * Como o nome é a chave do nosso Blob, o cliente recebia
 * "1785887314253-lv1qk2zy-copy_1-QNUHhUkh...". Trocamos pra `sendVoice`.
 *
 * 06/08/2026 (davi mandou o MESMO print de novo): continuava cartão. O
 * motivo é sutil e é o coração desta função — **o Telegram responde HTTP
 * 200 pro `sendVoice` com MP3 e mesmo assim REBAIXA a renderização pra
 * faixa de música**. Ou seja: `res.ok` não quer dizer "virou ondinha".
 * A única prova é o corpo da resposta:
 *
 *   { ok: true, result: { voice: {...} } }  → ondinha ✅
 *   { ok: true, result: { audio: {...} } }  → cartão de música ❌
 *   { ok: true, result: { document: {...}}} → anexo ❌
 *
 * Por isso aqui a gente LÊ o `result` e só devolve "voz" quando existe
 * `result.voice`. Se o Telegram rebaixou, apagamos a mensagem (o bot pode
 * apagar as próprias por 48h) e tentamos de novo por multipart; se ainda
 * assim rebaixar, devolvemos "rebaixado" e o chamador manda um cartão de
 * música COM TÍTULO — feio, mas nunca com a chave do Blob.
 *
 * Formato: OGG/OPUS é o único que o Telegram garante desenhar como voz.
 * MP3/M4A/WAV podem virar cartão. Por isso o upload no builder converte
 * tudo pra OGG/Opus (ver `converterParaVoz` em bot-funnel-board.tsx) e o
 * `scripts/backfill-audio-ogg.mts` converteu o que já estava salvo.
 */
type ResultadoVoz = "voz" | "rebaixado" | "falhou";

type TgRespostaMidia = {
  ok?: boolean;
  error_code?: number;
  description?: string;
  result?: {
    message_id?: number;
    voice?: unknown;
    audio?: unknown;
    document?: unknown;
  };
};

/** Apaga uma mensagem que o próprio bot mandou (janela de 48h). */
async function tgDeleteMessage(token: string, chatId: string, messageId: number) {
  await fetch(tgApi(token, "deleteMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  }).catch(() => {});
}

/**
 * Lê a resposta do sendVoice e diz o que o Telegram REALMENTE desenhou.
 * Quando rebaixou, já apaga a mensagem errada antes de devolver.
 */
async function lerRespostaVoz(
  res: Response,
  token: string,
  chatId: string,
  origem: string,
): Promise<ResultadoVoz> {
  const j = (await res.json().catch(() => ({}))) as TgRespostaMidia;
  if (!res.ok || !j.ok) {
    console.warn(`[tgSendVoice] ${origem} falhou:`, j.error_code, j.description);
    return "falhou";
  }
  if (j.result?.voice) return "voz";

  const virou = j.result?.audio ? "audio" : j.result?.document ? "document" : "?";
  console.warn(
    `[tgSendVoice] ${origem} devolveu 200 mas o Telegram desenhou "${virou}" em vez de voz — apagando`,
  );
  if (typeof j.result?.message_id === "number") {
    await tgDeleteMessage(token, chatId, j.result.message_id);
  }
  return "rebaixado";
}

async function tgSendVoice(
  token: string,
  chatId: string,
  voice: string,
  caption?: string,
): Promise<ResultadoVoz> {
  // === Tentativa 1: por URL (o Telegram baixa do nosso Blob) ===
  let porUrl: ResultadoVoz = "falhou";
  try {
    const res = await fetch(tgApi(token, "sendVoice"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        voice,
        ...(caption ? { caption, parse_mode: "HTML" } : {}),
      }),
    });
    porUrl = await lerRespostaVoz(res, token, chatId, "URL");
    if (porUrl === "voz") return "voz";
  } catch (e) {
    console.warn("[tgSendVoice] URL exception:", e);
  }

  // === Tentativa 2: baixa e sobe por multipart ===
  // Vale mesmo quando a 1ª foi "rebaixado": subindo o arquivo a gente
  // controla o nome e o mime, e o Telegram às vezes trata melhor.
  try {
    const dl = await fetch(voice);
    if (!dl.ok) {
      console.warn("[tgSendVoice] download falhou:", dl.status);
      return porUrl === "rebaixado" ? "rebaixado" : "falhou";
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.length > 50 * 1024 * 1024) {
      console.warn("[tgSendVoice] arquivo grande demais:", buf.length);
      return porUrl === "rebaixado" ? "rebaixado" : "falhou";
    }
    // Assinatura dos bytes vale mais que o content-type do host: o Vercel
    // Blob às vezes devolve octet-stream e aí a gente rotularia errado.
    const tipo = tipoDeAudio(buf, dl.headers.get("content-type"));
    const fd = new FormData();
    fd.append("chat_id", chatId);
    if (caption) {
      fd.append("caption", caption.slice(0, 1000));
      fd.append("parse_mode", "HTML");
    }
    // Nome genérico de propósito: em voz o Telegram nem mostra, e se um dia
    // cair pro fallback é melhor "audio" que a chave do Blob.
    fd.append("voice", new Blob([new Uint8Array(buf)], { type: tipo.mime }), `audio.${tipo.ext}`);
    const res = await fetch(tgApi(token, "sendVoice"), { method: "POST", body: fd });
    const r = await lerRespostaVoz(res, token, chatId, "multipart");
    if (r === "voz") return "voz";
    return r === "rebaixado" || porUrl === "rebaixado" ? "rebaixado" : "falhou";
  } catch (e) {
    console.warn("[tgSendVoice] multipart exception:", e);
    return porUrl === "rebaixado" ? "rebaixado" : "falhou";
  }
}

/**
 * Descobre o formato pelos BYTES (magic number), com o content-type só como
 * desempate. O Vercel Blob às vezes serve `application/octet-stream`, e aí
 * rotular o multipart pelo header mandaria "audio.ogg" com bytes de MP3 —
 * exatamente o tipo de mentira que faz o Telegram rebaixar pra cartão.
 */
function tipoDeAudio(buf: Buffer, contentType?: string | null): { ext: string; mime: string } {
  const s4 = buf.subarray(0, 4).toString("latin1");
  if (s4 === "OggS") return { ext: "ogg", mime: "audio/ogg" };
  if (s4 === "RIFF") return { ext: "wav", mime: "audio/wav" };
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return { ext: "m4a", mime: "audio/mp4" };
  // MP3: ID3v2 ("ID3") ou frame sync direto (0xFF 0xEx/0xFx)
  if (s4.startsWith("ID3") || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { ext: "mp3", mime: "audio/mpeg" };
  }
  const ct = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  if (ct === "audio/ogg" || ct === "audio/opus") return { ext: "ogg", mime: "audio/ogg" };
  if (ct === "audio/mpeg" || ct === "audio/mp3") return { ext: "mp3", mime: "audio/mpeg" };
  if (ct === "audio/mp4" || ct === "audio/x-m4a") return { ext: "m4a", mime: "audio/mp4" };
  if (ct === "audio/wav" || ct === "audio/x-wav") return { ext: "wav", mime: "audio/wav" };
  return { ext: "ogg", mime: "audio/ogg" };
}

/**
 * Áudio como FAIXA DE MÚSICA (cartão com título e duração).
 *
 * `title` é OBRIGATÓRIO de propósito: sem ele o Telegram usa o nome do
 * arquivo da URL, que no nosso caso é a chave do Blob — o bug do print do
 * davi. Ver `tituloDoAudio`, que nunca devolve vazio.
 */
async function tgSendAudio(
  token: string,
  chatId: string,
  audio: string,
  title: string,
  caption?: string,
) {
  await fetch(tgApi(token, "sendAudio"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      audio,
      title,
      ...(caption ? { caption, parse_mode: "HTML" } : {}),
    }),
  }).catch(() => {});
}

/**
 * Título apresentável pro cartão de música. NUNCA devolve undefined.
 *
 * 06/08/2026: antes devolvia undefined quando o nó não tinha `filename`,
 * na crença de que sem título o Telegram mostraria "só a duração". Não é
 * o que acontece — sem `title` ele usa o nome do arquivo da URL, que no
 * nosso caso é a chave do Blob ("1785890729925-65fnauqj-copy_2-KEBj…").
 * Era esse o cartão feio do print do davi. Agora sempre sai um nome
 * humano, com "Áudio" como último recurso.
 */
function tituloDoAudio(d: Record<string, unknown>): string {
  const t = String(d.audioTitle ?? "").trim();
  if (t) return t.slice(0, 64);
  const f = String(d.filename ?? "").trim();
  const semExt = f.replace(/\.[a-z0-9]{1,5}$/i, "").trim();
  const limpo = semChaveDeBlob(semExt);
  return limpo ? limpo.slice(0, 64) : "Áudio";
}

/**
 * Tira do nome os pedaços que são chave do nosso Blob.
 *
 * Tem `filename` no banco que JÁ É uma chave inteira — acontece quando o
 * seller subiu de volta um arquivo que ele mesmo baixou do Blob. Sem esta
 * limpeza, o título do cartão viraria de novo
 * "1785480352587-q4pbrkxe-WhatsApp-Audio-…-Vi5oZATr26aQWmyJNpcaiFrSOi4w69",
 * que é exatamente a feiura que a gente está caçando.
 *
 * Formato da chave: <13 dígitos>-<8 alnum>-<nome>-<sufixo aleatório longo>.
 * A gente descasca as pontas e devolve o miolo, que é o nome de gente.
 */
function semChaveDeBlob(nome: string): string {
  return nome
    .replace(/^\d{13}-[a-z0-9]{6,10}-/i, "") // carimbo de tempo + random do upload
    .replace(/-[A-Za-z0-9]{24,}$/, "") // sufixo que o Vercel Blob acrescenta
    .trim();
}
async function tgSendAnimation(token: string, chatId: string, animation: string, caption?: string) {
  await fetch(tgApi(token, "sendAnimation"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      animation,
      ...(caption ? { caption, parse_mode: "HTML" } : {}),
    }),
  }).catch(() => {});
}
async function tgSendChatAction(
  token: string,
  chatId: string,
  action:
    | "typing"
    | "record_voice"
    | "upload_voice"
    | "upload_photo"
    | "upload_video"
    | "upload_document",
) {
  await fetch(tgApi(token, "sendChatAction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {});
}
async function tgSendPoll(
  token: string,
  chatId: string,
  question: string,
  options: string[],
): Promise<string | null> {
  try {
    const res = await fetch(tgApi(token, "sendPoll"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        question: question.slice(0, 300),
        options: options.slice(0, 10).map((o) => o.slice(0, 100)),
        is_anonymous: false,
        allows_multiple_answers: false,
      }),
    });
    const j = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: { poll?: { id?: string } } }
      | null;
    return j?.result?.poll?.id ?? null;
  } catch {
    return null;
  }
}
async function tgSendLocation(token: string, chatId: string, lat: number, lng: number) {
  await fetch(tgApi(token, "sendLocation"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, latitude: lat, longitude: lng }),
  }).catch(() => {});
}
async function tgAnswerCallback(token: string, callbackQueryId: string, text?: string) {
  await fetch(tgApi(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    }),
  }).catch(() => {});
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function trimCaption(s: string): string {
  const t = (s ?? "").trim();
  if (t.length <= 1000) return t;
  return t.slice(0, 997) + "...";
}

/**
 * Texto do seller COM fallback — tratando "" como ausente.
 *
 * 24/07/2026 (davi: "o orderbump nao ta funcionando"). O padrão
 * `String(d.campo ?? "default")` estava em todo lugar, mas `??` só cai no
 * fallback com null/undefined — string VAZIA passa direto. E o editor do
 * funil salva "" pra todo campo de texto que o seller deixa em branco
 * (confirmado no banco: o funil "Privado Ribeiro" tinha orderBumpPrompt="").
 *
 * Resultado no order bump: promptTpl="" → sendMessage com text vazio →
 * Telegram devolve "message text is empty" → a pergunta do bump nunca
 * chegava e o clique em "Pagar agora" não fazia absolutamente nada.
 */
function textOr(value: unknown, fallback: string): string {
  const s = value === null || value === undefined ? "" : String(value);
  return s.trim() ? s : fallback;
}

const DEFAULT_PIX_TITLE = "🔷 Pagamento via PIX Copia e Cola 🔷";
const DEFAULT_PIX_INSTRUCTION =
  "👆 Clique no código PIX acima para copiar.\n\nApós efetuar o pagamento retorne aqui para continuar.";
const DEFAULT_PIX_COPY_LABEL = "📋 Copiar código PIX";
const DEFAULT_PIX_QR_LABEL = "📱 Pagar via QR Code";
const DEFAULT_PIX_VERIFY_LABEL = "✅ Já paguei, verificar";

type ResolvedPixUI = {
  title: string;
  instruction: string;
  help: string;
  copyButtonLabel: string;
  qrButtonLabel: string;
  verifyButtonLabel: string;
  showCopyButton: boolean;
  showQrButton: boolean;
  showVerifyButton: boolean;
};

/**
 * Resolve a mensagem estilizada do PIX em TRÊS níveis:
 *   plano (`plans[i].pix`) → bloco (`d.pixTitle` etc) → default do sistema.
 *
 * 31/07/2026 (seller: "preciso que a aba personalizar mensagem do pix do
 * bloco de upsell seja de acordo com o tanto de planos q existe — 2 planos,
 * 2 abas separadamente para cada um"). A config de cada plano mora DENTRO
 * do plano, não num array paralelo: os planos abaixo de R$2,00 são
 * filtrados antes da indexação por `callback_data`, então um array separado
 * casaria com o plano errado assim que um plano inválido aparecesse no meio.
 *
 * Herança por campo VAZIO (e não por objeto ausente) de propósito: quem já
 * tinha o bloco personalizado e adiciona um segundo plano continua vendo a
 * mesma mensagem nos dois, e só sobrescreve o que quiser diferenciar.
 *
 * Usa textOr em vez de `??` em todo lugar porque o editor grava "" quando o
 * seller apaga um campo — o mesmo bug que já derrubou o order bump.
 */
export function resolvePixMessageConfig(
  blockData: Record<string, unknown>,
  planPix?: Record<string, unknown> | null,
): ResolvedPixUI {
  const p = planPix ?? {};
  const str = (k: string, fallback: string) =>
    textOr(p[k], textOr(blockData[k], fallback));
  const bool = (k: string) => {
    if (typeof p[k] === "boolean") return p[k] as boolean;
    return blockData[k] !== false;
  };
  return {
    title: str("pixTitle", DEFAULT_PIX_TITLE),
    instruction: str("pixInstruction", DEFAULT_PIX_INSTRUCTION),
    // help vazio é intencional: significa "sem seção de ajuda".
    help: textOr(p.pixHelp, String(blockData.pixHelp ?? "")),
    copyButtonLabel: str("copyButtonLabel", DEFAULT_PIX_COPY_LABEL),
    qrButtonLabel: str("qrButtonLabel", DEFAULT_PIX_QR_LABEL),
    verifyButtonLabel: str("verifyButtonLabel", DEFAULT_PIX_VERIFY_LABEL),
    showCopyButton: bool("showCopyButton"),
    showQrButton: bool("showQrButton"),
    showVerifyButton: bool("showVerifyButton"),
  };
}

/** `plans[i].pix` como objeto cru (ou null se o plano herda tudo). */
function planPixOf(plan: { pix?: Record<string, unknown> | null } | undefined) {
  return plan?.pix ?? null;
}

/**
 * Quando desistir de esperar o pagamento e sair pela bolinha "não pagou".
 *
 * 01/08/2026 (seller: "coloquei uma caixinha de reengajamento pra enviar 5
 * minutos depois que o lead n pagou ... deixei durante o dia todo e nada de
 * enviar").
 *
 * CAUSA: o ramo "não pagou" só era acionado por
 * advanceBotConversationOnExpired, e a ÚNICA coisa que chama isso é o
 * webhook da adquirente avisando que o PIX venceu. Nenhuma adquirente em
 * produção manda esse aviso — medido: 646 transações de bot, ZERO EXPIRED,
 * e 310 conversas paradas em `waiting_payment` (a mais velha há 11 dias).
 * O ramo era, na prática, código morto: nunca rodou uma vez sequer.
 *
 * Agora o próprio bloco agenda o despertar. O cron que já existe
 * (/api/cron/bot-funnel-resume, de minuto em minuto) acorda a conversa,
 * confere se pagou e, se não pagou, sai pelo "não pagou".
 *
 * DEFAULT = 10 MINUTOS.
 *
 * A 1ª versão (mesma tarde) usava a validade real do PIX, 60 min: é o único
 * instante em que dá pra afirmar "não pagou" sem chutar. Na prática deu
 * errado — o seller pôs 5 min no bloco de reengajamento, testou, e a 1ª
 * mensagem só sairia em 65 min (60 aqui + 5 lá). Ele voltou com "AINDA NÃO
 * ESTÁ FUNCIONANDO".
 *
 * 10 min é o que a expectativa dele descreve e não é chute: quem vai pagar
 * PIX paga nos primeiros minutos — abrir o banco, colar, confirmar. Passou
 * disso, esfriou. E ainda sobram ~50 min de PIX válido pra quem quiser
 * pagar o preço cheio depois de receber a recuperação (o "não pagou" não
 * cancela nada; se pagar, a entrega sai igual — ver PAY_NODE_VAR).
 *
 * Os dois relógios se somam, e isso PRECISA estar claro na UI: bloco em 10 +
 * reengajamento em 5 = 1ª mensagem 15 min depois do PIX.
 */
const UNPAID_FALLBACK_MIN = 10;
const UNPAID_MIN_MINUTES = 1;
const UNPAID_MAX_MINUTES = 60 * 24 * 3;

export function unpaidDeadline(d: Record<string, unknown>): Date {
  const raw = Number(d.unpaidAfterMinutes ?? NaN);
  const min =
    Number.isFinite(raw) && raw > 0
      ? Math.min(Math.max(Math.round(raw), UNPAID_MIN_MINUTES), UNPAID_MAX_MINUTES)
      : UNPAID_FALLBACK_MIN;
  return new Date(Date.now() + min * 60_000);
}

/**
 * Guarda em qual bloco de pagamento o cliente estava quando o "não pagou"
 * disparou. Se ele pagar DEPOIS disso (possível só quando o seller encurta
 * o prazo e o PIX ainda está válido), o `advanceConversation` já terá saído
 * do bloco de pagamento e não acharia a bolinha "pagou" — a entrega sumiria.
 * Com isso ele consegue voltar e rotear o pagou a partir do lugar certo.
 */
const PAY_NODE_VAR = "__pay_node";

export type ParsedPaymentPlan = {
  amountCents: number;
  title: string;
  period: string;
  description: string;
  /** Mensagem do PIX própria deste plano (null = herda tudo do bloco). */
  pix: Record<string, unknown> | null;
};

/**
 * Lê `data.plans` de um bloco `payment` e devolve só os planos cobráveis.
 *
 * ÚNICA fonte da lista, de propósito: o índice do `callback_data`
 * (`pix:${nodeId}:${i}`) aponta pra ESTA lista já filtrada, então o envio
 * dos botões e o tratamento do clique PRECISAM parsear igual. Existiam duas
 * cópias e elas já divergiram uma vez — a do clique não lia `description`.
 * Qualquer campo novo por plano entra aqui e vale nos dois lados.
 */
export function parsePaymentPlans(
  d: Record<string, unknown>,
): ParsedPaymentPlan[] {
  const rawPlans = Array.isArray(d.plans) ? (d.plans as unknown[]) : [];
  return rawPlans
    .slice(0, 6)
    .map((raw) => {
      const p = (raw ?? {}) as Record<string, unknown>;
      return {
        amountCents: Math.round(Number(p.amountCents ?? 0)),
        title: String(p.title ?? "").trim(),
        period: String(p.period ?? "").trim(),
        description: String(p.description ?? "").trim().slice(0, 200),
        pix:
          p.pix && typeof p.pix === "object"
            ? (p.pix as Record<string, unknown>)
            : null,
      };
    })
    .filter((p) => p.amountCents >= 200);
}

export type ParsedOrderBump = {
  title: string;
  amountCents: number;
  /** Template da pergunta desse bump (vazio = usa o padrão). */
  prompt: string;
};

/**
 * Os order bumps LIGADOS e válidos do bloco de pagamento, na ordem em que
 * são oferecidos.
 *
 * 06/08/2026 (davi): "adicione mais uma opção de order bump, somente mais
 * um". O 1º continua nos campos `orderBump*` de sempre — nenhum funil
 * antigo precisa ser migrado — e o 2º mora em `orderBump2*`. Devolver uma
 * lista em vez de dois pares soltos deixa o resto do fluxo (mostrar a
 * pergunta, somar valor, montar o nome do produto) indiferente a quantos
 * bumps existem.
 *
 * O piso de R$1,00 é o mesmo de antes: bump de centavos era erro de
 * digitação com muito mais frequência do que oferta de verdade.
 *
 * O 2º exige o 1º LIGADO porque é assim que o editor se comporta: desmarcar
 * o 1º esconde o painel do 2º. Sem essa regra aqui, um funil salvo como
 * `orderBumpEnabled:false, orderBump2Enabled:true` (dá pra cair nesse estado
 * desmarcando o 1º) seguiria oferecendo — e cobrando — uma oferta que o
 * seller não vê mais na tela nem consegue editar. Repare que o que manda é
 * o CHECKBOX do 1º, e não ele ter passado na validação: bump 1 marcado mas
 * sem título deixa o 2º rodar sozinho, que é o que o editor mostra.
 */
export function parseOrderBumps(d: Record<string, unknown>): ParsedOrderBump[] {
  const primeiroLigado = d.orderBumpEnabled === true;
  return [
    {
      ligado: primeiroLigado,
      title: String(d.orderBumpTitle ?? "").trim(),
      amountCents: Math.round(Number(d.orderBumpAmountCents ?? 0)),
      prompt: String(d.orderBumpPrompt ?? ""),
    },
    {
      ligado: primeiroLigado && d.orderBump2Enabled === true,
      title: String(d.orderBump2Title ?? "").trim(),
      amountCents: Math.round(Number(d.orderBump2AmountCents ?? 0)),
      prompt: String(d.orderBump2Prompt ?? ""),
    },
  ]
    .filter((b) => b.ligado && b.title && b.amountCents >= 100)
    .map(({ title, amountCents, prompt }) => ({ title, amountCents, prompt }));
}

/**
 * Soma no pedido os bumps que o cliente aceitou.
 *
 * `decisoes` é a trilha de respostas que veio no `callback_data` — uma
 * posição por bump já perguntado, na ordem da oferta. Só "y" conta como
 * aceite; qualquer outra coisa (inclusive lixo digitado à mão por alguém
 * forjando o callback) é tratada como "não". Isso é de propósito: no pior
 * caso a pessoa paga o valor base, nunca menos.
 *
 * Fica separado do handler porque é a única parte do fluxo que mexe em
 * DINHEIRO — errar aqui cobra o valor errado do cliente. Como função pura
 * dá pra testar sem gerar PIX de verdade (`probe-funnel-bump-2.mts`).
 */
export function applyOrderBumps(
  bumps: ParsedOrderBump[],
  decisoes: string[],
  base: { amountCents: number; productName: string },
): { amountCents: number; productName: string; aceitos: string[] } {
  const aceitos: string[] = [];
  let amountCents = base.amountCents;
  bumps.forEach((b, i) => {
    if (decisoes[i] !== "y") return;
    amountCents += b.amountCents;
    aceitos.push(b.title);
  });
  return {
    amountCents,
    productName: aceitos.length
      ? `${base.productName} + ${aceitos.join(" + ")}`
      : base.productName,
    aceitos,
  };
}

/** Substitui variáveis no texto. Vars nativas: {{nome}}, {{primeiro_nome}},
 *  {{produto}}, {{hora}}, {{data}}, {{dia_semana}}, {{saudacao}}.
 *  Vars dinâmicas (variables da conversa): {{resposta_1}}, {{cupom}}, etc. */
function renderVars(
  text: string,
  vars: { nome?: string; produto?: string; variables?: Record<string, unknown> },
): string {
  const nome = (vars.nome ?? "").trim();
  const primeiro = nome.split(/\s+/)[0] ?? "";
  const now = new Date();
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hora = `${get("hour")}:${get("minute")}`;
  const data = `${get("day")}/${get("month")}/${get("year")}`;
  const diaSemana = get("weekday");
  const h = Number(get("hour"));
  const saudacao =
    h >= 5 && h < 12 ? "bom dia" : h >= 12 && h < 18 ? "boa tarde" : "boa noite";
  const dynamic = vars.variables ?? {};
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    if (k === "nome") return nome;
    if (k === "primeiro_nome") return primeiro;
    if (k === "produto") return (vars.produto ?? "").trim();
    if (k === "hora") return hora;
    if (k === "data") return data;
    if (k === "dia_semana") return diaSemana;
    if (k === "saudacao") return saudacao;
    // 22/07/2026: variáveis dinâmicas capturadas na conversa
    const v = dynamic[k];
    if (v === undefined || v === null) return "";
    return typeof v === "string" ? v : String(v);
  });
}

/* -------------------------------- grafo --------------------------------- */

type GNode = { id: string; type?: string; data?: Record<string, unknown> };
type GEdge = { id: string; source: string; target: string; sourceHandle?: string | null; data?: { kind?: string } };
type Graph = { nodes: GNode[]; edges: GEdge[] };

function parseGraph(raw: unknown): Graph | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return null;
  return { nodes: g.nodes as GNode[], edges: g.edges as GEdge[] };
}
function edgeKind(e: GEdge): string {
  const k = e.data?.kind ?? e.sourceHandle ?? "next";
  return String(k);
}
function findStart(g: Graph): GNode | null {
  const targets = new Set(g.edges.map((e) => e.target));
  const isStep = (n: GNode) => STEP_TYPES.has(String(n.type ?? ""));
  return g.nodes.find((n) => isStep(n) && !targets.has(n.id)) ?? g.nodes.find(isStep) ?? null;
}
const STEP_TYPES = new Set([
  "message", "botproduct", "image", "video", "audio", "gif", "delay",
  "buttons", "poll", "location", "random", "payment",
  "reengage", "input", "inactivity", "coupon", "condition",
  "social_proof", "scarcity", "tag",
]);

/**
 * O funil deste grafo consegue atender um /start?
 *
 * 30/07/2026: o monitor de saúde (src/lib/bot-health.ts) precisa responder
 * "esse bot vai responder?" ANTES de alguém mandar /start. Em vez de o
 * monitor reimplementar a regra (e divergir do runtime na primeira mudança),
 * ele chama isto — mesmíssimos parseGraph/findStart que o runtime usa de
 * verdade. Se um dia o critério de bloco inicial mudar, muda nos dois.
 */
export function validateFunnelGraph(
  raw: unknown,
): { ok: true } | { ok: false; issue: "empty_graph" | "no_start" } {
  const g = parseGraph(raw);
  if (!g || g.nodes.length === 0) return { ok: false, issue: "empty_graph" };
  if (!findStart(g)) return { ok: false, issue: "no_start" };
  return { ok: true };
}
/**
 * Todos os destinos de uma bolinha, na ordem em que o seller puxou os fios.
 *
 * 29/07/2026 (davi: "faça com que eu possa puxar mais fios de conexão da
 * bolinha (pagou) para conseguir conectar o upsell em várias coisas"). Antes o
 * editor apagava o fio anterior toda vez que um novo saía da mesma bolinha —
 * uma saída, um destino. Agora a saída pode ter vários, e eles rodam EM
 * SEQUÊNCIA: o 1º ramo inteiro, depois o 2º, depois o 3º (ver `enfileirar`).
 *
 * Fio duplicado pro mesmo bloco é ignorado — mandaria a mesma coisa 2x.
 */
function nextNodes(g: Graph, nodeId: string, kind: string): GNode[] {
  const vistos = new Set<string>();
  const out: GNode[] = [];
  for (const e of g.edges) {
    if (e.source !== nodeId) continue;
    if (edgeKind(e) !== kind && e.sourceHandle !== kind) continue;
    if (vistos.has(e.target)) continue;
    vistos.add(e.target);
    const n = g.nodes.find((x) => x.id === e.target);
    if (n) out.push(n);
  }
  return out;
}
/**
 * Fila dos ramos que ainda faltam rodar, quando uma bolinha tem mais de um fio.
 *
 * Mora dentro de `variables` de propósito: é o único campo da conversa que já
 * é persistido a cada passo e devolvido inteiro no resume. Assim a fila
 * sobrevive a bloco que pausa (pagamento, resposta livre, reengajamento) sem
 * precisar de coluna nova.
 */
const QUEUE_KEY = "__fila";

/** Empilha os ramos extras (2º fio em diante) pra rodarem depois do 1º. */
function enfileirar(variables: Record<string, unknown>, resto: GNode[]): void {
  if (resto.length === 0) return;
  const atual = Array.isArray(variables[QUEUE_KEY]) ? (variables[QUEUE_KEY] as unknown[]) : [];
  // Na frente: ramo aberto agora termina antes de voltar pro que já esperava
  // (senão um fan-out dentro de outro sairia fora de ordem).
  variables[QUEUE_KEY] = [...resto.map((n) => n.id), ...atual.map(String)];
}

/**
 * Abre uma saída pra quem chama `executeFrom` de FORA do walker — clique em
 * botão, pagamento confirmado, resposta de enquete, palavra-chave. Devolve o
 * 1º destino e deixa os fios extras na fila do `variables`, que é justamente o
 * objeto que segue como `ctx.variables`.
 */
function abrirSaida(
  g: Graph,
  nodeId: string,
  kind: string,
  variables: Record<string, unknown>,
): GNode | null {
  const alvos = nextNodes(g, nodeId, kind);
  enfileirar(variables, alvos.slice(1));
  return alvos[0] ?? null;
}

/** Máximo de itens num álbum do Telegram. Passou disso, a API recusa. */
const ALBUM_MAX = 10;

/**
 * A corrente de blocos de mídia que vira UM álbum só.
 *
 * Regra: começa no bloco atual e segue pelo fio "próximo" enquanto o bloco
 * de onde saiu tiver `groupWithNext` marcado. Para na primeira quebra:
 *
 *  - bloco sem a opção marcada → ele é o último item do álbum
 *  - bloco que não é imagem/vídeo (texto, delay, botão...) → fica de fora
 *  - bloco sem arquivo → não dá pra mandar, encerra ali
 *  - bolinha com MAIS DE UM fio → o funil abre em dois caminhos, e álbum
 *    é uma mensagem linear. Deixa o `go()` normal cuidar do fan-out.
 *  - 10 itens → limite do Telegram
 *  - fio que volta pra um bloco já usado (loop) → corta
 *
 * Devolve sempre pelo menos o bloco inicial. Quem chama decide: 1 item é
 * envio normal, 2+ vira sendMediaGroup.
 */
function coletarAlbum(g: Graph, inicio: GNode): GNode[] {
  const ehMidia = (n: GNode) => n.type === "image" || n.type === "video";
  const temArquivo = (n: GNode) =>
    String(((n.data as Record<string, unknown>) ?? {}).url ?? "").trim() !== "";
  const agrupa = (n: GNode) =>
    ((n.data as Record<string, unknown>) ?? {}).groupWithNext === true;

  const corrente: GNode[] = [inicio];
  const vistos = new Set<string>([inicio.id]);
  let atual = inicio;
  while (corrente.length < ALBUM_MAX && agrupa(atual)) {
    const saidas = nextNodes(g, atual.id, "next");
    if (saidas.length !== 1) break;
    const prox = saidas[0];
    if (vistos.has(prox.id) || !ehMidia(prox) || !temArquivo(prox)) break;
    vistos.add(prox.id);
    corrente.push(prox);
    atual = prox;
  }
  return corrente;
}

/* ---------------------------- Analytics events -------------------------- */

/** Emite evento de analytics (drop-off). Best-effort — falha silenciosa. */
async function emitAnalytics(
  botId: string,
  funnelId: string,
  chatId: string,
  nodeId: string,
  nodeType: string,
  event: "enter" | "convert" | "click" | "answer" | "send" | "stop",
  meta?: Record<string, unknown>,
) {
  prisma.botAnalyticsEvent
    .create({
      data: { botId, funnelId, chatId, nodeId, nodeType, event, meta: meta ? (meta as object) : undefined },
    })
    .catch(() => {});
}

/* --------------------------------- PIX ---------------------------------- */

async function generatePix(
  checkoutSlug: string,
  fromName: string,
  chatId: string,
  botId: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
  const res = await fetch(`${baseUrl}/api/checkouts/${checkoutSlug}/pix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer: { name: fromName, email: `tg-${chatId}@trilhopag.com` },
      utm: {
        source: "telegram_bot",
        campaign: `botfunnel|${botId}`,
        content: chatId, // reconciliação webhook
      },
    }),
  }).catch(() => null);
  if (!res) return null;
  const data = (await res.json().catch(() => ({}))) as {
    copy_paste?: string;
    qr_code_image?: string;
    transaction_id?: string;
  };
  if (!res.ok || !data.copy_paste) return null;
  return data;
}

/* --------------------------- Cupom helper ------------------------------ */

/** Gera cupom curto legível (~5 chars alfanum sem ambíguos). */
function genCouponCode(prefix?: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I, O, 0, 1
  const bytes = randomBytes(5);
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[bytes[i] % alphabet.length];
  return prefix ? `${prefix.toUpperCase().slice(0, 4)}-${out}` : out;
}

/* -------------------------------- engine -------------------------------- */

type RunState = {
  status: string;
  currentNodeId: string | null;
  pendingTxId: string | null;
  pendingPollId: string | null;
  pendingInputNodeId: string | null;
  scheduledResumeAt: Date | null;
  scheduledResumeNodeId: string | null;
  variables: Record<string, unknown>;
};

function baseState(): RunState {
  return {
    status: "done",
    currentNodeId: null,
    pendingTxId: null,
    pendingPollId: null,
    pendingInputNodeId: null,
    scheduledResumeAt: null,
    scheduledResumeNodeId: null,
    variables: {},
  };
}

type ExecCtx = {
  token: string;
  botId: string;
  userId: string;
  funnelId: string;
  g: Graph;
  chatId: string;
  fromName: string;
  variables: Record<string, unknown>;
  /**
   * Trilha dos blocos `buttons` já respondidos (mais antigo → mais recente).
   * Só de leitura aqui: serve pro bloco `buttons` saber se tem pra onde
   * voltar. Quem empilha/desempilha é o handler de callback, que é o único
   * ponto onde o usuário de fato navega. Opcional porque nem todo caminho de
   * entrada tem histórico (cron, webhook de pagamento) — sem ele o bloco
   * apenas não desenha o "Voltar".
   */
  navHistory?: string[];
};

/** Teto da trilha: o suficiente pra qualquer funil real sem inchar a linha. */
const NAV_HISTORY_MAX = 20;

/** Rótulo padrão do botão de voltar, sobrescrevível por bloco. */
const BACK_LABEL_DEFAULT = "⬅️ Voltar";

/* --------------------------- reengajamento ------------------------------ */

/** Uma mensagem da sequência de reengajamento. Mídia e botão são opcionais. */
type ReengageMsg = {
  text: string;
  url: string;
  kind: "image" | "video" | "";
  btnLabel: string;
  btnUrl: string;
};

/** Teto de mensagens por bloco (o editor também limita). */
const REENGAGE_MAX_MSGS = 6;

/**
 * Teto absoluto de envios quando o seller liga "repetir". Sem isso o ciclo é
 * literalmente infinito e o bot vira spam até o cliente bloquear.
 */
const REENGAGE_MAX_SENDS = 30;

/**
 * Teto de /start por chat por hora (anti-flood). Estourou, o chat entra em
 * cooldown até a janela de 1h fechar — NÃO é banimento permanente.
 *
 * Era 10 e pegava o seller testando o próprio funil (30/07/2026: "O bot
 * simplesmente parou de funcionar" — 11 /start em 20min mataram o bot dele).
 * 30 ainda barra script de flood e dá folga de sobra pra teste manual.
 */
const START_LIMIT_1H = 30;

/** 5 min a 30 dias — mesma janela que o bloco antigo aceitava. */
function clampReengageInterval(v: unknown): number {
  const n = Number(v ?? 360);
  if (!Number.isFinite(n)) return 360;
  return Math.max(5, Math.min(60 * 24 * 30, Math.round(n)));
}

/** Normaliza o que veio do grafo (JSON do seller) — nada aqui é confiável. */
function parseReengageMessages(raw: unknown): ReengageMsg[] {
  if (!Array.isArray(raw)) return [];
  const out: ReengageMsg[] = [];
  for (const item of raw.slice(0, REENGAGE_MAX_MSGS)) {
    const m = (item ?? {}) as Record<string, unknown>;
    const text = String(m.text ?? "").trim();
    const url = String(m.url ?? "").trim();
    const kindRaw = String(m.kind ?? "");
    const kind = kindRaw === "image" || kindRaw === "video" ? kindRaw : "";
    // Só entra na sequência o que de fato tem o que enviar.
    if (!text && !(url && kind)) continue;
    const btnLabel = String(m.btnLabel ?? "").trim().slice(0, 64);
    const btnUrl = String(m.btnUrl ?? "").trim();
    out.push({
      text,
      url: kind ? url : "",
      kind: url ? kind : "",
      btnLabel,
      // Telegram rejeita o teclado inteiro se a URL não for http(s).
      btnUrl: btnLabel && /^https?:\/\//i.test(btnUrl) ? btnUrl : "",
    });
  }
  return out;
}

/**
 * O cliente já pagou alguma coisa nesse funil? As transações do bot carregam
 * `botFunnelTrace = "botId|chatId"` (ver bot-funnel-pix.ts) e a coluna é
 * indexada, então a consulta é barata mesmo rodando por conversa no cron.
 */
async function hasPaidInFunnel(botId: string, chatId: string): Promise<boolean> {
  try {
    const tx = await prisma.transaction.findFirst({
      where: { botFunnelTrace: `${botId}|${chatId}`, status: "PAID" },
      select: { id: true },
    });
    return !!tx;
  } catch {
    // Falha de banco não pode virar "manda mensagem pra quem comprou", mas
    // também não pode travar o ciclo — na dúvida, segue mandando.
    return false;
  }
}

/** Envia uma mensagem da sequência: texto solo, com imagem ou com vídeo. */
async function sendReengageMessage(
  token: string,
  chatId: string,
  msg: ReengageMsg,
  rv: (s: string) => string,
): Promise<void> {
  const text = rv(msg.text);
  const keyboard: InlineKeyboard | undefined =
    msg.btnLabel && msg.btnUrl ? [[{ text: msg.btnLabel, url: msg.btnUrl }]] : undefined;

  if (msg.kind === "image" && msg.url) {
    await tgSendChatAction(token, chatId, "upload_photo");
    await tgSendPhoto(token, chatId, msg.url, text ? trimCaption(text) : "", keyboard);
    return;
  }
  if (msg.kind === "video" && msg.url) {
    await tgSendChatAction(token, chatId, "upload_video");
    const ok = await tgSendVideo(
      token,
      chatId,
      msg.url,
      text ? trimCaption(text) : undefined,
      keyboard,
    );
    if (ok) return;
    // Mesmo fallback do bloco `video`: link clicável em vez de deixar o
    // cliente sem nada quando URL e multipart falham.
    const fallback = text
      ? `${text}\n\n🎬 <a href="${msg.url}">Assistir ao vídeo</a>`
      : `🎬 <a href="${msg.url}">Assistir ao vídeo</a>`;
    await tgSend(token, chatId, fallback, { html: true, disablePreview: false, keyboard });
    return;
  }
  if (text) await tgSendHtmlOrPlain(token, chatId, text, keyboard);
}

/**
 * Manda em HTML (negrito/itálico funcionam, igual o Broadcast antigo), mas se
 * o Telegram recusar o markup — um `<` solto no texto do seller devolve 400 e
 * a mensagem simplesmente não chega — repete sem parse_mode. O envio silencioso
 * que some é o pior desfecho possível num bloco que roda sem ninguém olhando.
 */
async function tgSendHtmlOrPlain(
  token: string,
  chatId: string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    const res = await fetch(tgApi(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
      }),
    });
    if (res.ok) return;
  } catch {
    /* rede — cai no plano B */
  }
  await tgSend(token, chatId, text, { keyboard });
}

/** Executa a partir de `startId`. Cap de 40 passos por segurança. */
async function executeFrom(ctx: ExecCtx, startId: string): Promise<RunState> {
  const { token, botId, userId, funnelId, g, chatId, fromName } = ctx;
  const variables = { ...ctx.variables };

  /**
   * Tira o próximo ramo da fila (ver `enfileirar`). É o que faz o funil
   * voltar pro 2º fio depois que o 1º chegou ao fim.
   */
  const desenfileirar = (): GNode | null => {
    const q = Array.isArray(variables[QUEUE_KEY])
      ? (variables[QUEUE_KEY] as unknown[]).map(String)
      : [];
    while (q.length > 0) {
      const id = q.shift()!;
      const n = g.nodes.find((x) => x.id === id);
      if (!n) continue; // bloco apagado depois que o fio foi puxado
      if (q.length > 0) variables[QUEUE_KEY] = q;
      else delete variables[QUEUE_KEY]; // fila vazia não fica de lixo na conversa
      return n;
    }
    delete variables[QUEUE_KEY];
    return null;
  };

  /**
   * Próximo bloco por uma saída. Se a bolinha tem mais de um fio, o 1º roda
   * agora e os outros ficam na fila. Se não tem nenhum, o funil não acabou —
   * ele volta pro ramo que ficou pendente.
   */
  const go = (fromId: string, kind: string): GNode | null => {
    const alvos = nextNodes(g, fromId, kind);
    enfileirar(variables, alvos.slice(1));
    return alvos[0] ?? desenfileirar();
  };

  let cur: GNode | null = g.nodes.find((n) => n.id === startId) ?? null;
  let guard = 0;
  while (cur && guard++ < 40) {
    const d = (cur.data as Record<string, unknown>) ?? {};
    const type = String(cur.type ?? "");
    emitAnalytics(botId, funnelId, chatId, cur.id, type, "enter");
    const rv = (s: string) => renderVars(s, { nome: fromName, variables });

    if (type === "message") {
      const raw = String(d.text ?? "").trim();
      const text = rv(raw);
      const disablePrev = d.disablePreview !== false; // default true
      if (text) await tgSend(token, chatId, text, { disablePreview: disablePrev });
      cur = go(cur.id, "next");
      continue;
    }
    /**
     * Álbum — imagem/vídeo com "agrupar" marcado engolem os blocos
     * seguintes e saem numa mensagem só. Fica ANTES dos casos de imagem e
     * vídeo sozinhos de propósito: se a corrente tiver 1 item só, não faz
     * nada e o fluxo cai no caminho de sempre logo abaixo.
     */
    if ((type === "image" || type === "video") && d.groupWithNext === true) {
      const corrente = coletarAlbum(g, cur);
      if (corrente.length >= 2) {
        const itens: AlbumItem[] = [];
        for (const n of corrente) {
          const nd = (n.data as Record<string, unknown>) ?? {};
          const u = String(nd.url ?? "").trim();
          if (!u) continue;
          const legenda = rv(String(nd.caption ?? "")).trim();
          itens.push({
            type: n.type === "video" ? "video" : "photo",
            url: u,
            ...(legenda ? { caption: legenda } : {}),
          });
        }
        // O `enter` do 1º bloco já saiu no topo do laço; os outros entram
        // aqui pro funil de analytics não mostrar queda falsa no álbum.
        for (const n of corrente.slice(1)) {
          emitAnalytics(botId, funnelId, chatId, n.id, String(n.type ?? ""), "enter", {
            album: true,
          });
        }
        const temVideo = itens.some((i) => i.type === "video");
        await tgSendChatAction(token, chatId, temVideo ? "upload_video" : "upload_photo");
        const enviado = await tgSendMediaGroup(token, chatId, itens);
        if (!enviado) {
          // Álbum recusado (mídia que o Telegram não baixou, arquivo grande,
          // etc). Manda item a item pelo caminho antigo — cada um com seus
          // próprios fallbacks. O cliente recebe tudo, só não agrupado.
          for (const it of itens) {
            if (it.type === "photo") {
              await tgSendPhoto(token, chatId, it.url, it.caption ? trimCaption(it.caption) : "");
              continue;
            }
            const ok = await tgSendVideo(
              token,
              chatId,
              it.url,
              it.caption ? trimCaption(it.caption) : undefined,
            );
            if (!ok) {
              const fb = it.caption
                ? `${it.caption}\n\n🎬 <a href="${it.url}">Assistir ao vídeo</a>`
                : `🎬 <a href="${it.url}">Assistir ao vídeo</a>`;
              await tgSend(token, chatId, fb, { html: true, disablePreview: false });
            }
          }
        }
        // Continua do ÚLTIMO bloco do álbum: os do meio já foram consumidos.
        cur = go(corrente[corrente.length - 1].id, "next");
        continue;
      }
    }
    if (type === "image") {
      const url = String(d.url ?? "").trim();
      const cap = rv(String(d.caption ?? ""));
      if (url) {
        await tgSendChatAction(token, chatId, "upload_photo");
        await tgSendPhoto(token, chatId, url, cap ? trimCaption(cap) : "");
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "video") {
      const url = String(d.url ?? "").trim();
      const cap = rv(String(d.caption ?? ""));
      if (url) {
        await tgSendChatAction(token, chatId, "upload_video");
        const sent = await tgSendVideo(
          token,
          chatId,
          url,
          cap ? trimCaption(cap) : undefined,
        );
        if (!sent) {
          // 22/07/2026 (davi): se URL + multipart falharam, manda o
          // vídeo como link clicável pra não deixar o cliente no vácuo.
          const fallback = cap
            ? `${cap}\n\n🎬 <a href="${url}">Assistir ao vídeo</a>`
            : `🎬 <a href="${url}">Assistir ao vídeo</a>`;
          await tgSend(token, chatId, fallback, { html: true, disablePreview: false });
        }
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "audio") {
      const url = String(d.url ?? "").trim();
      const cap = rv(String(d.caption ?? ""));
      if (url) {
        // Padrão é mensagem de voz (ondinha). Faixa de música só quando o
        // seller pede — aí o cartão com título faz sentido.
        const comoMusica = d.asMusic === true;
        const legenda = cap ? trimCaption(cap) : undefined;
        await tgSendChatAction(
          token,
          chatId,
          comoMusica ? "upload_document" : "record_voice",
        );
        const voz: ResultadoVoz = comoMusica
          ? "falhou"
          : await tgSendVoice(token, chatId, url, legenda);
        // Voz recusada (WAV) ou rebaixada pelo Telegram não pode sumir: cai
        // pro cartão de música — com título, nunca com a chave do Blob.
        if (voz !== "voz") {
          await tgSendAudio(token, chatId, url, tituloDoAudio(d), legenda);
        }
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "gif") {
      const url = String(d.url ?? "").trim();
      const cap = rv(String(d.caption ?? ""));
      if (url) {
        await tgSendAnimation(token, chatId, url, cap ? trimCaption(cap) : undefined);
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "delay") {
      const secondsRaw = Number(d.seconds ?? 2);
      const seconds = Math.max(0.5, Math.min(30, Number.isFinite(secondsRaw) ? secondsRaw : 2));
      const action = (d.action as "typing" | "record_voice" | undefined) ?? "typing";
      await tgSendChatAction(token, chatId, action);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "reengage") {
      /**
       * 29/07/2026 (davi: "retire a opção de esperar (reengajamento) e
       * adicione uma nova opção de reengajamento onde o bot vai mandar
       * mensagens automatizadas de tempos em tempos, por exemplo 6 em 6 horas
       * ... e escolher se a mensagem irá ser mandada juntamente de uma imagem
       * ou vídeo ou apenas a mensagem solo").
       *
       * Substitui o antigo bloco `wait`, que só dormia e passava adiante. Aqui
       * o bloco É o ciclo: dorme o intervalo, manda a próxima mensagem da
       * sequência, dorme de novo.
       *
       * Não precisou de coluna nova. O cron `/api/cron/bot-funnel-resume` já
       * reexecuta a partir de `scheduledResumeNodeId` — basta agendar o resume
       * pro PRÓPRIO nó. O contador mora em `variables["__reeng_<id>"]`, que já
       * é persistido junto com a conversa:
       *   undefined → primeira chegada: agenda e dorme, sem mandar nada
       *   número    → o cron acordou: manda a mensagem #n e reagenda
       *
       * Quem interage sai do ciclo sozinho: qualquer clique/pagamento chama
       * outro caminho que sobrescreve `scheduledResumeAt` com null.
       */
      const node = cur;
      const msgs = parseReengageMessages(d.messages);
      // `go` mexe na fila de ramos, então só pode ser chamado no passo em que
      // o funil de fato sai daqui — nunca "pré-calculado".
      const key = `__reeng_${node.id}`;
      const raw = variables[key];
      const sent = typeof raw === "number" && Number.isFinite(raw) ? raw : -1;
      const intervalMin = clampReengageInterval(d.intervalMinutes);

      // Bloco sem nenhuma mensagem preenchida não deve prender o cliente.
      if (msgs.length === 0) {
        delete variables[key];
        cur = go(node.id, "next");
        continue;
      }

      const sleepHere = (count: number): RunState => ({
        status: "sleeping",
        currentNodeId: node.id,
        pendingTxId: null,
        pendingPollId: null,
        pendingInputNodeId: null,
        scheduledResumeAt: new Date(Date.now() + intervalMin * 60_000),
        scheduledResumeNodeId: node.id,
        variables: { ...variables, [key]: count },
      });

      // Primeira chegada: só agenda. A 1ª mensagem sai depois do intervalo —
      // é reengajamento, não mais uma mensagem em cima da que acabou de sair.
      if (sent < 0) return sleepHere(0);

      // Já comprou → para de insistir. Sem isso o cliente que pagou continua
      // recebendo "vem finalizar sua compra" de 6 em 6 horas.
      if (await hasPaidInFunnel(botId, chatId)) {
        emitAnalytics(botId, funnelId, chatId, node.id, "reengage", "stop", {
          reason: "paid",
          sent,
        });
        delete variables[key];
        cur = go(node.id, "next");
        continue;
      }

      const msg = msgs[sent % msgs.length];
      await sendReengageMessage(token, chatId, msg, rv);
      emitAnalytics(botId, funnelId, chatId, node.id, "reengage", "send", {
        index: sent % msgs.length,
        sent: sent + 1,
      });

      const total = sent + 1;
      const finished = d.loop === true ? total >= REENGAGE_MAX_SENDS : total >= msgs.length;
      if (finished) {
        delete variables[key];
        cur = go(node.id, "next");
        continue;
      }
      return sleepHere(total);
    }
    if (type === "input") {
      // 22/07/2026 fase 2: aguarda mensagem de texto do cliente. Salva em
      // variables[`resposta_${varName}`]. Se `keywords` configurado, faz
      // branch por palavra-chave (senão só continua por "next" após capturar).
      const prompt = rv(String(d.prompt ?? "").trim());
      if (prompt) await tgSend(token, chatId, prompt);
      return {
        status: "waiting_input",
        currentNodeId: cur.id,
        pendingTxId: null,
        pendingPollId: null,
        pendingInputNodeId: cur.id,
        scheduledResumeAt: null,
        scheduledResumeNodeId: null,
        variables,
      };
    }
    if (type === "inactivity") {
      /**
       * 30/07/2026 (seller: "altere esse bloco deixe de ser resposta livre
       * e seja apenas (reengajar ao ficar inativo) e faça um bloco novo
       * para resposta livre").
       *
       * Bloco autônomo. Cliente chega → dorme X min esperando qualquer
       * interação. Se falar antes → advanceBotConversationOnInput vê que o
       * pendingInputNodeId aponta pra um node `inactivity` e sai por `next`
       * sem capturar variável nem processar keywords. Se cron acordar antes
       * → sai pela bolinha `inactive` (ver resumeScheduledConversations).
       *
       * Sem fio em `inactive`, cron marca done silencioso.
       */
      const minRaw = Number(d.minutes ?? 30);
      const min = Number.isFinite(minRaw) && minRaw > 0
        ? Math.min(60 * 24 * 30, Math.max(1, Math.round(minRaw)))
        : 30;
      return {
        status: "waiting_input",
        currentNodeId: cur.id,
        pendingTxId: null,
        pendingPollId: null,
        pendingInputNodeId: cur.id,
        scheduledResumeAt: new Date(Date.now() + min * 60_000),
        scheduledResumeNodeId: cur.id,
        variables,
      };
    }
    if (type === "coupon") {
      // 22/07/2026 fase 2: gera cupom único e salva em variables. Seller
      // usa {{cupom}} nos blocos seguintes. varName default "cupom".
      const varName = String(d.varName ?? "cupom").trim() || "cupom";
      const prefix = String(d.prefix ?? "").trim().slice(0, 4);
      const code = genCouponCode(prefix || undefined);
      variables[varName] = code;
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "condition") {
      // 22/07/2026 fase 2: branch por condição. Tipos:
      //  - "language" + equalsIn (ex: "pt,pt-BR") → yes se lang bater
      //  - "variable" + varName + equals (ex: "sim") → yes se variables[var] == equals
      //  - "variable_contains" + varName + contains (ex: "quero") → yes se contém
      // Saídas: "yes" (bate) / "no" (senão).
      const kind = String(d.kind ?? "language");
      let matched = false;
      if (kind === "language") {
        const list = String(d.equalsIn ?? "pt,pt-BR").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        const lang = String(variables.__language ?? "").toLowerCase();
        matched = list.includes(lang) || list.some((l) => lang.startsWith(l));
      } else if (kind === "variable") {
        const varName = String(d.varName ?? "resposta_1");
        const equals = String(d.equals ?? "").trim().toLowerCase();
        const val = String(variables[varName] ?? "").trim().toLowerCase();
        matched = val === equals;
      } else if (kind === "variable_contains") {
        const varName = String(d.varName ?? "resposta_1");
        const contains = String(d.contains ?? "").trim().toLowerCase();
        const val = String(variables[varName] ?? "").trim().toLowerCase();
        matched = contains !== "" && val.includes(contains);
      }
      // Só cai no "next" quando o ramo escolhido não tem NENHUM fio — testar
      // antes de chamar `go` porque `go` num ramo vazio já puxaria a fila.
      const saida = matched ? "yes" : "no";
      cur = nextNodes(g, cur.id, saida).length > 0 ? go(cur.id, saida) : go(cur.id, "next");
      continue;
    }
    if (type === "location") {
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      const title = String(d.title ?? "").trim();
      const address = String(d.address ?? "").trim();
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        if (title || address) {
          const html =
            (title ? `<b>${escapeHtml(title)}</b>` : "") +
            (title && address ? "\n" : "") +
            (address ? escapeHtml(address) : "");
          await tgSend(token, chatId, html, { html: true });
        }
        await tgSendLocation(token, chatId, lat, lng);
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "social_proof") {
      // 22/07/2026 (davi HOT feature 6): prova social. Puxa vendas
      // recentes do seller e monta mensagem persuasiva. Modos:
      //  - "counter"      → "🔥 127 pessoas compraram nas últimas 24h"
      //  - "notification" → "🎉 João acabou de comprar acesso Mensal"
      //  - "both"         → counter + 1 notificação random
      const mode = String(d.mode ?? "counter");
      const hoursBack = Math.min(72, Math.max(1, Number(d.hoursBack ?? 24)));
      const since = new Date(Date.now() - hoursBack * 3600_000);
      const count = await prisma.transaction.count({
        where: { userId, status: "PAID", paidAt: { gte: since } },
      });
      const parts: string[] = [];
      if (mode === "counter" || mode === "both") {
        const tpl = String(
          d.counterTemplate ??
            "🔥 <b>{count}</b> pessoas compraram nas últimas {hours}h",
        );
        parts.push(
          tpl.replace(/\{count\}/g, String(count)).replace(/\{hours\}/g, String(hoursBack)),
        );
      }
      if (mode === "notification" || mode === "both") {
        const recent = await prisma.transaction.findMany({
          where: { userId, status: "PAID", paidAt: { gte: since } },
          orderBy: { paidAt: "desc" },
          take: 20,
          select: { customerName: true, product: { select: { name: true } } },
        });
        if (recent.length > 0) {
          const pick = recent[Math.floor(Math.random() * recent.length)];
          const first = (pick.customerName ?? "Alguém").split(/\s+/)[0];
          const tpl = String(
            d.notificationTemplate ??
              "🎉 <b>{name}</b> acabou de comprar {product}",
          );
          parts.push(
            tpl
              .replace(/\{name\}/g, first)
              .replace(/\{product\}/g, pick.product.name),
          );
        }
      }
      if (parts.length > 0) {
        await tgSend(token, chatId, parts.join("\n\n"), { html: true });
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "scarcity") {
      // 22/07/2026 (davi HOT feature 7): escassez dinâmica.
      //  - "vagas": mostra N vagas restantes (contador visual só — não trava)
      //  - "timer": mostra countdown até uma data configurada
      //  - "both": os 2 juntos
      const smode = String(d.mode ?? "vagas");
      const parts: string[] = [];
      if (smode === "vagas" || smode === "both") {
        const vagas = Math.max(1, Math.min(9999, Number(d.vagas ?? 5)));
        const tpl = String(d.vagasTemplate ?? "⚡ Restam apenas <b>{n}</b> vagas!");
        parts.push(tpl.replace(/\{n\}/g, String(vagas)));
      }
      if (smode === "timer" || smode === "both") {
        // expiresAt em minutos a partir de agora, OU ISO string fixa
        const expiresIso = String(d.expiresAt ?? "");
        let expiresDate: Date | null = null;
        if (expiresIso && !Number.isNaN(Date.parse(expiresIso))) {
          expiresDate = new Date(expiresIso);
        } else {
          const mins = Math.max(1, Number(d.expiresInMinutes ?? 60));
          expiresDate = new Date(Date.now() + mins * 60_000);
        }
        const diffMs = expiresDate.getTime() - Date.now();
        if (diffMs > 0) {
          const totalMin = Math.floor(diffMs / 60_000);
          const h = Math.floor(totalMin / 60);
          const m = totalMin % 60;
          const timeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
          const tpl = String(d.timerTemplate ?? "⏰ Oferta termina em <b>{time}</b>");
          parts.push(tpl.replace(/\{time\}/g, timeStr));
        } else {
          parts.push("⏰ <b>Oferta expirada</b>");
        }
      }
      if (parts.length > 0) {
        await tgSend(token, chatId, parts.join("\n"), { html: true });
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "tag") {
      // 22/07/2026 (davi HOT feature 8): adiciona tag(s) ao chat. Broadcast
      // segmentado usa isso (BotConversation.tags[]). Ex: "vip", "abandonou".
      const rawTags = Array.isArray(d.tags)
        ? (d.tags as unknown[]).map((t) => String(t ?? "").trim()).filter(Boolean)
        : [];
      const action = String(d.action ?? "add");
      if (rawTags.length > 0) {
        try {
          const conv = await prisma.botConversation.findUnique({
            where: { botId_chatId: { botId, chatId } },
            select: { tags: true },
          });
          const existing = conv?.tags ?? [];
          let nextTags: string[];
          if (action === "remove") {
            nextTags = existing.filter((t) => !rawTags.includes(t));
          } else {
            // add: união (sem duplicar)
            const set = new Set(existing);
            for (const t of rawTags) set.add(t);
            nextTags = [...set];
          }
          await prisma.botConversation.updateMany({
            where: { botId, chatId },
            data: { tags: nextTags },
          });
        } catch (e) {
          console.warn("[bot-funnel] tag update falhou:", e);
        }
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "random") {
      // Sorteia entre os ramos que o seller de fato ligou (ramo sem fio não
      // pode ser sorteado, senão o funil morreria em 1/3 das vezes).
      const ligados: number[] = [];
      for (let i = 0; i < 3; i++) {
        if (nextNodes(g, cur.id, `rand_${i}`).length > 0) ligados.push(i);
      }
      if (ligados.length === 0) {
        cur = go(cur.id, "next");
        continue;
      }
      const sorteado = ligados[Math.floor(Math.random() * ligados.length)];
      cur = go(cur.id, `rand_${sorteado}`);
      continue;
    }
    if (type === "buttons") {
      const raw = String(d.text ?? "").trim();
      const text = rv(raw);
      const btns = Array.isArray(d.buttons)
        ? (d.buttons as Array<{ label?: string; kind?: string; url?: string }>)
        : [];
      const kb: InlineKeyboard = [];
      let hasNext = false;
      for (let i = 0; i < Math.min(btns.length, 8); i++) {
        const b = btns[i] ?? {};
        const label = String(b.label ?? "").trim().slice(0, 64);
        if (!label) continue;
        if (b.kind === "url") {
          const url = String(b.url ?? "").trim();
          if (/^https?:\/\//i.test(url)) {
            kb.push([{ text: label, url }]);
          }
        } else {
          kb.push([{ text: label, callback_data: `n:${cur.id}:${i}` }]);
          hasNext = true;
        }
      }
      // "⬅️ Voltar" — só aparece se existe passo anterior pra onde voltar e o
      // seller não desligou no bloco. Fica na última linha, sozinho, pra não
      // competir com as opções de verdade.
      if ((ctx.navHistory?.length ?? 0) > 0 && d.showBack !== false) {
        const backLabel = textOr(d.backLabel, BACK_LABEL_DEFAULT).slice(0, 64);
        kb.push([{ text: backLabel, callback_data: `b:${cur.id}` }]);
        hasNext = true;
      }
      if (text || kb.length > 0) {
        await tgSend(token, chatId, text || "👇", {
          keyboard: kb.length ? kb : undefined,
        });
      }
      if (hasNext) {
        return {
          status: "waiting_callback",
          currentNodeId: cur.id,
          pendingTxId: null,
          pendingPollId: null,
          pendingInputNodeId: null,
          scheduledResumeAt: null,
          scheduledResumeNodeId: null,
          variables,
        };
      }
      cur = go(cur.id, "next");
      continue;
    }
    if (type === "poll") {
      const question = rv(String(d.question ?? "").trim());
      const opts = Array.isArray(d.options)
        ? (d.options as unknown[])
            .map((o) => String(o ?? "").trim())
            .filter(Boolean)
            .slice(0, 10)
        : [];
      if (!question || opts.length < 2) {
        cur = go(cur.id, "next");
        continue;
      }
      const pollId = await tgSendPoll(token, chatId, question, opts);
      if (!pollId) {
        cur = go(cur.id, "next");
        continue;
      }
      return {
        status: "waiting_callback",
        currentNodeId: cur.id,
        pendingTxId: null,
        pendingPollId: pollId,
        pendingInputNodeId: null,
        scheduledResumeAt: null,
        scheduledResumeNodeId: null,
        variables,
      };
    }
    if (type === "payment") {
      // 22/07/2026 (davi): "Tira esse negocio de escolher checkout, o seller
      // so precisa escolher o valor (minimo 2 reais). Ele pode escolher gerar
      // quando a pessoa clica no botao ja aparece o code e o qr code, via
      // link de pagamento que ai sim precisa de um checkout."
      //
      // 3 modos:
      //  - "button" (DEFAULT) — bot manda mensagem + botão inline. Cliente
      //    clica → PIX é gerado NAQUELE MOMENTO no chat (QR image + copy).
      //    Não precisa de checkout — usa amountCents direto.
      //  - "chat" (imediato) — gera PIX assim que chega no bloco. Não
      //    precisa de checkout.
      //  - "link" — botão inline URL apontando pro checkout web (PIX+cartão+
      //    boleto). Precisa de checkoutSlug. Não pausa — segue "next".
      const rawMode = String(d.mode ?? "button");
      const mode: "button" | "chat" | "link" =
        rawMode === "link" ? "link" : rawMode === "chat" ? "chat" : "button";
      const amountCents = Math.round(Number(d.amountCents ?? d.priceCents ?? 0));
      const rawText = rv(String(d.text ?? "").trim());
      // textOr: label vazio faz o Telegram rejeitar o teclado inteiro (400),
      // então o bloco de pagamento não chegaria pro cliente.
      const buttonLabel = textOr(d.buttonLabel, "🛒 Pagar agora").trim().slice(0, 64);
      const priceStr = `R$ ${(amountCents / 100).toFixed(2)}`;
      const productName = String(d.productName ?? d.checkoutName ?? "Pagamento").trim() || "Pagamento";

      if (mode === "link") {
        // Modo link: precisa de checkout ativo
        const slug = String(d.checkoutSlug ?? "").trim();
        if (!slug) {
          cur = go(cur.id, "next");
          continue;
        }
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trilhopag.com";
        const host = String(d.checkoutHost ?? "").trim() || new URL(baseUrl).host;
        const url =
          `https://${host}/c/${encodeURIComponent(slug)}` +
          `?utm_source=telegram_bot` +
          `&utm_medium=bot_funnel` +
          `&utm_campaign=${encodeURIComponent(`botfunnel|${botId}`)}` +
          `&utm_content=${encodeURIComponent(chatId)}`;
        const priceForLink = amountCents > 0 ? priceStr : "";
        const labelWithPrice = buttonLabel.includes("R$") || !priceForLink
          ? buttonLabel
          : `${buttonLabel} — ${priceForLink}`;
        const html =
          rawText ||
          `<b>${escapeHtml(productName)}</b>${priceForLink ? `\n💰 <b>${priceForLink}</b>` : ""}\n\nClique no botão pra pagar (PIX, cartão ou boleto):`;
        await tgSend(token, chatId, html, {
          html: true,
          keyboard: [[{ text: labelWithPrice, url }]],
        });
        cur = go(cur.id, "next");
        continue;
      }

      // Extrai planos (multi) ou cai no fallback single (amountCents legacy).
      // 22/07/2026 (davi): "de varias opcoes de botao pra gerar o pix" —
      // cada plano vira um botão inline; cliente escolhe qual gera PIX.
      // 30/07/2026 (seller): descrição opcional por plano — aparece na
      // mensagem de comparação antes dos botões (só quando N>=2).
      const validPlans = parsePaymentPlans(d);

      if (mode === "button") {
        // Cache do id pra TS não perder narrowing dentro dos closures
        const nodeIdSafe = cur.id;
        if (validPlans.length > 1) {
          // MULTI-PLANOS: 1 botão por plano
          //
          // Se algum plano tem descrição, monta um bloco de comparação:
          //   💠 <b>Título</b> — R$ 18,79 · 30 dias
          //     <i>Descrição do que oferece</i>
          //
          // Sem descrição em nenhum plano, mantém o cabeçalho simples de
          // antes ("Escolha um plano 👇 Escolha:") — não muda pra quem não
          // quis preencher.
          /**
           * 30/07/2026 (seller: "arrume a parte de descrição ela não está
           * aparecendo no chat do telegram"). BUG: se o bloco tinha rawText
           * (o campo "Mensagem opcional acima do PIX"), o runtime CAÍA no
           * primeiro branch (só rawText) e IGNORAVA a comparação com as
           * descrições. Agora rawText vira o CABEÇALHO (sempre no topo) e a
           * comparação de planos com descrição vem em seguida.
           */
          const anyDescription = validPlans.some((p) => p.description);
          const header = rawText
            ? escapeHtml(rawText)
            : `<b>${escapeHtml(productName || "Escolha um plano")}</b>`;
          let html: string;
          if (anyDescription) {
            const lines = validPlans.map((p, i) => {
              const price = `R$ ${(p.amountCents / 100).toFixed(2).replace(".", ",")}`;
              const titleFallback = p.title || `Plano ${i + 1}`;
              const periodBit = p.period ? ` · ${escapeHtml(p.period)}` : "";
              const head = `💠 <b>${escapeHtml(titleFallback)}</b> — ${price}${periodBit}`;
              const desc = p.description ? `\n<i>${escapeHtml(p.description)}</i>` : "";
              return head + desc;
            });
            html = `${header}\n\n${lines.join("\n\n")}\n\n👇 Escolha abaixo:`;
          } else {
            html = `${header}\n\n👇 Escolha:`;
          }
          const kb: InlineKeyboard = validPlans.map((p, i) => {
            const price = `R$ ${(p.amountCents / 100).toFixed(2).replace(".", ",")}`;
            const label =
              (p.title || `Plano ${i + 1}`) +
              (p.period ? ` (${p.period})` : "");
            return [{ text: `${price} / ${label}`, callback_data: `pix:${nodeIdSafe}:${i}` }];
          });
          await tgSend(token, chatId, html, { html: true, keyboard: kb });
          return {
            status: "waiting_callback",
            currentNodeId: cur.id,
            pendingTxId: null,
            pendingPollId: null,
            pendingInputNodeId: null,
            scheduledResumeAt: null,
            scheduledResumeNodeId: null,
            variables,
          };
        }
        // SINGLE PLAN (fallback + retrocompat)
        const singleAmount = validPlans[0]?.amountCents ?? amountCents;
        const singleName = validPlans[0]?.title || productName;
        if (!Number.isFinite(singleAmount) || singleAmount < 200) {
          cur = go(cur.id, "next");
          continue;
        }
        const singlePrice = `R$ ${(singleAmount / 100).toFixed(2)}`;
        const labelWithPrice = buttonLabel.includes("R$")
          ? buttonLabel
          : `${buttonLabel} — ${singlePrice}`;
        const html =
          rawText ||
          `<b>${escapeHtml(singleName || "Pagamento")}</b>\n💰 <b>${singlePrice}</b>\n\n👇 Clica no botão pra receber seu PIX:`;
        await tgSend(token, chatId, html, {
          html: true,
          keyboard: [[{ text: labelWithPrice, callback_data: `pix:${cur.id}:0` }]],
        });
        return {
          status: "waiting_callback",
          currentNodeId: cur.id,
          pendingTxId: null,
          pendingPollId: null,
          pendingInputNodeId: null,
          scheduledResumeAt: null,
          scheduledResumeNodeId: null,
          variables,
        };
      }

      // mode === "chat": só suporta 1 valor. Usa plans[0] se existir,
      // senão cai no amountCents legacy.
      if (!Number.isFinite(amountCents) || amountCents < 200) {
        // Se plans tem 1 válido, usa dele
        if (validPlans.length === 0) {
          cur = go(cur.id, "next");
          continue;
        }
      }

      // mode === "chat": gera PIX imediatamente. Usa plans[0] se existir,
      // senão cai no amountCents legacy.
      const chatAmount = validPlans[0]?.amountCents ?? amountCents;
      const chatLabel = validPlans[0]?.title || productName;
      const pix = await generateBotFunnelPix({
        userId,
        botId,
        chatId,
        amountCents: chatAmount,
        label: chatLabel,
        customerName: fromName,
      });
      if (!pix.ok) {
        await tgSend(token, chatId, pix.error);
        return { ...baseState(), variables };
      }
      // Se o seller pôs texto persuasivo, manda separado antes do PIX
      if (rawText) await tgSend(token, chatId, rawText);
      // Mensagem estilizada do PIX (título + code + legenda + 3 botões).
      // Modo Auto só usa plans[0] — logo, é a config DELE que vale aqui.
      const chatPix = resolvePixMessageConfig(d, planPixOf(validPlans[0]));
      await tgSendPixPaymentUI(token, chatId, {
        title: rv(chatPix.title),
        copyPaste: pix.copy_paste,
        instruction: rv(chatPix.instruction),
        help: rv(chatPix.help),
        copyButtonLabel: chatPix.copyButtonLabel,
        qrButtonLabel: chatPix.qrButtonLabel,
        verifyButtonLabel: chatPix.verifyButtonLabel,
        showCopyButton: chatPix.showCopyButton,
        showQrButton: chatPix.showQrButton,
        showVerifyButton: chatPix.showVerifyButton,
        expiresAt: pix.expires_at,
      });
      return {
        status: "waiting_payment",
        currentNodeId: cur.id,
        pendingTxId: pix.transaction_id,
        pendingPollId: null,
        pendingInputNodeId: null,
        // Agenda o "não pagou". Sem isto a conversa ficava em
        // waiting_payment pra sempre — ver unpaidDeadline.
        scheduledResumeAt: unpaidDeadline(d),
        scheduledResumeNodeId: cur.id,
        variables,
      };
    }
    if (type === "botproduct") {
      const productId = String((cur.data as Record<string, unknown>)?.productId ?? "");
      const product = await prisma.product.findFirst({
        where: { id: productId, userId, active: true },
        select: {
          name: true,
          priceCents: true,
          checkouts: { where: { active: true }, orderBy: { createdAt: "asc" }, take: 1, select: { slug: true } },
        },
      });
      const slug = product?.checkouts[0]?.slug;
      if (!product || !slug) {
        await tgSend(token, chatId, "Oferta indisponível no momento.");
        return { ...baseState(), variables };
      }
      const pix = await generatePix(slug, fromName, chatId, botId);
      if (!pix) {
        await tgSend(token, chatId, "Não consegui gerar o PIX agora. Manda /start pra tentar de novo.");
        return { ...baseState(), variables };
      }
      const caption =
        `<b>🛒 ${escapeHtml(product.name)}</b>\n` +
        `💰 <b>R$ ${(product.priceCents / 100).toFixed(2)}</b>\n\n` +
        `📋 <b>PIX Copia e Cola:</b>\n<code>${pix.copy_paste}</code>\n\n` +
        `Assim que o pagamento cair, eu continuo por aqui. ✅`;
      if (pix.qr_code_image) await tgSendPhoto(token, chatId, pix.qr_code_image, caption);
      else await tgSend(token, chatId, caption, { html: true });
      return {
        status: "waiting_payment",
        currentNodeId: cur.id,
        pendingTxId: pix.transaction_id ?? null,
        pendingPollId: null,
        pendingInputNodeId: null,
        scheduledResumeAt: null,
        scheduledResumeNodeId: null,
        variables,
      };
    }
    cur = go(cur.id, "next");
  }
  return { ...baseState(), variables };
}

async function upsertConversation(
  botId: string,
  chatId: string,
  funnelId: string,
  fromName: string,
  state: RunState,
  meta?: { languageCode?: string; firstName?: string; username?: string },
) {
  await prisma.botConversation.upsert({
    where: { botId_chatId: { botId, chatId } },
    create: {
      botId,
      chatId,
      funnelId,
      customerName: fromName,
      status: state.status,
      currentNodeId: state.currentNodeId,
      pendingTxId: state.pendingTxId,
      pendingPollId: state.pendingPollId,
      pendingInputNodeId: state.pendingInputNodeId,
      variables: state.variables as object,
      scheduledResumeAt: state.scheduledResumeAt,
      scheduledResumeNodeId: state.scheduledResumeNodeId,
      languageCode: meta?.languageCode,
      firstName: meta?.firstName,
      username: meta?.username,
    },
    update: {
      funnelId,
      customerName: fromName,
      status: state.status,
      currentNodeId: state.currentNodeId,
      pendingTxId: state.pendingTxId,
      pendingPollId: state.pendingPollId,
      pendingInputNodeId: state.pendingInputNodeId,
      variables: state.variables as object,
      scheduledResumeAt: state.scheduledResumeAt,
      scheduledResumeNodeId: state.scheduledResumeNodeId,
      // /start recomeça do zero: sem isto a conversa reiniciada herdaria a
      // trilha da anterior e mostraria "Voltar" já na primeira mensagem,
      // apontando pra um passo que o cliente não viu nesta rodada.
      navHistory: [],
      ...(meta?.languageCode ? { languageCode: meta.languageCode } : {}),
      ...(meta?.firstName ? { firstName: meta.firstName } : {}),
      ...(meta?.username ? { username: meta.username } : {}),
    },
  });
}

/** Começa (ou reinicia) a conversa. Retorna false se runtime desligado. */
export async function startBotConversation(
  botId: string,
  chatId: string | number,
  fromName: string,
  meta?: { languageCode?: string; firstName?: string; username?: string },
): Promise<boolean> {
  const bot = await prisma.saleBot.findUnique({
    where: { id: botId },
    select: { id: true, userId: true, botToken: true, type: true, active: true, funnelRuntimeEnabled: true },
  });
  if (!bot || bot.type !== "telegram" || !bot.botToken || !bot.active || !bot.funnelRuntimeEnabled) {
    return false;
  }
  const chatIdStr = String(chatId);

  // 22/07/2026 (davi HOT feature 9): rate limit / anti-abuse.
  // Protege quota Telegram e evita scripts saturarem.
  //
  // 30/07/2026 (seller: "O bot simplesmente parou de funcionar") — o bloqueio
  // era PERMANENTE e não existe nenhuma tela pra desbloquear. O seller testou
  // o próprio funil, mandou 11 /start em 20min, estourou o limite de 10/h e o
  // bot dele ficou MUDO PRA SEMPRE. Em 1689 conversas da plataforma inteira, a
  // única bloqueada era a de teste dele — a regra só pegava falso positivo.
  //
  // Agora o bloqueio é COOLDOWN, não sentença: passou a janela de 1h, destrava
  // sozinho. E o teto subiu de 10 pra 30/h — flood de script continua barrado,
  // seller testando o próprio bot não é mais punido.
  const existingConv = await prisma.botConversation.findUnique({
    where: { botId_chatId: { botId: bot.id, chatId: chatIdStr } },
    select: {
      blocked: true,
      blockedReason: true,
      startCount1h: true,
      startWindowStartedAt: true,
    },
  });
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600_000);

  if (existingConv?.blocked) {
    // Bloqueio automático (anti-abuse) expira junto com a janela de 1h.
    // Bloqueio posto à mão pelo seller (blockedReason sem "abuse:") continua
    // valendo pra sempre — esse é intencional, não pode auto-destravar.
    const isAutoBlock = (existingConv.blockedReason ?? "").startsWith("abuse:");
    const windowExpired =
      !existingConv.startWindowStartedAt ||
      existingConv.startWindowStartedAt <= oneHourAgo;
    if (!isAutoBlock || !windowExpired) {
      return false; // silêncio total
    }
    await prisma.botConversation.updateMany({
      where: { botId: bot.id, chatId: chatIdStr },
      data: {
        blocked: false,
        blockedReason: null,
        startCount1h: 0,
        startWindowStartedAt: now,
      },
    });
    console.warn(`[bot-funnel] chat ${chatIdStr} destravado (cooldown 1h venceu)`);
  }

  let newCount = 1;
  let newWindowStart: Date = now;
  if (
    !existingConv?.blocked &&
    existingConv?.startWindowStartedAt &&
    existingConv.startWindowStartedAt > oneHourAgo
  ) {
    newCount = existingConv.startCount1h + 1;
    newWindowStart = existingConv.startWindowStartedAt;
  }
  if (newCount > START_LIMIT_1H) {
    // Cooldown: silencia até a janela de 1h fechar, aí destrava sozinho.
    await prisma.botConversation.updateMany({
      where: { botId: bot.id, chatId: chatIdStr },
      data: {
        blocked: true,
        blockedReason: `abuse: ${newCount} /start em 1h`,
      },
    });
    console.warn(`[bot-funnel] chat ${chatIdStr} em cooldown (bot ${bot.id}) por abuso`);
    return false;
  }

  const funnel = await prisma.funnel.findFirst({
    where: { userId: bot.userId, kind: "bot", botId: bot.id, active: true },
    select: { id: true, graph: true },
  });
  if (!funnel) return false;
  const g = parseGraph(funnel.graph);
  if (!g) return false;
  const start = findStart(g);
  if (!start) return false;

  const ctx: ExecCtx = {
    token: bot.botToken,
    botId: bot.id,
    userId: bot.userId,
    funnelId: funnel.id,
    g,
    chatId: chatIdStr,
    fromName,
    variables: { __language: meta?.languageCode ?? "" },
  };
  const state = await executeFrom(ctx, start.id);
  await upsertConversation(bot.id, chatIdStr, funnel.id, fromName, state, meta);
  // Atualiza contador de rate limit APÓS o upsert (que grava o resto do estado)
  await prisma.botConversation.updateMany({
    where: { botId: bot.id, chatId: chatIdStr },
    data: { startCount1h: newCount, startWindowStartedAt: newWindowStart },
  });
  return true;
}

/** Inicia conversa em um nó específico (comandos custom /comprar etc). */
export async function startBotConversationAtNode(
  botId: string,
  chatId: string | number,
  fromName: string,
  startNodeId: string,
  meta?: { languageCode?: string; firstName?: string; username?: string },
): Promise<boolean> {
  const bot = await prisma.saleBot.findUnique({
    where: { id: botId },
    select: { id: true, userId: true, botToken: true, type: true, active: true, funnelRuntimeEnabled: true },
  });
  if (!bot || bot.type !== "telegram" || !bot.botToken || !bot.active || !bot.funnelRuntimeEnabled) {
    return false;
  }
  const funnel = await prisma.funnel.findFirst({
    where: { userId: bot.userId, kind: "bot", botId: bot.id, active: true },
    select: { id: true, graph: true },
  });
  if (!funnel) return false;
  const g = parseGraph(funnel.graph);
  if (!g) return false;
  if (!g.nodes.find((n) => n.id === startNodeId)) return false;

  const chatIdStr = String(chatId);
  const ctx: ExecCtx = {
    token: bot.botToken,
    botId: bot.id,
    userId: bot.userId,
    funnelId: funnel.id,
    g,
    chatId: chatIdStr,
    fromName,
    variables: { __language: meta?.languageCode ?? "" },
  };
  const state = await executeFrom(ctx, startNodeId);
  await upsertConversation(bot.id, chatIdStr, funnel.id, fromName, state, meta);
  return true;
}

async function advanceConversation(
  transactionId: string,
  branch: "upsell" | "downsell",
): Promise<void> {
  // Primeiro tenta reconciliar por pendingTxId (fluxo direto), depois por
  // botFunnelTrace (modo link do bloco payment onde tx foi criada no
  // checkout web).
  let conv = await prisma.botConversation.findFirst({
    where: { pendingTxId: transactionId, status: "waiting_payment" },
    select: { id: true, botId: true, chatId: true, funnelId: true, currentNodeId: true, customerName: true, variables: true },
  });
  if (!conv) {
    // Tenta botFunnelTrace: busca tx pra pegar o trace, casa com conversa
    const tx = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { botFunnelTrace: true },
    });
    if (tx?.botFunnelTrace) {
      const [botId, chatId] = tx.botFunnelTrace.split("|");
      if (botId && chatId) {
        /**
         * 01/08/2026: entraram `waiting_callback`/`waiting_input`. Desde que
         * o "não pagou" passou a disparar sozinho (ver unpaidDeadline), quem
         * paga DEPOIS do prazo já está no meio da recuperação — parado num
         * bloco de botões ou de pergunta. Sem esses status a conversa não
         * era encontrada e o cliente pagava sem receber nada.
         */
        conv = await prisma.botConversation.findFirst({
          where: {
            botId,
            chatId,
            status: { in: ["waiting_payment", "waiting_callback", "waiting_input", "sleeping", "active"] },
          },
          select: { id: true, botId: true, chatId: true, funnelId: true, currentNodeId: true, customerName: true, variables: true },
        });
      }
    }
  }
  if (!conv) return;

  const bot = await prisma.saleBot.findUnique({
    where: { id: conv.botId },
    select: { id: true, userId: true, botToken: true, active: true, funnelRuntimeEnabled: true },
  });
  if (!bot || !bot.botToken || !bot.active || !bot.funnelRuntimeEnabled) return;
  const funnel = await prisma.funnel.findUnique({ where: { id: conv.funnelId }, select: { graph: true } });
  const g = funnel ? parseGraph(funnel.graph) : null;
  if (!g) return;

  const vars = (conv.variables as Record<string, unknown> | null) ?? {};

  /**
   * De qual bloco rotear. Normal = onde a conversa está (o próprio bloco de
   * pagamento). Mas se o "não pagou" já disparou, `currentNodeId` aponta pro
   * bloco de recuperação, que não tem bolinha "pagou" — aí volta pro bloco
   * de pagamento guardado em __pay_node (ver PAY_NODE_VAR).
   */
  const payNodeId =
    typeof vars[PAY_NODE_VAR] === "string" && vars[PAY_NODE_VAR] !== ""
      ? String(vars[PAY_NODE_VAR])
      : null;
  const fromNode = conv.currentNodeId ?? payNodeId;
  if (!fromNode) return;

  emitAnalytics(conv.botId, conv.funnelId, conv.chatId, fromNode, "payment", "convert", { branch });

  /**
   * 29/07/2026 (davi: "faça com que o painel do upsell tenha mais bolinhas
   * de pagou de acordo com o tanto de plano criado dentro dele... o certo
   * seria duas bolinhas de pago para separar o entregavel de cada um").
   *
   * Pagamento no modo button pode ter vindo de um dos N planos do bloco.
   * O plano foi persistido em providerPayload.plan_idx quando o PIX foi
   * gerado (ver bot-funnel-pix.ts). Aqui a gente:
   *   1. tenta a bolinha específica `upsell_${planIdx}` (novo)
   *   2. se ela não tem fio conectado, cai pra `upsell` genérica (compat
   *      pros funis antigos ou pra quem só quer 1 fluxo pós-pagamento)
   *
   * `downsell` não muda: "não pagou" é sempre uma sequência de recuperação
   * genérica, ainda que existam múltiplos planos.
   */
  let planIdx: number | undefined;
  if (branch === "upsell") {
    const tx = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { providerPayload: true },
    });
    const payload = (tx?.providerPayload as Record<string, unknown> | null) ?? {};
    const raw = payload.plan_idx;
    if (typeof raw === "number" && Number.isFinite(raw)) planIdx = raw;
  }
  const rota = (nodeId: string) =>
    (planIdx !== undefined
      ? abrirSaida(g, nodeId, `upsell_${planIdx}`, vars)
      : null) ?? abrirSaida(g, nodeId, branch, vars);

  let next = rota(fromNode);
  /**
   * 01/08/2026: pagou DEPOIS do "não pagou" ter disparado — só acontece se o
   * seller encurtou o prazo e o PIX ainda estava válido. Sem esse retorno ao
   * bloco de pagamento a conversa era marcada `done` e o cliente pagava sem
   * receber a entrega.
   */
  if (!next && branch === "upsell" && payNodeId && payNodeId !== fromNode) {
    next = rota(payNodeId);
  }
  // Migalha consumida: pagamento resolvido, não serve mais pro próximo ciclo.
  if (branch === "upsell") delete vars[PAY_NODE_VAR];
  if (!next) {
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: {
        status: "done",
        pendingTxId: null,
        pendingPollId: null,
        pendingInputNodeId: null,
        currentNodeId: null,
        // Pagou enquanto dormia no `reengage`: zera o agendamento também, pra
        // não sobrar lixo apontando pra um ciclo que já acabou.
        scheduledResumeAt: null,
        scheduledResumeNodeId: null,
      },
    });
    return;
  }
  const ctx: ExecCtx = {
    token: bot.botToken,
    botId: bot.id,
    userId: bot.userId,
    funnelId: conv.funnelId,
    g,
    chatId: conv.chatId,
    fromName: conv.customerName ?? "Cliente",
    variables: vars,
  };
  const state = await executeFrom(ctx, next.id);
  await prisma.botConversation.update({
    where: { id: conv.id },
    data: {
      status: state.status,
      currentNodeId: state.currentNodeId,
      pendingTxId: state.pendingTxId,
      pendingPollId: state.pendingPollId,
      pendingInputNodeId: state.pendingInputNodeId,
      variables: state.variables as object,
      scheduledResumeAt: state.scheduledResumeAt,
      scheduledResumeNodeId: state.scheduledResumeNodeId,
    },
  });
}

export async function advanceBotConversationOnPaid(transactionId: string): Promise<void> {
  return advanceConversation(transactionId, "upsell");
}
export async function advanceBotConversationOnExpired(transactionId: string): Promise<void> {
  return advanceConversation(transactionId, "downsell");
}

export async function advanceBotConversationOnCallback(
  botId: string,
  chatId: string | number,
  callbackData: string,
): Promise<void> {
  // Formatos de callback:
  //  - "n:${nodeId}:${btnIdx}"  → clique em bloco `buttons` normal
  //  - "pix:${nodeId}"          → clique no botão do bloco `payment` modo
  //                                "button" (gera PIX agora e envia)
  //  - "pixcopy" / "pixqr" / "pixcheck" → cliques nos botões da UI de PIX
  //                                        (não muda estado, só age)
  //  - "b:${nodeId}"            → "⬅️ Voltar" de um bloco `buttons`
  const chatIdStr = String(chatId);
  const conv = await prisma.botConversation.findUnique({
    where: { botId_chatId: { botId, chatId: chatIdStr } },
    select: {
      id: true, botId: true, chatId: true, funnelId: true,
      currentNodeId: true, customerName: true, variables: true, pendingTxId: true,
      navHistory: true,
    },
  });
  if (!conv) return;

  const bot0 = await prisma.saleBot.findUnique({
    where: { id: conv.botId },
    select: { id: true, botToken: true, active: true, funnelRuntimeEnabled: true },
  });
  if (!bot0 || !bot0.botToken || !bot0.active || !bot0.funnelRuntimeEnabled) return;

  // === Botões da UI de PIX (após geração) ===
  // Não mudam estado da conversa, só respondem à interação.
  if (callbackData === "pixcopy" || callbackData === "pixqr" || callbackData === "pixcheck") {
    if (!conv.pendingTxId) return;
    const tx = await prisma.transaction.findUnique({
      where: { id: conv.pendingTxId },
      select: { pixCopyPaste: true, status: true, amountCents: true, paidAt: true, pixExpiresAt: true },
    });
    if (!tx) return;

    if (callbackData === "pixcopy") {
      // Re-envia o EMV em <code> — Telegram tap-to-copy funciona
      if (tx.pixCopyPaste) {
        await tgSend(
          bot0.botToken,
          conv.chatId,
          `<code>${escapeHtml(tx.pixCopyPaste)}</code>\n\n👆 Toca no código pra copiar.`,
          { html: true },
        );
      }
      return;
    }
    if (callbackData === "pixqr") {
      if (tx.pixCopyPaste) {
        try {
          const dataUrl = await (await import("qrcode")).toDataURL(tx.pixCopyPaste, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 512,
          });
          const sent = await tgSendPhotoDataUrl(
            bot0.botToken,
            conv.chatId,
            dataUrl,
            "📱 Abre o app do seu banco → Pagar → Ler QR Code",
          );
          if (!sent) {
            await tgSend(bot0.botToken, conv.chatId, "Não consegui gerar o QR agora. Use o código PIX acima.");
          }
        } catch {
          await tgSend(bot0.botToken, conv.chatId, "Não consegui gerar o QR agora. Use o código PIX acima.");
        }
      }
      return;
    }
    // pixcheck: informa o status atual + countdown restante se PENDING
    let statusMsg: string;
    if (tx.status === "PAID") {
      statusMsg = `✅ Pagamento CONFIRMADO! (R$ ${(tx.amountCents / 100).toFixed(2)})`;
    } else if (tx.status === "EXPIRED") {
      statusMsg = "⌛ PIX expirou. Manda /start pra tentar de novo.";
    } else if (tx.status === "FAILED") {
      statusMsg = "❌ Falha no pagamento. Manda /start pra tentar de novo.";
    } else {
      // 22/07/2026 (davi feature 4): countdown timer no botão verificar
      let timePart = "";
      if (tx.pixExpiresAt) {
        const diffMs = tx.pixExpiresAt.getTime() - Date.now();
        if (diffMs > 0) {
          const totalMin = Math.floor(diffMs / 60_000);
          const timeStr =
            totalMin >= 60
              ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}min`
              : `${totalMin}min`;
          timePart = `\n\n⏰ <b>Ainda dá tempo:</b> este PIX expira em ${timeStr}`;
        } else {
          timePart = `\n\n⏰ <b>Este PIX já expirou.</b> Manda /start pra gerar de novo.`;
        }
      }
      statusMsg = `⏳ <b>Ainda não caiu.</b> Após pagar, o PIX leva até 30s pra ser confirmado — tenta de novo em alguns segundos.${timePart}`;
    }
    await tgSend(bot0.botToken, conv.chatId, statusMsg, { html: true });
    return;
  }

  const parts = callbackData.split(":");
  const kind = parts[0];
  if (kind !== "n" && kind !== "pix" && kind !== "b") return;
  const nodeId = parts[1];
  if (!nodeId) return;

  /**
   * 27/07/2026 (davi): "quando a pessoa clica num botão não consegue mais
   * selecionar outro".
   *
   * O Telegram NUNCA apaga os botões de uma mensagem já enviada — o chat
   * inteiro continua rolável e clicável. Só que aqui só se aceitava clique
   * do nó ATUAL, então tudo que estava acima virava no-op silencioso: o
   * cliente tocava e não acontecia absolutamente nada, parecendo bot
   * travado. É a queixa exata do seller.
   *
   * Agora, se o clique veio de um bloco por onde a conversa JÁ passou, a
   * trilha rebobina até ali e o clique vale — a pessoa escolhe outra opção
   * sem precisar dar /start e perder tudo.
   *
   * Pagamento fica de fora de propósito: rebobinar um `pix:` clicado lá em
   * cima geraria uma segunda cobrança pro mesmo cliente.
   */
  let history = conv.navHistory ?? [];
  if (conv.currentNodeId !== nodeId) {
    if (kind === "pix") return;
    const idx = history.lastIndexOf(nodeId);
    if (idx < 0) return; // nó que a conversa nunca visitou: ignora
    history = history.slice(0, idx);
  }

  const bot = await prisma.saleBot.findUnique({
    where: { id: conv.botId },
    select: { id: true, userId: true, botToken: true, active: true, funnelRuntimeEnabled: true },
  });
  if (!bot || !bot.botToken || !bot.active || !bot.funnelRuntimeEnabled) return;
  const funnel = await prisma.funnel.findUnique({ where: { id: conv.funnelId }, select: { graph: true } });
  const g = funnel ? parseGraph(funnel.graph) : null;
  if (!g) return;

  const vars = (conv.variables as Record<string, unknown> | null) ?? {};

  // === CLIQUE PIX (bloco payment modo button) ===
  // Formato callback_data: "pix:${nodeId}[:${planIdx}]"
  //  - Sem planIdx: legacy single-button
  //  - Com planIdx: multi-planos, gera PIX do plano selecionado
  if (kind === "pix") {
    const node = g.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "payment") return;
    const d = (node.data as Record<string, unknown>) ?? {};
    const planIdxStr = parts[2];
    const planIdx = planIdxStr !== undefined ? Number(planIdxStr) : NaN;

    // Extrai valor+label do plano selecionado (ou fallback single).
    // MESMO parser do envio — `planIdx` indexa esta lista já filtrada, então
    // ler direto de d.plans[planIdx] pegaria o plano errado sempre que
    // houvesse um plano abaixo de R$2,00 antes dele.
    const validPlans = parsePaymentPlans(d);

    let amountCents = Math.round(Number(d.amountCents ?? d.priceCents ?? 0));
    let productName = String(d.productName ?? d.checkoutName ?? "Pagamento").trim() || "Pagamento";

    // Plano efetivamente escolhido — guardado porque, além de valor e nome,
    // ele carrega a mensagem do PIX própria (usada lá embaixo).
    let selectedPlan: (typeof validPlans)[number] | undefined;

    if (Number.isFinite(planIdx) && validPlans[planIdx]) {
      selectedPlan = validPlans[planIdx];
      amountCents = selectedPlan.amountCents;
      productName =
        selectedPlan.title + (selectedPlan.period ? ` (${selectedPlan.period})` : "");
    } else if (validPlans.length > 0) {
      // planIdx ausente ou inválido — usa primeiro plano válido
      selectedPlan = validPlans[0];
      amountCents = selectedPlan.amountCents;
      productName =
        selectedPlan.title + (selectedPlan.period ? ` (${selectedPlan.period})` : "");
    }

    if (!Number.isFinite(amountCents) || amountCents < 200) return;

    // === ORDER BUMP (davi HOT feature 5; 2º bump em 06/08/2026) ===
    //
    // Os bumps são perguntados UM DE CADA VEZ, e cada resposta vira mais um
    // pedaço no callback_data:
    //
    //   pix:node:0        → nenhuma resposta ainda  → pergunta o bump 1
    //   pix:node:0:y      → 1 resposta              → pergunta o bump 2
    //   pix:node:0:y:n    → todas respondidas       → gera o PIX
    //
    // Ou seja, `parts.slice(3)` é o histórico de decisões e o seu tamanho
    // diz qual bump falta. Assim o fluxo não sabe (nem precisa saber) se
    // existem um ou dois bumps ligados — e um funil antigo, com só o bump
    // 1, se comporta exatamente como antes.
    const bumps = parseOrderBumps(d);
    const decisoes = parts.slice(3);
    const bumpPendente = bumps[decisoes.length];

    if (bumpPendente) {
      // Mostra a pergunta desse bump. Não gera PIX ainda.
      const bumpPrice = `R$ ${(bumpPendente.amountCents / 100).toFixed(2).replace(".", ",")}`;
      const rv = (s: string) => renderVars(s, { nome: conv.customerName ?? "Cliente", variables: vars });
      const promptTpl = textOr(
        bumpPendente.prompt,
        "🎁 <b>Aproveita e leva também</b>\n\n{title}\n\nPor +<b>{price}</b>",
      );
      let html = rv(
        promptTpl.replace(/\{title\}/g, bumpPendente.title).replace(/\{price\}/g, bumpPrice),
      );
      // Última rede: se o template do seller renderizar vazio (só variáveis
      // que não existem, por ex.), monta uma mensagem mínima. Mandar text=""
      // pro Telegram é erro 400 e o cliente ficaria sem resposta nenhuma.
      if (!html.trim()) {
        html = `🎁 <b>Aproveita e leva também</b>\n\n${escapeHtml(bumpPendente.title)}\n\nPor +<b>${bumpPrice}</b>`;
      }
      const planPart = Number.isFinite(planIdx) ? `:${planIdx}` : ":0";
      // As respostas já dadas viajam junto, senão a próxima tela perderia o
      // "sim" do bump anterior e o cliente pagaria menos do que aceitou.
      const trilha = decisoes.length ? `:${decisoes.join(":")}` : "";
      const base = `pix:${nodeId}${planPart}${trilha}`;
      await tgSend(bot.botToken, conv.chatId, html, {
        html: true,
        keyboard: [
          [{ text: `✅ SIM, adicionar (+${bumpPrice})`, callback_data: `${base}:y` }],
          [{ text: `❌ Não, seguir sem`, callback_data: `${base}:n` }],
        ],
      });
      emitAnalytics(conv.botId, conv.funnelId, conv.chatId, nodeId, "payment", "click", {
        stage: "bump_shown",
        bumpIdx: decisoes.length,
      });
      return;
    }

    // Soma os bumps aceitos, na ordem em que foram oferecidos.
    const comBumps = applyOrderBumps(bumps, decisoes, { amountCents, productName });
    amountCents = comBumps.amountCents;
    productName = comBumps.productName;
    const bumpsAceitos = comBumps.aceitos;

    emitAnalytics(conv.botId, conv.funnelId, conv.chatId, nodeId, "payment", "click", {
      planIdx: Number.isFinite(planIdx) ? planIdx : undefined,
      // Uma letra por bump ofertado, na ordem: "yn" = aceitou o 1º, recusou
      // o 2º. Vazio quando o bloco não tem bump nenhum.
      bumps: bumps.length ? bumps.map((_, i) => decisoes[i] ?? "?").join("") : undefined,
      bumpsAceitos: bumpsAceitos.length ? bumpsAceitos : undefined,
    });

    const pix = await generateBotFunnelPix({
      userId: bot.userId,
      botId: bot.id,
      chatId: conv.chatId,
      amountCents,
      label: productName,
      customerName: conv.customerName ?? "Cliente",
      // 29/07/2026: cada plano pode ter seu próprio entregável na bolinha
      // `upsell_${planIdx}`. Sem plano válido (single-price legacy, bump
      // sem multi-plano), fica undefined e o runtime cai pra `upsell` geral.
      planIdx: Number.isFinite(planIdx) ? planIdx : undefined,
    });
    if (!pix.ok) {
      await tgSend(bot.botToken, conv.chatId, pix.error);
      return;
    }
    // Se o seller pôs texto persuasivo (rawText no node), envia antes
    const rawText = String(d.text ?? "").trim();
    if (rawText) {
      const rv = (s: string) => renderVars(s, { nome: conv.customerName ?? "Cliente", variables: vars });
      await tgSend(bot.botToken, conv.chatId, rv(rawText));
    }
    // Mensagem estilizada do PIX (título + code + legenda + 3 botões)
    const rv = (s: string) => renderVars(s, { nome: conv.customerName ?? "Cliente", variables: vars });
    // Mensagem do PIX do PLANO clicado, herdando do bloco o que ele não
    // sobrescreveu. Com 1 plano só (ou nenhum) isso é idêntico ao que era.
    const pixUI = resolvePixMessageConfig(d, planPixOf(selectedPlan));
    await tgSendPixPaymentUI(bot.botToken, conv.chatId, {
      title: rv(pixUI.title),
      copyPaste: pix.copy_paste,
      instruction: rv(pixUI.instruction),
      help: rv(pixUI.help),
      copyButtonLabel: pixUI.copyButtonLabel,
      qrButtonLabel: pixUI.qrButtonLabel,
      verifyButtonLabel: pixUI.verifyButtonLabel,
      showCopyButton: pixUI.showCopyButton,
      showQrButton: pixUI.showQrButton,
      showVerifyButton: pixUI.showVerifyButton,
    });

    await prisma.botConversation.update({
      where: { id: conv.id },
      data: {
        status: "waiting_payment",
        pendingTxId: pix.transaction_id,
        pendingPollId: null,
        pendingInputNodeId: null,
        // mantém currentNodeId=nodeId pra branch pagou/nao-pagou casar depois
        // Agenda o "não pagou" (ver unpaidDeadline). Explícito também porque
        // este update NÃO reescrevia scheduledResumeAt — se o cliente viesse
        // de um bloco que dormia, sobrava agendamento velho apontando pro
        // nó errado.
        scheduledResumeAt: unpaidDeadline(d),
        scheduledResumeNodeId: nodeId,
      },
    });
    return;
  }

  // === "⬅️ VOLTAR" (bloco buttons) ===
  // Reexecuta a partir do bloco anterior da trilha. Como o alvo é sempre um
  // bloco `buttons`, o `executeFrom` só reenvia aquela mensagem e para de
  // novo — nenhum bloco do meio roda outra vez, então não duplica cobrança,
  // tag nem disparo.
  if (kind === "b") {
    const prevId = history[history.length - 1];
    if (!prevId) return; // sem pra onde voltar (trilha vazia)
    const back = history.slice(0, -1);
    // Vai como "click" com marca no meta: o dashboard soma os eventos por
    // tipo e um valor novo no enum viraria fatia órfã nos gráficos.
    emitAnalytics(conv.botId, conv.funnelId, conv.chatId, nodeId, "buttons", "click", { back: true });

    const ctxBack: ExecCtx = {
      token: bot.botToken,
      botId: bot.id,
      userId: bot.userId,
      funnelId: conv.funnelId,
      g,
      chatId: conv.chatId,
      fromName: conv.customerName ?? "Cliente",
      variables: vars,
      navHistory: back,
    };
    const stBack = await executeFrom(ctxBack, prevId);
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: {
        status: stBack.status,
        currentNodeId: stBack.currentNodeId,
        pendingTxId: stBack.pendingTxId,
        pendingPollId: stBack.pendingPollId,
        pendingInputNodeId: stBack.pendingInputNodeId,
        variables: stBack.variables as object,
        scheduledResumeAt: stBack.scheduledResumeAt,
        scheduledResumeNodeId: stBack.scheduledResumeNodeId,
        navHistory: back,
      },
    });
    return;
  }

  // === CLIQUE EM BOTÃO NORMAL (bloco buttons) ===
  const btnIdx = Number(parts[2]);
  if (!Number.isFinite(btnIdx)) return;
  emitAnalytics(conv.botId, conv.funnelId, conv.chatId, nodeId, "buttons", "click", { btnIdx });

  const next = abrirSaida(g, nodeId, `btn_${btnIdx}`, vars);
  if (!next) {
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: { status: "done", pendingTxId: null, pendingPollId: null, pendingInputNodeId: null, currentNodeId: null, navHistory: [] },
    });
    return;
  }
  // Este bloco passa a ser o "anterior" do próximo passo. `slice(-MAX)` corta
  // pela frente: num funil circular (menu → item → menu) a trilha cresceria
  // pra sempre e cada mensagem carregaria uma linha de histórico inútil.
  const forward = [...history, nodeId].slice(-NAV_HISTORY_MAX);
  const ctx: ExecCtx = {
    token: bot.botToken,
    botId: bot.id,
    userId: bot.userId,
    funnelId: conv.funnelId,
    g,
    chatId: conv.chatId,
    fromName: conv.customerName ?? "Cliente",
    variables: vars,
    navHistory: forward,
  };
  const state = await executeFrom(ctx, next.id);
  await prisma.botConversation.update({
    where: { id: conv.id },
    data: {
      status: state.status,
      currentNodeId: state.currentNodeId,
      pendingTxId: state.pendingTxId,
      pendingPollId: state.pendingPollId,
      pendingInputNodeId: state.pendingInputNodeId,
      variables: state.variables as object,
      scheduledResumeAt: state.scheduledResumeAt,
      scheduledResumeNodeId: state.scheduledResumeNodeId,
      navHistory: forward,
    },
  });
}

export async function advanceBotConversationOnPollAnswer(
  pollId: string,
  optionIds: number[],
): Promise<void> {
  if (!pollId) return;
  const conv = await prisma.botConversation.findFirst({
    where: { pendingPollId: pollId },
    select: { id: true, botId: true, chatId: true, funnelId: true, currentNodeId: true, customerName: true, variables: true, navHistory: true },
  });
  if (!conv || !conv.currentNodeId) return;
  const bot = await prisma.saleBot.findUnique({
    where: { id: conv.botId },
    select: { id: true, userId: true, botToken: true, active: true, funnelRuntimeEnabled: true },
  });
  if (!bot || !bot.botToken || !bot.active || !bot.funnelRuntimeEnabled) return;
  const funnel = await prisma.funnel.findUnique({ where: { id: conv.funnelId }, select: { graph: true } });
  const g = funnel ? parseGraph(funnel.graph) : null;
  if (!g) return;

  const pick = Number(optionIds[0]);
  if (!Number.isFinite(pick)) return;
  emitAnalytics(conv.botId, conv.funnelId, conv.chatId, conv.currentNodeId, "poll", "answer", { pick });
  const vars = (conv.variables as Record<string, unknown> | null) ?? {};
  const next = abrirSaida(g, conv.currentNodeId, `poll_${pick}`, vars);
  if (!next) {
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: { status: "done", pendingTxId: null, pendingPollId: null, pendingInputNodeId: null, currentNodeId: null },
    });
    return;
  }
  const ctx: ExecCtx = {
    token: bot.botToken,
    botId: bot.id,
    userId: bot.userId,
    funnelId: conv.funnelId,
    g,
    chatId: conv.chatId,
    fromName: conv.customerName ?? "Cliente",
    variables: vars,
    // Trilha segue adiante: se a enquete desembocar num bloco `buttons`, o
    // "Voltar" continua apontando pro último menu que o cliente viu.
    navHistory: conv.navHistory ?? [],
  };
  const state = await executeFrom(ctx, next.id);
  await prisma.botConversation.update({
    where: { id: conv.id },
    data: {
      status: state.status,
      currentNodeId: state.currentNodeId,
      pendingTxId: state.pendingTxId,
      pendingPollId: state.pendingPollId,
      pendingInputNodeId: state.pendingInputNodeId,
      variables: state.variables as object,
      scheduledResumeAt: state.scheduledResumeAt,
      scheduledResumeNodeId: state.scheduledResumeNodeId,
    },
  });
}

/**
 * 22/07/2026 fase 2: cliente respondeu texto num bloco `input`. Captura a
 * resposta, salva em variables[`resposta_${varName}`] e continua o funil.
 */
export async function advanceBotConversationOnInput(
  botId: string,
  chatId: string | number,
  text: string,
): Promise<boolean> {
  const chatIdStr = String(chatId);
  const conv = await prisma.botConversation.findUnique({
    where: { botId_chatId: { botId, chatId: chatIdStr } },
    select: {
      id: true, botId: true, chatId: true, funnelId: true,
      currentNodeId: true, pendingInputNodeId: true, status: true,
      customerName: true, variables: true, navHistory: true,
    },
  });
  if (!conv) return false;

  /**
   * 29/07/2026: o cliente voltou a falar — cancela o reengajamento.
   *
   * Sem isso, quem estava no ciclo do bloco `reengage` e respondia "oi"
   * continuava recebendo "ainda tá aí?" de 6 em 6 horas, porque texto livre
   * sem bloco `input` pendente saía daqui sem tocar no estado. Clique e
   * pagamento já cancelavam (ambos sobrescrevem scheduledResumeAt); texto era
   * o único buraco. Achado pelo probe-funnel-reengage.
   *
   * Não responde nada de propósito: o funil de bot não reage a texto livre
   * pra não entrar em loop de "não entendi".
   */
  if (conv.status === "sleeping") {
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: { status: "active", scheduledResumeAt: null, scheduledResumeNodeId: null },
    });
    return false;
  }

  if (conv.status !== "waiting_input" || !conv.pendingInputNodeId) return false;
  const bot = await prisma.saleBot.findUnique({
    where: { id: conv.botId },
    select: { id: true, userId: true, botToken: true, active: true, funnelRuntimeEnabled: true },
  });
  if (!bot || !bot.botToken || !bot.active || !bot.funnelRuntimeEnabled) return false;
  const funnel = await prisma.funnel.findUnique({ where: { id: conv.funnelId }, select: { graph: true } });
  const g = funnel ? parseGraph(funnel.graph) : null;
  if (!g) return false;
  const inputNode = g.nodes.find((n) => n.id === conv.pendingInputNodeId);
  if (!inputNode) return false;

  const d = (inputNode.data as Record<string, unknown>) ?? {};
  const vars = ((conv.variables as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

  /**
   * 30/07/2026: bloco `inactivity` também pausa em waiting_input, mas o
   * pendingInputNodeId aponta pra um node de tipo `inactivity` — nele NÃO
   * capturamos variável, NÃO ramificamos por keyword. Cliente falou qualquer
   * coisa → sai por `next` (bolinha "respondeu"). O scheduledResumeAt é
   * limpo automático pelo update final via state.scheduledResumeAt.
   */
  if (inputNode.type === "inactivity") {
    emitAnalytics(conv.botId, conv.funnelId, conv.chatId, inputNode.id, "inactivity", "answer");
    const nextN = abrirSaida(g, inputNode.id, "next", vars);
    if (!nextN) {
      await prisma.botConversation.update({
        where: { id: conv.id },
        data: {
          status: "done",
          pendingInputNodeId: null,
          currentNodeId: null,
          scheduledResumeAt: null,
          scheduledResumeNodeId: null,
        },
      });
      return true;
    }
    const ctxInact: ExecCtx = {
      token: bot.botToken,
      botId: bot.id,
      userId: bot.userId,
      funnelId: conv.funnelId,
      g,
      chatId: conv.chatId,
      fromName: conv.customerName ?? "Cliente",
      variables: vars,
      navHistory: conv.navHistory ?? [],
    };
    const state = await executeFrom(ctxInact, nextN.id);
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: {
        status: state.status,
        currentNodeId: state.currentNodeId,
        pendingTxId: state.pendingTxId,
        pendingPollId: state.pendingPollId,
        pendingInputNodeId: state.pendingInputNodeId,
        variables: state.variables as object,
        scheduledResumeAt: state.scheduledResumeAt,
        scheduledResumeNodeId: state.scheduledResumeNodeId,
      },
    });
    return true;
  }

  const varName = String(d.varName ?? "resposta_1").trim() || "resposta_1";
  const captured = text.trim().slice(0, 500);
  vars[varName] = captured;

  emitAnalytics(conv.botId, conv.funnelId, conv.chatId, inputNode.id, "input", "answer", {
    length: captured.length,
  });

  // Branch por palavra-chave (opcional)
  let nextN: GNode | null = null;
  const keywords = Array.isArray(d.keywords) ? (d.keywords as unknown[]) : [];
  const captLower = captured.toLowerCase();
  for (let i = 0; i < keywords.length && i < 5; i++) {
    const kw = String((keywords[i] as { word?: string })?.word ?? "").trim().toLowerCase();
    if (kw && captLower.includes(kw)) {
      nextN = abrirSaida(g, inputNode.id, `kw_${i}`, vars);
      if (nextN) break;
    }
  }
  if (!nextN) nextN = abrirSaida(g, inputNode.id, "next", vars);
  if (!nextN) {
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: {
        status: "done",
        pendingInputNodeId: null,
        currentNodeId: null,
        variables: vars as object,
      },
    });
    return true;
  }

  const ctx: ExecCtx = {
    token: bot.botToken,
    botId: bot.id,
    userId: bot.userId,
    funnelId: conv.funnelId,
    g,
    chatId: conv.chatId,
    fromName: conv.customerName ?? "Cliente",
    variables: vars,
    // Trilha segue adiante: se a resposta livre desembocar num bloco
    // `buttons`, o "Voltar" ainda aponta pro último menu que o cliente viu.
    navHistory: conv.navHistory ?? [],
  };
  const state = await executeFrom(ctx, nextN.id);
  await prisma.botConversation.update({
    where: { id: conv.id },
    data: {
      status: state.status,
      currentNodeId: state.currentNodeId,
      pendingTxId: state.pendingTxId,
      pendingPollId: state.pendingPollId,
      pendingInputNodeId: state.pendingInputNodeId,
      variables: state.variables as object,
      scheduledResumeAt: state.scheduledResumeAt,
      scheduledResumeNodeId: state.scheduledResumeNodeId,
    },
  });
  return true;
}

/**
 * 22/07/2026 fase 2: cron resume — processa conversas com scheduledResumeAt
 * vencido (bloco `reengage`). Retorna quantas foram acordadas.
 *
 * 29/07/2026: o `reengage` agenda o resume pro PRÓPRIO nó, então a mesma
 * conversa passa por aqui uma vez a cada intervalo até a sequência acabar.
 */
export async function resumeScheduledConversations(): Promise<{ resumed: number; failed: number }> {
  const now = new Date();
  /**
   * 30/07/2026: query passou a incluir `waiting_input` — bloco input com
   * `inactivityMinutes` também agenda scheduledResumeAt. Se o cliente
   * respondeu, o advance sobrescreveu com null e essa conversa não aparece.
   * Se acordou primeiro, roteia pela bolinha `inactive` do bloco.
   */
  /**
   * 01/08/2026: entrou `waiting_payment`. O bloco de pagamento agora agenda
   * o próprio despertar, porque o ramo "não pagou" dependia de um webhook de
   * expiração que nenhuma adquirente manda (ver unpaidDeadline).
   *
   * As ~310 conversas que já estavam presas em waiting_payment quando isso
   * subiu NÃO entram aqui: elas têm scheduledResumeAt/NodeId = null, e o
   * filtro exige os dois preenchidos. Isso é de propósito — varrer o
   * acumulado dispararia a sequência de recuperação de uma vez pra centenas
   * de clientes reais, alguns parados há 11 dias. Vale só daqui pra frente.
   */
  const due = await prisma.botConversation.findMany({
    where: {
      status: { in: ["sleeping", "waiting_input", "waiting_payment"] },
      scheduledResumeAt: { lte: now },
      scheduledResumeNodeId: { not: null },
    },
    select: {
      id: true, botId: true, chatId: true, funnelId: true, status: true,
      scheduledResumeNodeId: true, customerName: true, variables: true,
      pendingTxId: true,
    },
    take: 100,
    orderBy: { scheduledResumeAt: "asc" },
  });
  let resumed = 0;
  let failed = 0;
  for (const conv of due) {
    try {
      const bot = await prisma.saleBot.findUnique({
        where: { id: conv.botId },
        select: { id: true, userId: true, botToken: true, active: true, funnelRuntimeEnabled: true },
      });
      if (!bot || !bot.botToken || !bot.active || !bot.funnelRuntimeEnabled) {
        await prisma.botConversation.update({
          where: { id: conv.id },
          data: { status: "done", scheduledResumeAt: null, scheduledResumeNodeId: null },
        });
        continue;
      }
      const funnel = await prisma.funnel.findUnique({
        where: { id: conv.funnelId },
        select: { graph: true },
      });
      const g = funnel ? parseGraph(funnel.graph) : null;
      if (!g || !conv.scheduledResumeNodeId) {
        await prisma.botConversation.update({
          where: { id: conv.id },
          data: { status: "done", scheduledResumeAt: null, scheduledResumeNodeId: null },
        });
        continue;
      }
      const vars = (conv.variables as Record<string, unknown> | null) ?? {};
      const ctx: ExecCtx = {
        token: bot.botToken,
        botId: bot.id,
        userId: bot.userId,
        funnelId: conv.funnelId,
        g,
        chatId: conv.chatId,
        fromName: conv.customerName ?? "Cliente",
        variables: vars,
      };

      /**
       * Bifurcação por status:
       *   - sleeping        → reexecuta o próprio nó (reengage repete a si)
       *   - waiting_input   → timeout de inatividade: sai pela bolinha
       *                       `inactive` do bloco. 30/07/2026 (tarde): só
       *                       nós do tipo `inactivity` chegam aqui — o
       *                       `input` não agenda scheduledResumeAt mais.
       *                       Sem fio, marca `done`.
       *   - waiting_payment → prazo do PIX estourou: confere se pagou e,
       *                       se não, sai pela bolinha "não pagou"
       *                       (`downsell`). 01/08/2026, ver unpaidDeadline.
       */
      let state: RunState;
      if (conv.status === "waiting_payment") {
        const payNodeId = conv.scheduledResumeNodeId;
        /**
         * Última conferência antes de assumir que não pagou. Pode ter pago
         * nos segundos entre o deadline e o cron, ou o webhook do PAID pode
         * ter falhado — em qualquer um dos casos quem entrega é o fluxo do
         * `upsell`, então aqui a gente só desliga o despertador e sai.
         */
        if (conv.pendingTxId) {
          const tx = await prisma.transaction.findUnique({
            where: { id: conv.pendingTxId },
            select: { status: true },
          });
          if (tx && tx.status !== "PENDING" && tx.status !== "EXPIRED") {
            await prisma.botConversation.update({
              where: { id: conv.id },
              data: { scheduledResumeAt: null, scheduledResumeNodeId: null },
            });
            continue;
          }
        }
        const unpaidNext = abrirSaida(g, payNodeId, "downsell", vars);
        if (!unpaidNext) {
          /**
           * Sem fio no "não pagou": NÃO marca done. A conversa segue em
           * waiting_payment e, se o cliente pagar depois, o webhook do PAID
           * entrega normal. Só para de acordar à toa.
           */
          emitAnalytics(conv.botId, conv.funnelId, conv.chatId, payNodeId, "payment", "stop", { reason: "unpaid_no_route" });
          await prisma.botConversation.update({
            where: { id: conv.id },
            data: { scheduledResumeAt: null, scheduledResumeNodeId: null },
          });
          resumed++;
          continue;
        }
        emitAnalytics(conv.botId, conv.funnelId, conv.chatId, payNodeId, "payment", "stop", { reason: "unpaid_timeout" });
        // Deixa migalha pro caso de pagar depois (ver PAY_NODE_VAR).
        vars[PAY_NODE_VAR] = payNodeId;
        state = await executeFrom(ctx, unpaidNext.id);
      } else if (conv.status === "waiting_input") {
        const scheduledNode = g.nodes.find((n) => n.id === conv.scheduledResumeNodeId);
        if (!scheduledNode || scheduledNode.type !== "inactivity") {
          // Defensivo: input sem timeout que por algum motivo veio parar aqui.
          // Marca done e limpa — nunca deveria acontecer, mas se acontecer
          // pelo menos não fica preso pra sempre.
          await prisma.botConversation.update({
            where: { id: conv.id },
            data: {
              status: "done", pendingInputNodeId: null, pendingTxId: null,
              pendingPollId: null, currentNodeId: null,
              scheduledResumeAt: null, scheduledResumeNodeId: null,
            },
          });
          resumed++;
          continue;
        }
        const inactiveNext = abrirSaida(g, conv.scheduledResumeNodeId, "inactive", vars);
        if (!inactiveNext) {
          emitAnalytics(conv.botId, conv.funnelId, conv.chatId, conv.scheduledResumeNodeId, "inactivity", "stop", { reason: "inactive_no_route" });
          await prisma.botConversation.update({
            where: { id: conv.id },
            data: {
              status: "done", pendingInputNodeId: null, pendingTxId: null,
              pendingPollId: null, currentNodeId: null,
              scheduledResumeAt: null, scheduledResumeNodeId: null,
            },
          });
          resumed++;
          continue;
        }
        emitAnalytics(conv.botId, conv.funnelId, conv.chatId, conv.scheduledResumeNodeId, "inactivity", "stop", { reason: "inactive_timeout" });
        state = await executeFrom(ctx, inactiveNext.id);
      } else {
        state = await executeFrom(ctx, conv.scheduledResumeNodeId);
      }

      await prisma.botConversation.update({
        where: { id: conv.id },
        data: {
          status: state.status,
          currentNodeId: state.currentNodeId,
          pendingTxId: state.pendingTxId,
          pendingPollId: state.pendingPollId,
          pendingInputNodeId: state.pendingInputNodeId,
          variables: state.variables as object,
          scheduledResumeAt: state.scheduledResumeAt,
          scheduledResumeNodeId: state.scheduledResumeNodeId,
        },
      });
      resumed++;
    } catch (e) {
      console.warn("[bot-funnel-resume] falha em conv", conv.id, e);
      failed++;
    }
  }
  return { resumed, failed };
}

/** Apenas ACK do callback (do webhook), pra parar o loading spinner. */
export async function ackTelegramCallback(
  token: string,
  callbackQueryId: string,
): Promise<void> {
  return tgAnswerCallback(token, callbackQueryId);
}
