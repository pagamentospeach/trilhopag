"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus,
  MessageCircle,
  Package,
  Power,
  Trash2,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Search,
  Zap,
  Image as ImageIcon,
  Video,
  Music,
  Sparkles,
  Clock,
  Upload,
  X,
  MousePointerClick,
  ListChecks,
  MapPin,
  Shuffle,
  Play,
  Library,
  Send,
  RotateCcw,
  CreditCard,
  Link2,
  ExternalLink,
  Timer,
  MessageSquareText,
  Ticket,
  GitBranch,
  Users,
  Flame,
  Hash,
  Gift,
  Repeat,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import { saveFunnelGraph, activateFunnel, setBotFunnelRuntime } from "../../../produtos/funil/actions";
import {
  listMediaAssets,
  deleteMediaAsset,
  registerMediaAsset,
} from "./media-actions";
import type { BotFunnelLoaderProps, BotFunnelProduct, BotFunnelCheckout } from "./bot-funnel-loader";

const NEXT = "#a1a1aa";
const PAID = "#06b6d4";
const UNPAID = "#fb923c";
// Cores dos handles indexados (buttons/poll/random)
const BTN_COLOR = "#38bdf8"; // sky-400
const POLL_COLOR = "#f472b6"; // pink-400
const RAND_COLORS = ["#a78bfa", "#22d3ee", "#f59e0b"]; // violet, cyan, amber

type MsgData = { text: string };
type ProdData = { productId: string; name: string; image: string | null; price: number };

/* ------------------------------- nodes ---------------------------------- */

function MessageNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as MsgData;
  const { updateNodeData } = useReactFlow();
  return (
    <div
      className={cn(
        "w-[250px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-sky-400/80 ring-2 ring-sky-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-sky-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
        <MessageCircle className="size-3.5" /> Mensagem
      </div>
      <div className="p-2.5">
        <textarea
          value={d.text}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="Texto que o bot envia… use {{nome}}, {{hora}}, {{saudacao}}"
          rows={3}
          className="nodrag w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

function BotProductNode({ data, selected }: NodeProps) {
  const d = data as unknown as ProdData;
  return (
    <div
      className={cn(
        "relative w-[240px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-cyan-400/80 ring-2 ring-cyan-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-cyan-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
        <Package className="size-3.5" /> Oferta · gera PIX
      </div>
      <div className="flex items-center gap-3 p-3">
        {d.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.image} alt="" loading="lazy" decoding="async" className="size-10 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.06] shrink-0">
            <Package className="size-4 text-zinc-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{d.name}</p>
          <p className="text-xs text-zinc-400">{formatBRL(d.price)}</p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="upsell"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: PAID }}
      />
      <span
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+10px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
        style={{ background: `${PAID}22`, color: PAID }}
      >
        pagou
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        id="downsell"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: UNPAID }}
      />
      <span
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+8px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
        style={{ background: `${UNPAID}22`, color: UNPAID }}
      >
        não pagou
      </span>
    </div>
  );
}

/* -------------------- media nodes (image / video / audio / gif) -------------------- */

type MediaData = {
  url: string;
  caption: string;
  filename?: string;
  /**
   * Manda este bloco junto com o próximo, numa mensagem só (álbum do
   * Telegram). 01/08/2026 — ver `coletarAlbum` no bot-funnel-runtime.
   * Só imagem e vídeo: a API não deixa áudio/GIF no mesmo grupo.
   */
  groupWithNext?: boolean;
  /**
   * Só no bloco de áudio. Falso/ausente = mensagem de voz (a ondinha).
   * Verdadeiro = faixa de música (cartão com título e duração).
   * 01/08/2026 — davi mandou print do cartão mostrando a chave do Blob.
   */
  asMusic?: boolean;
  /** Título do cartão no modo música. Vazio = usa o nome do arquivo. */
  audioTitle?: string;
};
type DelayData = { seconds: number; action: "typing" | "record_voice" };

/** Teto do Telegram por álbum. Acima disso a API recusa a mensagem. */
const ALBUM_MAX = 10;

/**
 * Onde este bloco está na corrente do álbum: "2/4" (2º de 4 itens), ou ""
 * se ele não faz parte de nenhum grupo.
 *
 * Anda pra TRÁS até achar a cabeça da corrente e depois conta pra frente,
 * com as mesmas quebras do runtime (bloco sem a opção, bloco que não é
 * mídia, bolinha com dois fios, 10 itens, loop). O seller precisa ver isso
 * no bloco do meio também — senão marca "agrupar" em três blocos e não tem
 * como saber se o Telegram vai mandar um álbum de 3 ou dois de 2.
 *
 * Devolve string (e não objeto) de propósito: o useStore compara com
 * Object.is, e objeto novo a cada render re-renderizaria o nó a cada
 * mexida no canvas.
 */
function useAlbumPos(id: string): string {
  return useStore(
    useCallback(
      (s) => {
        const dataDe = (n?: { data?: unknown }) =>
          ((n?.data ?? {}) as Record<string, unknown>);
        const ehMidia = (n?: { type?: string }) =>
          n?.type === "image" || n?.type === "video";
        const temArquivo = (n?: { data?: unknown }) =>
          String(dataDe(n).url ?? "").trim() !== "";
        const agrupa = (n?: { data?: unknown }) => dataDe(n).groupWithNext === true;
        /** Destino único pela bolinha "próximo", e só se for mídia válida. */
        const unicoProx = (nid: string) => {
          const outs = s.edges.filter(
            (e) => e.source === nid && (e.sourceHandle ?? "next") === "next",
          );
          if (outs.length !== 1) return null;
          const n = s.nodeLookup.get(outs[0].target);
          return n && ehMidia(n) && temArquivo(n) ? n : null;
        };

        const eu = s.nodeLookup.get(id);
        if (!ehMidia(eu)) return "";

        // 1. sobe até a cabeça
        let cabeca = eu!;
        const vistos = new Set<string>([cabeca.id]);
        for (let i = 0; i < ALBUM_MAX; i++) {
          const ins = s.edges.filter(
            (e) => e.target === cabeca.id && (e.sourceHandle ?? "next") === "next",
          );
          if (ins.length !== 1) break;
          const pai = s.nodeLookup.get(ins[0].source);
          if (!pai || vistos.has(pai.id)) break;
          if (!ehMidia(pai) || !agrupa(pai) || !temArquivo(pai)) break;
          if (unicoProx(pai.id)?.id !== cabeca.id) break;
          vistos.add(pai.id);
          cabeca = pai;
        }

        // 2. desce contando
        const corrente = [cabeca.id];
        let atual = cabeca;
        while (corrente.length < ALBUM_MAX && agrupa(atual)) {
          const prox = unicoProx(atual.id);
          if (!prox || corrente.includes(prox.id)) break;
          corrente.push(prox.id);
          atual = prox;
        }
        if (corrente.length < 2) return "";
        const pos = corrente.indexOf(id);
        return pos < 0 ? "" : `${pos + 1}/${corrente.length}`;
      },
      [id],
    ),
  );
}

/**
 * 22/07/2026 (davi: "Nao po, eu quero que os sellers consigam upar um video
 * no bot de telegram da trilho"). Upload DIRETO pro Vercel Blob (bypass do
 * limite 4.5MB do serverless).
 *
 * Fluxo antigo (fetch POST → /api/dashboard/upload):
 *   Browser → Vercel Function → Blob storage
 *   Limite: 4.5MB (limite hard do body function na Vercel)
 *
 * Fluxo novo (@vercel/blob/client upload):
 *   Browser → /api/dashboard/upload-client-token (só token, minusculo)
 *   Browser → Blob storage direto (multipart chunked)
 *   Limite: 500MB — permite videos HOT 4K de duração normal
 *
 * 24/07/2026 (davi: "O video fica carregando infinitamente") — 3 correções:
 *  1. A rota do token não usa mais `onUploadCompleted`. Com ele, o upload só
 *     era dado como concluído depois de um callback server-to-server do Blob
 *     de volta pro deployment; se esse callback não fechava, o `upload()`
 *     nunca resolvia. (Mesmo bug já documentado em /api/bturb/upload.)
 *  2. Pathname único gerado AQUI. O SDK assina o pathname que o cliente
 *     manda — o `users/<id>/` que a rota devolvia era descartado, então todo
 *     mundo subia na raiz com o nome original e colidia entre si.
 *  3. Watchdog: se ficar STALL_MS sem nenhum progresso, aborta com erro
 *     legível em vez de girar pra sempre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 26/07/2026 (davi: "Aind ta carregando infinitamente!!! / ta dando erro de
 * 90s"). O watchdog disparando prova que o browser passou 90s sem UM BYTE de
 * progresso — o SDK nem conseguia falar com a API do Blob.
 *
 * Tudo do lado servidor foi descartado com prova: `scripts/probe-client-
 * upload.mjs` sobe 12MB multipart com o MESMO client token e o MESMO módulo
 * /client; o preflight OPTIONS de vercel.com/api/blob libera todos os
 * `x-mpu-*` / `x-api-*` que o SDK manda; a CSP com vercel.com está no ar;
 * public/sw.js não tem handler de fetch. Sobra ambiente do browser do seller
 * (documento com CSP velha em cache, extensão/adblock, proxy corporativo) —
 * nada disso é corrigível daqui.
 *
 * Como não dá pra consertar o ambiente dele, o que dá é ter um caminho que
 * não dependa de alcançar `vercel.com`: `uploadViaChunks` manda o arquivo em
 * pedaços same-origin e o servidor emenda (`/api/dashboard/upload-chunk`).
 *
 * Espelhar a API do Blob num rewrite `/_blob` foi tentado e É IMPOSSÍVEL —
 * o porquê medido está no comentário em next.config.ts. Resumo: teto de
 * 4.5MB por request contra mínimo de 5MB por parte do multipart.
 *
 * Cascata: direto (rápido, funciona pra maioria) → pedaços same-origin
 * (mais lento, mas não depende de host externo) → rota server-side legada.
 * E o erro devolvido agora é o erro REAL do SDK + qualquer violação de CSP
 * capturada, em vez do texto genérico de timeout que escondia a causa.
 */
const UPLOAD_STALL_MS = 20_000; // 20s sem 1 byte de progresso = cai pro plano B

/**
 * Memória do caminho direto, por browser.
 *
 * Quem não alcança `vercel.com` (CSP velha em cache, adblock, proxy
 * corporativo) NUNCA vai conseguir o upload direto — e sem isto pagaria os
 * 20s de espera do plano A em TODO upload, pra sempre. Depois da primeira
 * falha o browser passa a ir direto pros pedaços.
 *
 * Expira em 7 dias porque a causa costuma ser passageira: cache de CSP
 * vence, o seller desliga a extensão, sai do wifi do escritório. Aí o
 * caminho rápido é reavaliado sozinho, sem precisar de suporte.
 */
const DIRECT_BLOCKED_KEY = "tp_blob_direto_bloqueado_ate";
const DIRECT_BLOCKED_MS = 7 * 24 * 60 * 60 * 1000;

function isDirectBlocked(): boolean {
  try {
    const until = Number(localStorage.getItem(DIRECT_BLOCKED_KEY) || 0);
    if (!until) return false;
    if (Date.now() > until) {
      localStorage.removeItem(DIRECT_BLOCKED_KEY);
      return false;
    }
    return true;
  } catch {
    return false; // localStorage bloqueado (anônima/cookies off) — tenta normal
  }
}

function markDirect(worked: boolean): void {
  try {
    if (worked) localStorage.removeItem(DIRECT_BLOCKED_KEY);
    else localStorage.setItem(DIRECT_BLOCKED_KEY, String(Date.now() + DIRECT_BLOCKED_MS));
  } catch {
    /* sem localStorage: só perde a otimização, o upload segue igual */
  }
}

function buildUploadPathname(file: File): string {
  const dot = file.name.lastIndexOf(".");
  const ext =
    dot > 0
      ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)
      : "";
  const base =
    (dot > 0 ? file.name.slice(0, dot) : file.name)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 60) || "arquivo";
  const rand = Math.random().toString(36).slice(2, 10);
  return `bot-funnel/${Date.now()}-${rand}-${base}${ext ? `.${ext}` : ""}`;
}

/**
 * === ÁUDIO → OGG/Opus, no navegador, antes de subir ===
 *
 * O Telegram só desenha a ondinha de mensagem de voz quando o arquivo é
 * OGG/Opus. Com MP3 ele responde 200 pro `sendVoice` e mesmo assim
 * REBAIXA pra cartão de música, usando o nome do arquivo da URL como
 * título — que no nosso caso é a chave do Blob. Foi o print que o davi
 * mandou em 01/08 e de novo em 06/08/2026.
 *
 * Como não dá pra rodar ffmpeg na serverless da Vercel, a conversão
 * acontece aqui, com o ffmpeg.wasm que já está self-hosted em
 * /public/ffmpeg (o mesmo do Vídeo Camuflagem — ver o cabeçalho de
 * video-camuflagem/client.tsx pro histórico de por que TUDO precisa ser
 * same-origin).
 *
 * Se qualquer coisa der errado (wasm não carrega, seller num 3G ruim,
 * arquivo estranho), a gente sobe o original mesmo: o runtime detecta o
 * rebaixamento e manda um cartão COM TÍTULO. Pior visual, zero quebra.
 */
let ffmpegVoz: Promise<FfmpegWasm> | null = null;

type FfmpegWasm = {
  load: (o: { coreURL: string; wasmURL: string }) => Promise<boolean>;
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<void>;
  exec: (args: string[]) => Promise<number>;
  on: (ev: string, cb: (e: { progress?: number }) => void) => void;
};

function carregarFfmpeg(): Promise<FfmpegWasm> {
  if (ffmpegVoz) return ffmpegVoz;
  ffmpegVoz = (async () => {
    const V = "v6"; // mesmo cache-bust do video-camuflagem
    const w = window as unknown as { FFmpegWASM?: { FFmpeg: new () => FfmpegWasm } };
    if (!w.FFmpegWASM) {
      await new Promise<void>((resolve, reject) => {
        const existente = document.querySelector<HTMLScriptElement>('script[data-ffmpeg-lib="1"]');
        if (existente) {
          if (w.FFmpegWASM) return resolve();
          existente.addEventListener("load", () => resolve());
          existente.addEventListener("error", () => reject(new Error("ffmpeg.js falhou")));
          return;
        }
        const s = document.createElement("script");
        s.src = `/ffmpeg/ffmpeg.js?${V}`;
        s.dataset.ffmpegLib = "1";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("ffmpeg.js falhou"));
        document.head.appendChild(s);
      });
    }
    if (!w.FFmpegWASM) throw new Error("window.FFmpegWASM undefined");
    const ff = new w.FFmpegWASM.FFmpeg();
    await ff.load({ coreURL: `/ffmpeg/ffmpeg-core.js?${V}`, wasmURL: `/ffmpeg/ffmpeg-core.wasm?${V}` });
    return ff;
  })();
  // Uma falha não pode envenenar as próximas tentativas.
  ffmpegVoz.catch(() => { ffmpegVoz = null; });
  return ffmpegVoz;
}

/** Já é voz-friendly? Aí não gasta 32MB de wasm à toa. */
function jaEhVoz(f: File): boolean {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "ogg" || ext === "oga" || ext === "opus" || f.type === "audio/ogg";
}

/**
 * Mesmos parâmetros do `scripts/backfill-audio-ogg.mts`, pra um áudio
 * subido hoje ficar idêntico a um que foi convertido no backfill:
 * mono, 48kHz, Opus 32kbps, perfil `voip`, sem metadados.
 */
async function converterParaVoz(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  if (jaEhVoz(file)) return file;
  try {
    const ff = await carregarFfmpeg();
    ff.on("progress", (e) => {
      if (typeof e.progress === "number") onProgress?.(Math.round(Math.min(e.progress, 1) * 100));
    });
    const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
    const entrada = `voz-in.${ext || "mp3"}`;
    const saida = "voz-out.ogg";
    await ff.writeFile(entrada, new Uint8Array(await file.arrayBuffer()));
    await ff.exec([
      "-i", entrada,
      "-vn", "-map_metadata", "-1",
      "-c:a", "libopus", "-b:a", "32k", "-ac", "1", "-ar", "48000",
      "-application", "voip",
      saida,
    ]);
    const out = await ff.readFile(saida);
    await ff.deleteFile(entrada).catch(() => {});
    await ff.deleteFile(saida).catch(() => {});
    if (!out?.length) throw new Error("saída vazia");
    // Nome fixo: o Telegram nem mostra em voz, e o nome original continua
    // guardado no nó (campo `filename`) pra aparecer no builder.
    return new File([new Uint8Array(out)], "audio.ogg", { type: "audio/ogg" });
  } catch (e) {
    console.warn("[converterParaVoz] falhou, subindo o original:", e);
    return file;
  }
}

async function uploadMedia(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  // 1) Direto pro Blob: rápido e é o que funciona pra maioria dos sellers.
  //    Pulado se este browser já provou que não alcança o host externo —
  //    senão seriam 20s jogados fora em cada upload.
  let direct: { ok: boolean; url?: string; error?: string };
  if (isDirectBlocked()) {
    direct = { ok: false, error: "caminho direto marcado como bloqueado neste navegador" };
  } else {
    direct = await uploadDirectToBlob(file, onProgress);
    markDirect(direct.ok);
    if (direct.ok) return direct;
  }

  // 2) Pedaços same-origin. Mais lento (passa pelo nosso servidor), mas não
  //    depende do browser alcançar `vercel.com` — é o caminho que salva quem
  //    tem CSP velha em cache, adblock ou proxy corporativo no caminho.
  console.warn("[uploadMedia] direto falhou, indo de pedaços:", direct.error);
  onProgress?.(0);
  const chunked = await uploadViaChunks(file, onProgress);
  if (chunked.ok) return chunked;

  // 3) Rota server-side antiga: um POST só. Só cabe abaixo do teto de 4.5MB
  //    de body da Function, então é último recurso pra arquivo pequeno.
  console.warn("[uploadMedia] pedaços falharam:", chunked.error);
  if (file.size <= 4 * 1024 * 1024) {
    onProgress?.(0);
    const legacy = await uploadViaServer(file);
    if (legacy.ok) return legacy;
    return { ok: false, error: `${direct.error} | server: ${legacy.error}` };
  }
  return { ok: false, error: `${direct.error} | pedaços: ${chunked.error}` };
}

/**
 * Upload em pedaços, 100% same-origin. Cada pedaço fica abaixo do teto de
 * 4.5MB de body da Vercel e o servidor emenda tudo no fim — ver o cabeçalho
 * de src/app/api/dashboard/upload-chunk/route.ts pro porquê de não dar pra
 * usar multipart aqui.
 */
async function uploadViaChunks(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const initRes = await fetch("/api/dashboard/upload-chunk?action=init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "",
        size: file.size,
      }),
    });
    const init = (await initRes.json().catch(() => ({}))) as {
      ticket?: string;
      partSize?: number;
      message?: string;
      error?: string;
    };
    if (!initRes.ok || !init.ticket) {
      return { ok: false, error: init.message || init.error || `init HTTP ${initRes.status}` };
    }

    const partSize = Math.min(init.partSize || 3.5 * 1024 * 1024, 4 * 1024 * 1024);
    const total = Math.ceil(file.size / partSize);
    const urls: string[] = [];

    for (let i = 0; i < total; i++) {
      const slice = file.slice(i * partSize, Math.min((i + 1) * partSize, file.size));

      // Retry por pedaço: numa rede ruim é normal um POST cair, e refazer só
      // ~3.5MB é muito melhor do que reiniciar o arquivo inteiro. O servidor
      // grava por índice com overwrite, então repetir não duplica nada.
      let url: string | null = null;
      let lastErr = "";
      for (let attempt = 0; attempt < 3 && !url; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
        try {
          const res = await fetch(`/api/dashboard/upload-chunk?action=part&n=${i}`, {
            method: "POST",
            headers: {
              "x-upload-ticket": init.ticket,
              "content-type": "application/octet-stream",
            },
            body: slice,
          });
          const j = (await res.json().catch(() => ({}))) as {
            url?: string;
            message?: string;
            error?: string;
          };
          if (res.ok && j.url) url = j.url;
          else lastErr = j.message || j.error || `HTTP ${res.status}`;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : "erro de rede";
        }
      }
      if (!url) return { ok: false, error: `pedaço ${i + 1}/${total}: ${lastErr}` };

      urls.push(url);
      // Deixa os últimos 5% pra emenda no servidor, que não tem progresso.
      onProgress?.(Math.round(((i + 1) / total) * 95));
    }

    const finRes = await fetch("/api/dashboard/upload-chunk?action=finish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: init.ticket, urls }),
    });
    const fin = (await finRes.json().catch(() => ({}))) as {
      url?: string;
      message?: string;
      error?: string;
    };
    if (!finRes.ok || !fin.url) {
      return { ok: false, error: fin.message || fin.error || `finish HTTP ${finRes.status}` };
    }

    onProgress?.(100);
    return { ok: true, url: fin.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "chunk_failed" };
  }
}

async function uploadDirectToBlob(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const controller = new AbortController();
  let lastTick = Date.now();
  let sawProgress = false;

  // Se a CSP barrar, o fetch morre com um TypeError genérico ("Failed to
  // fetch") e o SDK trata como erro de rede → entra em retry com backoff e a
  // UI fica girando. O evento abaixo é a ÚNICA forma de saber que foi a CSP.
  const cspHits: string[] = [];
  const onCspViolation = (ev: SecurityPolicyViolationEvent) => {
    if (cspHits.length < 3) {
      cspHits.push(`${ev.violatedDirective} bloqueou ${ev.blockedURI}`);
    }
  };
  window.addEventListener("securitypolicyviolation", onCspViolation);

  const watchdog = window.setInterval(() => {
    if (Date.now() - lastTick > UPLOAD_STALL_MS) controller.abort();
  }, 2_000);

  try {
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(buildUploadPathname(file), file, {
      access: "public",
      handleUploadUrl: "/api/dashboard/upload-client-token",
      contentType: file.type || undefined,
      // multipart NÃO é automático no SDK (default false). Sem isso um vídeo
      // de 200MB vira um PUT único sem retry por parte, e qualquer oscilação
      // de rede derruba o upload inteiro do zero. Ligado sempre porque
      // funciona igual em arquivo pequeno — testado de 180KB (1 parte) a
      // 12MB (2 partes) em scripts/probe-multipart-always.mjs.
      multipart: true,
      abortSignal: controller.signal,
      onUploadProgress: (ev) => {
        lastTick = Date.now();
        sawProgress = sawProgress || ev.loaded > 0;
        onProgress?.(Math.round(ev.percentage));
      },
    });

    // Biblioteca de mídia: registra DEPOIS do upload resolver (era isso que
    // o onUploadCompleted fazia). Não bloqueia o retorno — se falhar, o
    // arquivo já está no ar e o funil funciona igual.
    void registerMediaAsset({
      url: blob.url,
      filename: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
    }).catch(() => {});

    return { ok: true, url: blob.url };
  } catch (e) {
    const csp = cspHits.length ? ` [CSP: ${cspHits.join("; ")}]` : "";

    if (controller.signal.aborted) {
      const secs = Math.round(UPLOAD_STALL_MS / 1000);
      return {
        ok: false,
        error: sawProgress
          ? `parou no meio (${secs}s sem avançar)${csp}`
          : `sem resposta do storage em ${secs}s${csp}`,
      };
    }
    const name = e instanceof Error ? e.name : "Error";
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `${name}: ${msg}${csp}`.slice(0, 300) };
  } finally {
    window.clearInterval(watchdog);
    window.removeEventListener("securitypolicyviolation", onCspViolation);
  }
}

async function uploadViaServer(
  file: File,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("purpose", "bot-funnel");
    const res = await fetch("/api/dashboard/upload", { method: "POST", body: fd });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      message?: string;
      error?: string;
    };
    if (res.ok && j.url) return { ok: true, url: j.url };
    return { ok: false, error: j.message || j.error || `HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 120) : "upload_failed",
    };
  }
}

/* ----- Media library picker (modal) ----- */

type MediaAssetItem = {
  id: string;
  url: string;
  filename: string | null;
  createdAt: string;
  sizeBytes: number | null;
};

function MediaLibraryPicker({
  kind,
  onPick,
  onClose,
}: {
  kind: "image" | "video" | "audio" | "gif";
  onPick: (url: string, filename?: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaAssetItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMediaAssets(kind, 100).then((r) => {
      if (cancelled) return;
      if (r.ok) setItems(r.items);
      else setErr(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function onDelete(id: string) {
    if (!window.confirm("Remover essa mídia da biblioteca? (não apaga o arquivo)")) return;
    setBusyId(id);
    const r = await deleteMediaAsset(id);
    setBusyId(null);
    if (r.ok) setItems((cur) => (cur ?? []).filter((x) => x.id !== id));
  }

  const kindLabel =
    kind === "image" ? "Imagens" : kind === "video" ? "Vídeos" : kind === "audio" ? "Áudios" : "GIFs";

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-zinc-900/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <Library className="size-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-white">Biblioteca de mídia · {kindLabel}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {items === null && !err ? (
            <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
              <Loader2 className="mr-2 size-4 animate-spin" /> Carregando...
            </div>
          ) : err ? (
            <p className="py-16 text-center text-sm text-red-300">{err}</p>
          ) : items && items.length === 0 ? (
            <div className="py-16 text-center">
              <Library className="mx-auto size-8 text-zinc-700" />
              <p className="mt-3 text-sm text-zinc-400">Sua biblioteca está vazia.</p>
              <p className="mt-1 text-xs text-zinc-600">
                Suba um arquivo em qualquer bloco de mídia — ele fica salvo aqui pra reusar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {(items ?? []).map((it) => (
                <div
                  key={it.id}
                  className="group relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-cyan-400/40"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onPick(it.url, it.filename ?? undefined);
                      onClose();
                    }}
                    className="block w-full"
                  >
                    {kind === "image" || kind === "gif" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full object-cover"
                      />
                    ) : kind === "video" ? (
                      // Aqui é um SELETOR: o seller escolhe pelo nome, que já
                      // aparece logo abaixo. Montar <video> pra cada item era
                      // caro à toa — a biblioteca traz até 60 itens e já tem
                      // seller com 33 vídeos (219 MB), o que sozinho derrubava
                      // a aba no celular.
                      <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-b from-zinc-800/60 to-black/60">
                        <span className="flex size-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                          <Play className="size-4 translate-x-px fill-white text-white" />
                        </span>
                      </div>
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-purple-900/30">
                        <Music className="size-8 text-purple-300" />
                      </div>
                    )}
                    <div className="px-2 py-1.5 text-left">
                      <p className="truncate text-[10px] text-zinc-300" title={it.filename ?? ""}>
                        {it.filename ?? "sem nome"}
                      </p>
                      <p className="text-[9px] text-zinc-600">
                        {it.sizeBytes ? `${Math.round(it.sizeBytes / 1024)} KB` : "—"} ·{" "}
                        {new Date(it.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(it.id)}
                    disabled={busyId === it.id}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/80 disabled:opacity-50"
                    title="Remover da biblioteca"
                  >
                    {busyId === it.id ? (
                      <Loader2 className="size-3 animate-spin text-white" />
                    ) : (
                      <Trash2 className="size-3 text-white" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Capa do vídeo no canvas — sem `<video>` nenhum até o seller clicar.
 *
 * 29/07/2026 (davi: "tem fluxo que nao ta abrindo pelo celular, seller
 * reclamando!"). O funil dele tem 9 blocos de vídeo e o ReactFlow monta todos
 * os nós de uma vez. Com `<video src>` cru, o Chrome faz preload de metadata
 * dos 9 ao mesmo tempo — e como boa parte dos MP4 vem sem faststart (átomo
 * `moov` no fim), ele varre o arquivo atrás do índice. Medido com Chromium
 * emulando celular: 65.8 MB baixados e 31 requisições só pra ABRIR a tela.
 * Trocando por esta capa: 1.27 MB e 11 requisições. O renderer do celular
 * morria antes de pintar, dando o "Não é possível abrir essa página".
 *
 * O play continua a um toque de distância, e aí sim vale pagar o download.
 */
function VideoThumb({ filename, onLoad }: { filename?: string; onLoad: () => void }) {
  return (
    <button
      type="button"
      onClick={onLoad}
      className="nodrag group flex h-24 w-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-zinc-800/60 to-black/60"
      title={filename ? `Ver ${filename}` : "Ver vídeo"}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 transition group-hover:bg-white/20">
        <Play className="size-3.5 translate-x-px fill-white text-white" />
      </span>
      <span className="text-[9px] text-zinc-400">Ver vídeo</span>
    </button>
  );
}

function MediaField({
  url,
  filename,
  accept,
  kind,
  onChange,
}: {
  url: string;
  filename?: string;
  accept: string;
  kind: "image" | "video" | "audio" | "gif";
  onChange: (url: string, filename?: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [convertendo, setConvertendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showLib, setShowLib] = useState(false);
  // 29/07/2026 (davi: "tem fluxo que não tá abrindo pelo celular"): o vídeo só
  // é montado depois que o seller pede. Ver o comentário em VideoThumb.
  const [playVideo, setPlayVideo] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Zera o input já: sem isso, escolher o MESMO arquivo depois de um erro
    // não dispara o onChange e parece que o botão "morreu".
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setUploading(true);
    setProgress(0);

    // Áudio vira OGG/Opus ANTES de subir — é o único formato que o Telegram
    // desenha como ondinha de voz. Ver `converterParaVoz`.
    let paraSubir = f;
    if (kind === "audio" && !jaEhVoz(f)) {
      setConvertendo(true);
      paraSubir = await converterParaVoz(f, (pct) => setProgress(pct));
      setConvertendo(false);
      setProgress(0);
    }

    const r = await uploadMedia(paraSubir, (pct) => setProgress(pct));
    setUploading(false);
    setProgress(0);
    // Guarda o nome ORIGINAL (não "audio.ogg"): é o que o seller reconhece
    // no builder e o que vira título se o Telegram recusar a voz.
    if (r.ok && r.url) onChange(r.url, f.name);
    else setErr(r.error ?? "erro");
  }

  const previewLabel =
    kind === "image" ? "IMG" : kind === "video" ? "VID" : kind === "audio" ? "AUD" : "GIF";

  return (
    <div className="space-y-1.5">
      {url ? (
        <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/40">
          {kind === "image" || kind === "gif" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-24 w-full object-cover"
              onError={(e) => ((e.currentTarget.style.display = "none"))}
            />
          ) : kind === "video" ? (
            playVideo ? (
              <video
                src={url}
                className="h-24 w-full object-cover"
                controls
                autoPlay
                muted
                playsInline
              />
            ) : (
              <VideoThumb filename={filename} onLoad={() => setPlayVideo(true)} />
            )
          ) : (
            <div className="flex h-16 items-center gap-2 bg-white/[0.03] px-3">
              <Music className="size-4 text-purple-300" />
              {/* preload="none": o browser só busca o arquivo no play. */}
              <audio src={url} preload="none" controls className="h-8 flex-1" />
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] bg-black/60 px-2 py-1 text-[9px] text-zinc-400">
            <span className="truncate" title={filename ?? url}>
              {filename ?? previewLabel}
            </span>
            <button
              type="button"
              onClick={() => onChange("", undefined)}
              className="rounded-full p-0.5 text-zinc-500 hover:bg-white/[0.06] hover:text-red-300 nodrag"
              title="Remover"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <label
            className={cn(
              "nodrag flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] px-2 py-3 text-[10px] text-zinc-400 hover:border-white/[0.2] hover:bg-white/[0.04]",
              uploading && "opacity-50 cursor-wait",
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {/* Converter pra voz demora e não é upload — dizer "Enviando"
                    aqui faria o seller achar que travou. */}
                {convertendo
                  ? progress > 0
                    ? `Convertendo ${progress}%`
                    : "Preparando voz..."
                  : progress >= 100
                    ? "Finalizando..."
                    : progress > 0
                      ? `${progress}%`
                      : "Enviando..."}
              </>
            ) : (
              <>
                <Upload className="size-3" /> Subir
              </>
            )}
            <input
              type="file"
              accept={accept}
              onChange={onFile}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowLib(true)}
            className="nodrag flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] px-2 py-3 text-[10px] text-zinc-400 hover:border-cyan-400/40 hover:bg-white/[0.04]"
          >
            <Library className="size-3" /> Biblioteca
          </button>
        </div>
      )}
      {err && (
        <p className="text-[9px] text-red-300" title={err}>
          {err.slice(0, 60)}
        </p>
      )}
      {showLib && (
        <MediaLibraryPicker
          kind={kind}
          onPick={(u, f) => onChange(u, f)}
          onClose={() => setShowLib(false)}
        />
      )}
    </div>
  );
}

function makeMediaNode(
  kind: "image" | "video" | "audio" | "gif",
  meta: {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    tint: string;
    accept: string;
    capPlaceholder: string;
  },
) {
  /**
   * Álbum só existe pra imagem e vídeo — o Telegram não aceita áudio nem
   * GIF misturado num sendMediaGroup.
   */
  const agrupavel = kind === "image" || kind === "video";

  return function MediaNode({ id, data, selected }: NodeProps) {
    const d = data as unknown as MediaData;
    const { updateNodeData } = useReactFlow();
    const Icon = meta.Icon;
    const albumPos = useAlbumPos(id);
    const noAlbum = agrupavel && albumPos !== "";
    return (
      <div
        className={cn(
          "w-[260px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
          selected
            ? "border-current ring-2 ring-current/20"
            : "border-white/[0.1] hover:border-white/20",
          meta.tint,
        )}
      >
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500"
        />
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide",
            meta.tint,
          )}
          style={{ background: "currentColor", color: undefined }}
        >
          <div className="flex items-center gap-1.5 mix-blend-plus-lighter">
            <Icon className="size-3.5" /> {meta.label}
          </div>
          {/* Fora do mix-blend-plus-lighter de propósito: naquele modo o
              preto some, e a pílula precisa de fundo escuro pra ler. */}
          {noAlbum && (
            <span
              className="ml-auto rounded-full bg-zinc-950/80 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white"
              title="Estas mídias saem numa mensagem só"
            >
              🖼 ÁLBUM {albumPos}
            </span>
          )}
        </div>
        <div className="space-y-2 p-2.5">
          <MediaField
            url={d.url ?? ""}
            filename={d.filename}
            accept={meta.accept}
            kind={kind}
            onChange={(url, filename) => updateNodeData(id, { url, filename })}
          />
          <textarea
            value={d.caption ?? ""}
            onChange={(e) => updateNodeData(id, { caption: e.target.value })}
            placeholder={meta.capPlaceholder}
            rows={2}
            className="nodrag w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          {kind === "audio" && (
            <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 px-2 py-1.5">
              <span className="text-[10px] font-semibold text-purple-300">
                Como o cliente recebe
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {(
                  [
                    ["voz", "🎤 Voz", false],
                    ["musica", "🎵 Música", true],
                  ] as const
                ).map(([k, rotulo, musica]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      updateNodeData(id, { asMusic: musica ? true : undefined })
                    }
                    className={cn(
                      "nodrag rounded-md px-2 py-1.5 text-[10px] font-semibold transition",
                      (d.asMusic === true) === musica
                        ? "bg-purple-400/20 text-purple-200 ring-1 ring-purple-400/40"
                        : "bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06]",
                    )}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              {d.asMusic === true ? (
                <>
                  <input
                    value={d.audioTitle ?? ""}
                    onChange={(e) =>
                      updateNodeData(id, { audioTitle: e.target.value || undefined })
                    }
                    placeholder={d.filename?.replace(/\.[a-z0-9]{1,5}$/i, "") || "Título da faixa"}
                    className="nodrag mt-1.5 w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                  />
                  <p className="mt-1 text-[9px] leading-snug text-zinc-500">
                    Cartão com título e duração. Sem título aqui, usa o nome do
                    arquivo que você subiu.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[9px] leading-snug text-zinc-500">
                  Chega como a ondinha do áudio gravado — sem nome de arquivo
                  aparecendo. MP3, M4A ou WAV viram OGG/Opus na hora de subir,
                  que é o formato que o Telegram desenha como voz.
                </p>
              )}
            </div>
          )}
          {agrupavel && (
            <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 px-2 py-1.5">
              <label className="nodrag flex cursor-pointer items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={d.groupWithNext === true}
                  onChange={(e) =>
                    updateNodeData(id, {
                      groupWithNext: e.target.checked ? true : undefined,
                    })
                  }
                  className="nodrag mt-[1px] size-3 shrink-0 accent-cyan-400"
                />
                <span className="text-[10px] font-semibold leading-tight text-zinc-200">
                  Agrupar com o próximo{" "}
                  <span className="font-normal text-zinc-500">(álbum)</span>
                </span>
              </label>
              <p className="mt-1 text-[9px] leading-snug text-zinc-500">
                {noAlbum ? (
                  <>
                    Vira <b className="text-zinc-300">1 mensagem só</b> com{" "}
                    {albumPos.split("/")[1]} mídias. Legenda que aparece é a do
                    1º item.
                  </>
                ) : d.groupWithNext ? (
                  <>
                    Ligue a bolinha <b className="text-zinc-300">próximo</b> num
                    outro bloco de imagem/vídeo (com arquivo) pra fechar o
                    álbum.
                  </>
                ) : (
                  <>
                    Marcado, esta mídia e as seguintes saem juntas numa
                    mensagem só. Até {ALBUM_MAX}. Áudio e GIF não entram.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          className="!size-3.5 !border-2 !border-zinc-900"
          style={{ background: NEXT }}
        />
      </div>
    );
  };
}

const ImageNode = makeMediaNode("image", {
  label: "Imagem",
  Icon: ImageIcon,
  tint: "text-fuchsia-300",
  accept: "image/jpeg,image/png,image/webp,image/heic",
  capPlaceholder: "Legenda (opcional) — use {{nome}}",
});
const VideoNode = makeMediaNode("video", {
  label: "Vídeo",
  Icon: Video,
  tint: "text-orange-300",
  accept: "video/mp4,video/webm,video/quicktime",
  capPlaceholder: "Legenda (opcional). Max ~4MB (Vercel serverless).",
});
const AudioNode = makeMediaNode("audio", {
  label: "Áudio",
  Icon: Music,
  tint: "text-purple-300",
  accept: "audio/mpeg,audio/ogg,audio/mp4,audio/wav",
  capPlaceholder: "Legenda (opcional) — MP3, OGG, M4A, WAV",
});
const GifNode = makeMediaNode("gif", {
  label: "GIF / Animação",
  Icon: Sparkles,
  tint: "text-yellow-300",
  accept: "image/gif,video/mp4",
  capPlaceholder: "Legenda (opcional) — GIF ou MP4 curto",
});

function DelayNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as DelayData;
  const { updateNodeData } = useReactFlow();
  const seconds = Number.isFinite(d.seconds) ? d.seconds : 2;
  const action = d.action ?? "typing";
  return (
    <div
      className={cn(
        "w-[220px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected
          ? "border-cyan-400/80 ring-2 ring-cyan-400/20"
          : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500"
      />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-cyan-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
        <Clock className="size-3.5" /> Delay
      </div>
      <div className="space-y-2 p-2.5">
        <label className="block text-[10px] text-zinc-400">Esperar (seg)</label>
        <input
          type="number"
          min={0.5}
          max={30}
          step={0.5}
          value={seconds}
          onChange={(e) =>
            updateNodeData(id, {
              seconds: Math.min(30, Math.max(0.5, Number(e.target.value) || 2)),
              action,
            })
          }
          className="nodrag w-full rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
        />
        <label className="block pt-1 text-[10px] text-zinc-400">Enquanto espera</label>
        <select
          value={action}
          onChange={(e) =>
            updateNodeData(id, {
              seconds,
              action: e.target.value as "typing" | "record_voice",
            })
          }
          className="nodrag w-full rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
        >
          <option value="typing">💬 Digitando...</option>
          <option value="record_voice">🎙️ Gravando áudio...</option>
        </select>
        <p className="text-[9px] text-zinc-500">Máx 30s.</p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

/* --------------- BUTTONS (inline keyboard) --------------- */

type ButtonEntry = { label: string; kind: "url" | "next"; url?: string };
type ButtonsData = {
  text: string;
  buttons: ButtonEntry[];
  /** default true — o runtime só esconde o "Voltar" quando isto é false */
  showBack?: boolean;
  /** rótulo custom do "Voltar" (vazio = "⬅️ Voltar") */
  backLabel?: string;
};

// 29/07/2026: HEADER_H/BTN_ROW_H/POLL_OPT_H foram removidos. Bolinhas agora
// moram DENTRO de cada linha e o CSS default do ReactFlow
// (`top: 50%; transform: translateY(-50%)`) auto-centraliza — sem constante,
// sem chute de altura, sem desalinhar quando a linha muda de tamanho.

function ButtonsNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ButtonsData;
  const { updateNodeData } = useReactFlow();
  const btns = Array.isArray(d.buttons) ? d.buttons : [];
  const text = d.text ?? "";

  function setBtn(i: number, patch: Partial<ButtonEntry>) {
    const next = btns.map((b, k) => (k === i ? { ...b, ...patch } : b));
    updateNodeData(id, { text, buttons: next });
  }
  function addBtn() {
    if (btns.length >= 8) return;
    updateNodeData(id, {
      text,
      buttons: [...btns, { label: "Continuar", kind: "next" as const }],
    });
  }
  function removeBtn(i: number) {
    updateNodeData(id, { text, buttons: btns.filter((_, k) => k !== i) });
  }

  // 29/07/2026: handles agora moram DENTRO de cada linha (ver comentário no
  // Handle mais abaixo). Não precisa mais medir altura de textarea/gap.

  return (
    <div
      className={cn(
        "w-[280px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-sky-400/80 ring-2 ring-sky-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-sky-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
        <MousePointerClick className="size-3.5" /> Botões (inline keyboard)
      </div>
      <div className="space-y-2 p-2.5">
        <textarea
          value={text}
          onChange={(e) => updateNodeData(id, { text: e.target.value, buttons: btns })}
          placeholder="Texto da mensagem (aparece acima dos botões)"
          rows={2}
          className="nodrag w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
        />
        {btns.length === 0 && (
          <p className="text-[10px] text-zinc-500">Nenhum botão. Clique "+ Botão" abaixo.</p>
        )}
        {btns.map((b, i) => (
          <div
            key={i}
            className="relative rounded-lg border border-white/[0.06] bg-zinc-950/60 p-2"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                #{i + 1} · {b.kind === "url" ? "link" : "ramo"}
              </span>
              <button
                type="button"
                onClick={() => removeBtn(i)}
                className="nodrag rounded-full p-0.5 text-zinc-500 hover:bg-white/[0.06] hover:text-red-300"
              >
                <X className="size-3" />
              </button>
            </div>
            <input
              value={b.label}
              onChange={(e) => setBtn(i, { label: e.target.value })}
              placeholder="Texto do botão"
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
            />
            <div className="mt-1 flex gap-1">
              <select
                value={b.kind}
                onChange={(e) => setBtn(i, { kind: e.target.value as "url" | "next" })}
                className="nodrag rounded-md border border-white/[0.08] bg-zinc-900 px-1.5 py-1 text-[10px] text-white focus:outline-none"
              >
                <option value="next">→ ramo</option>
                <option value="url">🔗 link</option>
              </select>
              {b.kind === "url" && (
                <input
                  value={b.url ?? ""}
                  onChange={(e) => setBtn(i, { url: e.target.value })}
                  placeholder="https://..."
                  className="nodrag flex-1 rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                />
              )}
            </div>
            {b.kind === "next" && (
              /**
                * 29/07/2026 (davi: "arrume as bolinhas que estão desalinhadas
                * do painel"). Antes o handle era posicionado no NODE inteiro
                * com `top: baseFixo + i*44`, e o 44 era só um chute — quando
                * o botão trocava pra "link" (input de URL a mais) ou quando o
                * texto quebrava linha, a linha ficava mais alta e a bolinha
                * escorregava pra cima da linha errada.
                *
                * Agora o handle mora DENTRO da própria linha (que já é
                * `position: relative`). O CSS default do ReactFlow
                * (`top: 50%; transform: translateY(-50%)`) centra a bolinha
                * na altura EXATA da linha, medida na hora, sem depender de
                * constante. `right: -10` empurra pro canto do NODE (o outer
                * `p-2.5` recua a linha 10px do canto do card).
                */
              <Handle
                type="source"
                position={Position.Right}
                id={`btn_${i}`}
                className="!size-3 !border-2 !border-zinc-900"
                style={{ background: BTN_COLOR, right: -10 }}
              />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addBtn}
          disabled={btns.length >= 8}
          className="nodrag inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sky-400/25 bg-sky-400/[0.05] px-2 py-1.5 text-[10px] font-medium text-sky-300 hover:bg-sky-400/[0.12] disabled:opacity-50"
        >
          <Plus className="size-3" /> Adicionar botão {btns.length >= 8 && "(máx 8)"}
        </button>

        {/* "Voltar" — só aparece pro cliente quando existe passo anterior.
            Ligado por padrão: é o que impede o cliente de ficar preso depois
            de escolher a opção errada. */}
        <label className="nodrag flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-950/60 px-2 py-1.5">
          <input
            type="checkbox"
            checked={d.showBack !== false}
            onChange={(e) => updateNodeData(id, { showBack: e.target.checked })}
            className="size-3 accent-sky-400"
          />
          <span className="text-[10px] text-zinc-400">
            Botão <span className="text-zinc-200">voltar</span>
          </span>
        </label>
        {d.showBack !== false && (
          <input
            value={d.backLabel ?? ""}
            onChange={(e) => updateNodeData(id, { backLabel: e.target.value })}
            placeholder="⬅️ Voltar"
            maxLength={64}
            className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
          />
        )}
      </div>
      {/* Handle "next" pra fluxo default só existe quando TODOS são url ou não tem NEXT */}
      {btns.every((b) => b.kind === "url") && (
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          className="!size-3 !border-2 !border-zinc-900"
          style={{ background: NEXT, bottom: 12, top: "auto" }}
        />
      )}
    </div>
  );
}

/* --------------- POLL (enquete) --------------- */

type PollData = { question: string; options: string[] };

function PollNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as PollData;
  const { updateNodeData } = useReactFlow();
  const opts = Array.isArray(d.options) ? d.options : [];
  const question = d.question ?? "";

  function setOpt(i: number, v: string) {
    updateNodeData(id, {
      question,
      options: opts.map((o, k) => (k === i ? v : o)),
    });
  }
  function addOpt() {
    if (opts.length >= 10) return;
    updateNodeData(id, { question, options: [...opts, `Opção ${opts.length + 1}`] });
  }
  function rmOpt(i: number) {
    if (opts.length <= 2) return;
    updateNodeData(id, { question, options: opts.filter((_, k) => k !== i) });
  }

  return (
    <div
      className={cn(
        "w-[280px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-pink-400/80 ring-2 ring-pink-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-pink-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-300">
        <ListChecks className="size-3.5" /> Enquete
      </div>
      <div className="space-y-2 p-2.5">
        <textarea
          value={question}
          onChange={(e) => updateNodeData(id, { question: e.target.value, options: opts })}
          placeholder="Pergunta da enquete"
          rows={2}
          className="nodrag w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-pink-400/40"
        />
        {opts.map((o, i) => (
          <div key={i} className="relative flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-center text-[10px] font-bold text-pink-300/80">
              {String.fromCharCode(65 + i)}
            </span>
            <input
              value={o}
              onChange={(e) => setOpt(i, e.target.value)}
              placeholder={`Opção ${i + 1}`}
              className="nodrag flex-1 rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-pink-400/40"
            />
            <button
              type="button"
              onClick={() => rmOpt(i)}
              disabled={opts.length <= 2}
              className="nodrag rounded-full p-0.5 text-zinc-500 hover:bg-white/[0.06] hover:text-red-300 disabled:opacity-40"
            >
              <X className="size-3" />
            </button>
            {/* Handle DENTRO da linha (mesma correção dos botões — ver o
                bloco `buttons` acima). CSS default centra na altura EXATA
                da linha, `right: -10` alinha com a borda do node. */}
            <Handle
              type="source"
              position={Position.Right}
              id={`poll_${i}`}
              className="!size-3 !border-2 !border-zinc-900"
              style={{ background: POLL_COLOR, right: -10 }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addOpt}
          disabled={opts.length >= 10}
          className="nodrag inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-pink-400/25 bg-pink-400/[0.05] px-2 py-1.5 text-[10px] font-medium text-pink-300 hover:bg-pink-400/[0.12] disabled:opacity-50"
        >
          <Plus className="size-3" /> Adicionar opção {opts.length >= 10 && "(máx 10)"}
        </button>
        <p className="text-[9px] text-zinc-500">Cada opção tem um ramo próprio.</p>
      </div>
    </div>
  );
}

/* --------------- LOCATION --------------- */

type LocationData = { lat: number; lng: number; title: string; address: string };

function LocationNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as LocationData;
  const { updateNodeData } = useReactFlow();
  return (
    <div
      className={cn(
        "w-[260px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-emerald-400/80 ring-2 ring-emerald-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-emerald-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
        <MapPin className="size-3.5" /> Localização
      </div>
      <div className="space-y-2 p-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="block text-[9px] text-zinc-500">Latitude</label>
            <input
              type="number"
              step="any"
              value={Number.isFinite(d.lat) ? d.lat : ""}
              onChange={(e) => updateNodeData(id, { ...d, lat: Number(e.target.value) })}
              placeholder="-23.5505"
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
            />
          </div>
          <div>
            <label className="block text-[9px] text-zinc-500">Longitude</label>
            <input
              type="number"
              step="any"
              value={Number.isFinite(d.lng) ? d.lng : ""}
              onChange={(e) => updateNodeData(id, { ...d, lng: Number(e.target.value) })}
              placeholder="-46.6333"
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
            />
          </div>
        </div>
        <input
          value={d.title ?? ""}
          onChange={(e) => updateNodeData(id, { ...d, title: e.target.value })}
          placeholder="Título (opcional)"
          className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
        />
        <input
          value={d.address ?? ""}
          onChange={(e) => updateNodeData(id, { ...d, address: e.target.value })}
          placeholder="Endereço (opcional)"
          className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
        />
        <p className="text-[9px] text-zinc-500">Dica: Google Maps → clique-direito → copiar coordenadas.</p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

/* --------------- RANDOM (A/B/C) --------------- */

function RandomNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        "relative w-[200px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-violet-400/80 ring-2 ring-violet-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-violet-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
        <Shuffle className="size-3.5" /> Random (A/B/C)
      </div>
      <div className="space-y-1.5 p-3">
        <p className="text-[11px] text-zinc-300">Sorteia 1 dos 3 ramos:</p>
        {["A", "B", "C"].map((L, i) => (
          <div
            key={L}
            className="relative flex items-center justify-between rounded-md border border-white/[0.06] bg-zinc-950/60 px-2 py-1.5"
          >
            <span className="text-[11px] font-bold" style={{ color: RAND_COLORS[i] }}>
              Ramo {L}
            </span>
            <span className="text-[9px] text-zinc-500">~{Math.round(100 / 3)}%</span>
            {/* Handle DENTRO da linha (mesma correção de buttons/poll).
                p-3 no wrapper externo → `right: -12` alinha com a borda. */}
            <Handle
              type="source"
              position={Position.Right}
              id={`rand_${i}`}
              className="!size-3 !border-2 !border-zinc-900"
              style={{ background: RAND_COLORS[i], right: -12 }}
            />
          </div>
        ))}
        <p className="pt-1 text-[9px] text-zinc-500">Conecte cada bolinha a um bloco.</p>
      </div>
    </div>
  );
}

/* --------------- PAYMENT (ligação de pagamento) ---------------
 * 21/07/2026 (davi: "ta faltando um blg importante! Pagamentos via o bot do
 * telegram, um bloco de pagamento, sabe? ligacao de pagamento"). Dois modos:
 *  - "chat" — igual o botproduct, gera PIX no chat + pausa esperando (branch
 *    pagou/nao-pagou). Diferente do botproduct: usa CHECKOUT (não produto),
 *    o que dá ao seller acesso a order bump/upsell/AB configurados no
 *    checkout.
 *  - "link" — manda um botão inline URL apontando pro checkout web. Não
 *    pausa (segue por "next"). Cliente paga no browser (PIX + cartão +
 *    boleto disponíveis).
 */

/**
 * 22/07/2026 (davi): "Nessa aba de pagamento do bot, dê varias opcoes de
 * botao pra gerar o pix, todas conguraveis" — cada plano vira um BOTÃO
 * próprio no chat. Cliente escolhe qual, aí gera PIX naquele valor.
 * Ex: R$9,50/Mensal · R$12,90/3meses · R$14,90/vitalicio.
 */
/**
 * Campos da mensagem estilizada do PIX (título, legenda, ajuda e os 3
 * botões). Vive em dois lugares: no bloco inteiro (default) e, desde
 * 31/07/2026, DENTRO de cada plano.
 *
 * Seller: "preciso que a aba personalizar mensagem do pix do bloco de
 * upcell seja de acordo com o tanto de planos q existe no upsell — 2
 * planos, 2 abas separadamente para cada um".
 *
 * Campo vazio no plano = herda do bloco; vazio no bloco = default do
 * sistema. Assim quem já tinha personalizado o bloco não perde nada ao
 * adicionar um segundo plano.
 */
type PixMessageConfig = {
  pixTitle?: string;
  pixInstruction?: string;
  pixHelp?: string;
  copyButtonLabel?: string;
  qrButtonLabel?: string;
  verifyButtonLabel?: string;
  showCopyButton?: boolean;
  showQrButton?: boolean;
  showVerifyButton?: boolean;
};

type PaymentPlan = {
  amountCents: number;
  title: string;
  period?: string;
  /**
   * 30/07/2026 (seller: "preciso de uma opção de descrição para poder
   * descrever oque o plano oferece"). Aparece pro cliente no chat ANTES
   * dos botões — quando há 2+ planos, cada linha tem título + preço +
   * descrição pra ajudar a comparar antes de escolher. Vazio = não sai.
   */
  description?: string;
  /**
   * Mensagem do PIX só deste plano. Guardada DENTRO do plano (e não num
   * array paralelo) de propósito: o runtime filtra planos abaixo de R$2,00
   * antes de indexar, então um array separado sairia do lugar. Aninhado,
   * a config viaja junto com o plano e nunca casa com o plano errado.
   */
  pix?: PixMessageConfig;
};

type PaymentData = PixMessageConfig & {
  mode: "button" | "chat" | "link";
  /** Lista de planos (modo button). Cada plano = 1 botão inline no chat.
   *  Se ausente/vazio, cai no fallback single usando amountCents. */
  plans?: PaymentPlan[];
  /** Valor único (fallback single-button e modo chat). */
  amountCents: number;
  productName: string;
  text?: string;
  buttonLabel?: string;
  /* --- Só usados no modo LINK: --- */
  checkoutId?: string;
  checkoutSlug?: string;
  checkoutName?: string;
  image?: string | null;
  checkoutHost?: string;
  priceCents?: number;
  /* --- Order Bump (só modo button) — 22/07/2026 davi HOT feature 5 --- */
  orderBumpEnabled?: boolean;
  orderBumpTitle?: string;
  orderBumpAmountCents?: number;
  orderBumpPrompt?: string;
  /* --- 2º Order Bump — 06/08/2026 (davi: "adicione mais uma opção de
   *     order bump, somente mais um"). Campos separados, e não um array,
   *     pra nenhum funil já salvo precisar de migração. --- */
  orderBump2Enabled?: boolean;
  orderBump2Title?: string;
  orderBump2AmountCents?: number;
  orderBump2Prompt?: string;
  /** Minutos até desistir e sair pelo “não pagou”. Vazio = validade real do
   *  PIX (60 min). 01/08/2026 — ver unpaidDeadline no runtime. */
  unpaidAfterMinutes?: number;
};

const DEFAULT_PIX_TITLE = "🔷 Pagamento via PIX Copia e Cola 🔷";
const DEFAULT_PIX_INSTRUCTION =
  "👆 Clique no código PIX acima para copiar.\n\nApós efetuar o pagamento retorne aqui para continuar.";
const DEFAULT_COPY_LABEL = "📋 Copiar código PIX";
const DEFAULT_QR_LABEL = "📱 Pagar via QR Code";
const DEFAULT_VERIFY_LABEL = "✅ Já paguei, verificar";

// Context pra passar checkouts+host pros nodes sem re-plumbing dos NodeProps
type CheckoutCtx = {
  checkouts: BotFunnelCheckout[];
  checkoutHost: string;
};
const CheckoutContext = createContext<CheckoutCtx | null>(null);

/**
 * Sub-componente: personalização da mensagem estilizada do PIX (modo
 * button/chat). Expansível pra não poluir o node. Todos os campos têm
 * defaults sensatos (que espelham o print do davi).
 */
/**
 * Um bump: checkbox de ligar + título + valor + template da pergunta.
 *
 * Recebe as CHAVES dos campos porque o 1º bump mora em `orderBump*` e o
 * 2º em `orderBump2*` — os nomes antigos ficaram como estavam pra nenhum
 * funil já salvo precisar de migração.
 */
function CamposDoBump({
  data,
  onChange,
  chaves,
  rotulo,
  exemploTitulo,
}: {
  data: PaymentData;
  onChange: (patch: Partial<PaymentData>) => void;
  chaves: {
    enabled: "orderBumpEnabled" | "orderBump2Enabled";
    title: "orderBumpTitle" | "orderBump2Title";
    amount: "orderBumpAmountCents" | "orderBump2AmountCents";
    prompt: "orderBumpPrompt" | "orderBump2Prompt";
  };
  rotulo: string;
  exemploTitulo: string;
}) {
  const enabled = data[chaves.enabled] === true;
  const cents = Math.round(Number(data[chaves.amount] ?? 0));
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({ [chaves.enabled]: e.target.checked })}
          className="nodrag size-3 rounded border-white/[0.12] bg-white/[0.04] text-cyan-400"
        />
        <span className="text-[11px] text-zinc-300">{rotulo}</span>
      </label>
      {enabled && (
        <>
          <div>
            <label className="block text-[10px] text-zinc-400">Título do bump</label>
            <input
              value={data[chaves.title] ?? ""}
              onChange={(e) => onChange({ [chaves.title]: e.target.value })}
              placeholder={exemploTitulo}
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-400">Valor adicional (R$)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">R$</span>
              <input
                type="number"
                min={1}
                step={0.01}
                value={cents > 0 ? (cents / 100).toFixed(2) : ""}
                onChange={(e) => {
                  const reais = Number(e.target.value);
                  const c = Number.isFinite(reais) ? Math.round(reais * 100) : 0;
                  onChange({ [chaves.amount]: c });
                }}
                placeholder="5.00"
                className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 pl-8 pr-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-zinc-400">Template da pergunta (opcional)</label>
            <textarea
              value={data[chaves.prompt] ?? ""}
              onChange={(e) => onChange({ [chaves.prompt]: e.target.value })}
              placeholder="🎁 <b>Aproveita e leva também</b>&#10;&#10;{title}&#10;&#10;Por +<b>{price}</b>"
              rows={3}
              className="nodrag w-full resize-none rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            />
            <p className="mt-0.5 text-[9px] text-zinc-500">
              Placeholders: {"{title}"}, {"{price}"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Order Bump editor (davi HOT feature 5). Só modo Botão.
 * Quando ligado, ANTES de gerar o PIX o bot pergunta ao cliente:
 *   "🎁 Aproveita e leva também [X]  Por +R$5,00"
 *   [ ✅ SIM, adicionar (+R$5,00) ] [ ❌ Não, seguir sem ]
 * Se aceito, gera PIX no valor base + valor do bump.
 *
 * 06/08/2026 (davi): "adicione mais uma opção de order bump, somente mais
 * um". São dois, no máximo — e o 2º só aparece depois de o 1º estar
 * ligado, porque o bot pergunta um DEPOIS do outro: oferecer o segundo
 * sem o primeiro seria só o primeiro com outro nome.
 */
function OrderBumpEditor({
  data,
  onChange,
}: {
  data: PaymentData;
  onChange: (patch: Partial<PaymentData>) => void;
}) {
  const [open, setOpen] = useState(false);
  const enabled = data.orderBumpEnabled === true;
  const enabled2 = data.orderBump2Enabled === true;
  const ligados = (enabled ? 1 : 0) + (enabled && enabled2 ? 1 : 0);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nodrag flex w-full items-center justify-between px-2.5 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-white"
      >
        <span className="flex items-center gap-1.5">
          <Gift className="size-3" />
          🎁 Order Bump{" "}
          {ligados > 0 && (
            <span className="text-cyan-400">
              ({ligados === 1 ? "ligado" : "2 ligados"})
            </span>
          )}
        </span>
        <span className="text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-white/[0.06] p-2.5">
          <CamposDoBump
            data={data}
            onChange={(patch) =>
              // Desmarcar o 1º esconde o painel do 2º. Se ele ficasse ligado
              // no dado salvo, o bot seguiria oferecendo uma oferta que o
              // seller não vê mais na tela — nem tem como desligar.
              onChange(
                patch.orderBumpEnabled === false
                  ? { ...patch, orderBump2Enabled: false }
                  : patch,
              )
            }
            chaves={{
              enabled: "orderBumpEnabled",
              title: "orderBumpTitle",
              amount: "orderBumpAmountCents",
              prompt: "orderBumpPrompt",
            }}
            rotulo="Oferecer bump antes do PIX"
            exemploTitulo="Ex: pack extra com 50 vídeos"
          />
          {enabled && (
            <div className="space-y-2 border-t border-dashed border-white/[0.08] pt-2">
              <CamposDoBump
                data={data}
                onChange={onChange}
                chaves={{
                  enabled: "orderBump2Enabled",
                  title: "orderBump2Title",
                  amount: "orderBump2AmountCents",
                  prompt: "orderBump2Prompt",
                }}
                rotulo="Oferecer um 2º bump depois desse"
                exemploTitulo="Ex: chamada de 15 min comigo"
              />
              <p className="text-[9px] leading-snug text-zinc-500">
                {enabled2
                  ? "O bot pergunta um de cada vez: 1º bump → 2º bump → PIX. O que o cliente aceitar é somado no valor."
                  : "Um segundo presente, oferecido logo depois do primeiro. Máximo de 2."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PIX_TEXT_KEYS = [
  "pixTitle",
  "pixInstruction",
  "pixHelp",
  "copyButtonLabel",
  "qrButtonLabel",
  "verifyButtonLabel",
] as const;
const PIX_FLAG_KEYS = ["showCopyButton", "showQrButton", "showVerifyButton"] as const;

/** true se ESTE nível (bloco ou plano) tem alguma coisa preenchida. */
function hasPixOverrides(v: PixMessageConfig | undefined): boolean {
  if (!v) return false;
  if (PIX_TEXT_KEYS.some((k) => typeof v[k] === "string" && v[k]!.trim() !== ""))
    return true;
  return PIX_FLAG_KEYS.some((k) => typeof v[k] === "boolean");
}

/**
 * Aba "✨ Personalizar mensagem do PIX".
 *
 * Serve os dois níveis com o mesmo componente:
 *  - bloco  → `inherited` ausente, placeholders = defaults do sistema;
 *  - plano  → `inherited` = config do bloco, placeholders = o que o bloco
 *             já diz. Campo vazio no plano NÃO é "apague isto", é "herda".
 *
 * 31/07/2026 (seller): com 2+ planos o node passa a renderizar uma aba
 * dessas por plano, porque a mensagem do PIX do plano mensal raramente é a
 * mesma do vitalício.
 */
function PixMessagePersonalization({
  title,
  value,
  inherited,
  onChange,
  onReset,
}: {
  title: string;
  value: PixMessageConfig;
  /** Config do nível de cima — vira placeholder e default dos toggles. */
  inherited?: PixMessageConfig;
  onChange: (patch: Partial<PixMessageConfig>) => void;
  /** Só nos planos: volta a herdar tudo do bloco. */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const custom = hasPixOverrides(value);

  /** Placeholder: o que o cliente veria HOJE se este campo ficar vazio. */
  const ph = (k: (typeof PIX_TEXT_KEYS)[number], systemDefault: string) => {
    const up = inherited?.[k];
    return typeof up === "string" && up.trim() !== "" ? up : systemDefault;
  };
  /** Toggle: plano → bloco → ligado. */
  const flag = (k: (typeof PIX_FLAG_KEYS)[number]) => {
    if (typeof value[k] === "boolean") return value[k];
    if (typeof inherited?.[k] === "boolean") return inherited[k];
    return true;
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-black/20",
        custom && inherited ? "border-cyan-400/25" : "border-white/[0.06]",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nodrag flex w-full items-center justify-between gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-white"
      >
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {inherited && (
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider",
                custom
                  ? "bg-cyan-400/15 text-cyan-300"
                  : "bg-white/[0.06] text-zinc-500",
              )}
            >
              {custom ? "próprio" : "herda"}
            </span>
          )}
          <span className="text-zinc-500">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-white/[0.06] p-2.5">
          {inherited && (
            <p className="rounded-md bg-white/[0.03] px-2 py-1 text-[9px] leading-snug text-zinc-500">
              Campo vazio = usa a mensagem padrão do bloco (mostrada em cinza).
            </p>
          )}
          <div>
            <label className="block text-[10px] text-zinc-400">Título</label>
            <input
              value={value.pixTitle ?? ""}
              onChange={(e) => onChange({ pixTitle: e.target.value })}
              placeholder={ph("pixTitle", DEFAULT_PIX_TITLE)}
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-400">
              Legenda (abaixo do código)
            </label>
            <textarea
              value={value.pixInstruction ?? ""}
              onChange={(e) => onChange({ pixInstruction: e.target.value })}
              placeholder={ph("pixInstruction", DEFAULT_PIX_INSTRUCTION)}
              rows={3}
              className="nodrag w-full resize-none rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-400">
              Bloco &quot;Ajuda&quot; (opcional)
            </label>
            <textarea
              value={value.pixHelp ?? ""}
              onChange={(e) => onChange({ pixHelp: e.target.value })}
              placeholder={ph(
                "pixHelp",
                "Ex: <b>Problemas com pagamento?</b>\n• Fale com /suporte",
              )}
              rows={2}
              className="nodrag w-full resize-none rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            />
          </div>

          <div className="border-t border-white/[0.06] pt-2 space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              Botões (abaixo da mensagem)
            </p>
            <PixButtonRow
              enabled={flag("showCopyButton") !== false}
              label={value.copyButtonLabel ?? ""}
              defaultLabel={ph("copyButtonLabel", DEFAULT_COPY_LABEL)}
              onToggle={(on) => onChange({ showCopyButton: on })}
              onLabel={(v) => onChange({ copyButtonLabel: v })}
            />
            <PixButtonRow
              enabled={flag("showQrButton") !== false}
              label={value.qrButtonLabel ?? ""}
              defaultLabel={ph("qrButtonLabel", DEFAULT_QR_LABEL)}
              onToggle={(on) => onChange({ showQrButton: on })}
              onLabel={(v) => onChange({ qrButtonLabel: v })}
            />
            <PixButtonRow
              enabled={flag("showVerifyButton") !== false}
              label={value.verifyButtonLabel ?? ""}
              defaultLabel={ph("verifyButtonLabel", DEFAULT_VERIFY_LABEL)}
              onToggle={(on) => onChange({ showVerifyButton: on })}
              onLabel={(v) => onChange({ verifyButtonLabel: v })}
            />
          </div>
          <p className="text-[9px] leading-snug text-zinc-500">
            Todos os campos aceitam HTML (&lt;b&gt;, &lt;i&gt;) + variáveis{" "}
            <code className="text-zinc-300">{"{{nome}}"}</code>{" "}
            <code className="text-zinc-300">{"{{cupom}}"}</code>.
          </p>
          {onReset && custom && (
            <button
              type="button"
              onClick={onReset}
              className="nodrag w-full rounded-md border border-white/[0.08] px-2 py-1 text-[9px] text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            >
              ↺ Voltar a herdar do bloco
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Decide entre UMA aba (bloco) ou N+1 abas (bloco + uma por plano).
 *
 * Só multiplica no modo botão com 2+ planos: no modo Auto o runtime usa
 * apenas plans[0], então N abas ali seriam N-1 abas que nunca fazem nada.
 */
function PixPersonalizationSection({
  nodeId,
  data,
  mode,
  onChange,
}: {
  nodeId: string;
  data: PaymentData;
  mode: "button" | "chat" | "link";
  onChange: (patch: Partial<PaymentData>) => void;
}) {
  const plans = Array.isArray(data.plans) ? data.plans : [];
  const perPlan = mode === "button" && plans.length >= 2;

  function patchPlanPix(i: number, patch: Partial<PixMessageConfig>) {
    onChange({
      plans: plans.map((p, k) =>
        k === i ? { ...p, pix: { ...(p.pix ?? {}), ...patch } } : p,
      ),
    });
  }
  function resetPlanPix(i: number) {
    onChange({
      plans: plans.map((p, k) => (k === i ? { ...p, pix: undefined } : p)),
    });
  }

  if (!perPlan) {
    return (
      <PixMessagePersonalization
        title="✨ Personalizar mensagem do PIX"
        value={data}
        onChange={onChange}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <PixMessagePersonalization
        title="✨ Mensagem do PIX — padrão de todos os planos"
        value={data}
        onChange={onChange}
      />
      <p className="px-0.5 text-[9px] leading-snug text-zinc-500">
        Cada plano pode ter a sua própria mensagem — o que ficar vazio herda o
        padrão acima.
      </p>
      {plans.map((p, i) => (
        <PixMessagePersonalization
          key={`${nodeId}-pix-${i}`}
          title={`✨ PIX do plano #${i + 1}${p.title?.trim() ? ` · ${p.title.trim()}` : ""}`}
          value={p.pix ?? {}}
          inherited={data}
          onChange={(patch) => patchPlanPix(i, patch)}
          onReset={() => resetPlanPix(i)}
        />
      ))}
    </div>
  );
}

function PixButtonRow({
  enabled,
  label,
  defaultLabel,
  onToggle,
  onLabel,
}: {
  enabled: boolean;
  label: string;
  defaultLabel: string;
  onToggle: (v: boolean) => void;
  onLabel: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="nodrag size-3 shrink-0 rounded border-white/[0.12] bg-white/[0.04] text-cyan-400"
      />
      <input
        value={label}
        onChange={(e) => onLabel(e.target.value)}
        placeholder={defaultLabel}
        disabled={!enabled}
        className="nodrag flex-1 rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-0.5 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 disabled:opacity-40"
      />
    </div>
  );
}

/**
 * Editor de PLANOS do bloco Pagamento (modo button/chat).
 *
 * Modo button: N planos → N botões inline no chat (cliente escolhe qual
 * gera PIX). Ex: R$9,50/Mensal · R$12,90/3meses · R$14,90/vitalicio.
 *
 * Modo chat/auto: só suporta 1 valor — usa plans[0] se existir, senão
 * cai no amountCents/productName legacy.
 *
 * Retrocompat: se plans === undefined ou vazio, começa com 1 plano
 * inicializado do amountCents/productName atual (transição zero-friction).
 */
function PaymentPlansEditor({
  data,
  onChange,
}: {
  data: PaymentData;
  onChange: (patch: Partial<PaymentData>) => void;
}) {
  const mode = data.mode === "chat" ? "chat" : "button";
  // Garante 1 plano mínimo — se plans ausente, sintetiza do legacy.
  const plans: PaymentPlan[] =
    Array.isArray(data.plans) && data.plans.length > 0
      ? data.plans
      : [
          {
            amountCents: data.amountCents ?? 0,
            title: data.productName ?? "",
            period: "",
          },
        ];

  function updatePlan(i: number, patch: Partial<PaymentPlan>) {
    const next = plans.map((p, k) => (k === i ? { ...p, ...patch } : p));
    onChange({
      plans: next,
      // Sincroniza fallback single-value com plans[0] (retrocompat)
      amountCents: next[0]?.amountCents ?? 0,
      productName: next[0]?.title ?? "",
    });
  }
  function addPlan() {
    if (plans.length >= 6) return;
    onChange({ plans: [...plans, { amountCents: 0, title: "", period: "" }] });
  }
  function removePlan(i: number) {
    const next = plans.filter((_, k) => k !== i);
    onChange({
      plans: next.length > 0 ? next : undefined,
      amountCents: next[0]?.amountCents ?? 0,
      productName: next[0]?.title ?? "",
    });
  }

  const canMulti = mode === "button";

  return (
    <div className="space-y-2">
      {canMulti && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Planos ({plans.length})
          </p>
          <p className="text-[9px] text-zinc-500">
            Cada plano = 1 botão no chat
          </p>
        </div>
      )}
      {plans.map((p, i) => {
        const isValid = p.amountCents >= 200;
        const showRemove = canMulti && plans.length > 1;
        return (
          <div
            key={i}
            /**
              * 29/07/2026: `relative` pra que a bolinha `upsell_${i}` (mais
              * abaixo) ancore aqui e fique alinhada com o card do plano.
              * Antes só existia UMA bolinha `pagou` no node inteiro; agora
              * cada plano tem a sua pra permitir entregáveis diferentes.
              */
            className="relative rounded-lg border border-white/[0.06] bg-zinc-950/60 p-2 space-y-1.5"
          >
            {canMulti && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                  Plano #{i + 1}
                </span>
                {showRemove && (
                  <button
                    type="button"
                    onClick={() => removePlan(i)}
                    className="nodrag rounded-full p-0.5 text-zinc-500 hover:bg-white/[0.06] hover:text-red-300"
                    title="Remover plano"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-[100px_1fr] gap-1.5">
              <div>
                <label className="block text-[9px] text-zinc-500">Valor (R$)</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">
                    R$
                  </span>
                  <input
                    type="number"
                    min={2}
                    step={0.01}
                    value={p.amountCents > 0 ? (p.amountCents / 100).toFixed(2) : ""}
                    onChange={(e) => {
                      const reais = Number(e.target.value);
                      const cents = Number.isFinite(reais) ? Math.round(reais * 100) : 0;
                      updatePlan(i, { amountCents: cents });
                    }}
                    placeholder="9.90"
                    className={cn(
                      "nodrag w-full rounded-md border bg-zinc-900 pl-7 pr-1.5 py-1 text-[11px] font-mono text-white focus:outline-none focus:ring-1",
                      isValid || p.amountCents === 0
                        ? "border-white/[0.08] focus:ring-cyan-400/40"
                        : "border-red-500/50 focus:ring-red-400/40",
                    )}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500">Título</label>
                <input
                  value={p.title}
                  onChange={(e) => updatePlan(i, { title: e.target.value })}
                  placeholder="acesso Mensal 🔞"
                  className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                />
              </div>
            </div>
            {canMulti && (
              <div>
                <label className="block text-[9px] text-zinc-500">Período (opcional)</label>
                <input
                  value={p.period ?? ""}
                  onChange={(e) => updatePlan(i, { period: e.target.value })}
                  placeholder="30 dias · vitalicio · 3 meses..."
                  className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                />
              </div>
            )}
            {/* 30/07/2026 — descrição do plano. Só aparece pro cliente em
                MULTI-plano (comparação). Em single-plano o texto principal do
                bloco já explica o produto, uma segunda descrição só duplica. */}
            {canMulti && (
              <div>
                <label className="block text-[9px] text-zinc-500">
                  Descrição (opcional) —{" "}
                  <span className="text-zinc-600">
                    aparece pro cliente comparar
                  </span>
                </label>
                <textarea
                  value={p.description ?? ""}
                  onChange={(e) => updatePlan(i, { description: e.target.value })}
                  placeholder="O que esse plano oferece — ex: 4 vídeos + 5 fotos exclusivas"
                  rows={2}
                  maxLength={200}
                  className="nodrag w-full resize-none rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                />
              </div>
            )}
            {!isValid && p.amountCents > 0 && (
              <p className="text-[9px] text-red-300">Mínimo: R$ 2,00</p>
            )}
            {/* Bolinha "pagou #N" DESTE plano — só faz sentido quando existem
                2+ planos (aí cada um pode ter entregável diferente).
                Com 1 plano só, a bolinha `pagou` GENÉRICA (renderizada no
                PaymentNode) já basta — mostrar as duas junto polui o canvas e
                confunde o seller ("qual eu ligo?"). Runtime prioriza
                `upsell_${i}` quando existe; fallback pra `upsell` genérica. */}
            {canMulti && plans.length >= 2 && (
              <>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`upsell_${i}`}
                  className="!size-3.5 !border-2 !border-zinc-900"
                  style={{ background: PAID, right: -10 }}
                />
                <span
                  className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+16px)] whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
                  style={{ background: `${PAID}22`, color: PAID }}
                >
                  pagou #{i + 1}
                </span>
              </>
            )}
          </div>
        );
      })}
      {canMulti && (
        <button
          type="button"
          onClick={addPlan}
          disabled={plans.length >= 6}
          className="nodrag inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-cyan-400/25 bg-cyan-400/[0.05] px-2 py-1.5 text-[10px] font-medium text-cyan-300 hover:bg-cyan-400/[0.12] disabled:opacity-50"
        >
          <Plus className="size-3" /> Adicionar plano {plans.length >= 6 && "(máx 6)"}
        </button>
      )}
      {mode === "chat" && plans.length > 1 && (
        <p className="text-[9px] text-amber-300">
          ⚠ Modo Auto suporta só 1 plano — apenas o primeiro será usado.
        </p>
      )}
    </div>
  );
}

function PaymentNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as PaymentData;
  const { updateNodeData } = useReactFlow();
  const ctx = useContext(CheckoutContext);
  const checkouts = ctx?.checkouts ?? [];
  const host = ctx?.checkoutHost ?? "trilhopag.com";
  const [showPicker, setShowPicker] = useState(false);
  const mode: "button" | "chat" | "link" =
    d.mode === "link" ? "link" : d.mode === "chat" ? "chat" : "button";

  /**
   * 01/08/2026: quando o "não pagou" cai num bloco de reengajamento, os DOIS
   * relógios somam — este bloco espera X, o reengajamento espera o intervalo
   * dele antes da 1ª mensagem. Foi exatamente isso que confundiu o seller
   * ("coloquei 5 minutos ... nada de enviar"): ele contava só o de lá.
   * Ler o grafo aqui deixa a conta na cara, em vez de pedir pra ele somar.
   */
  const reengageAfter = useStore(
    (s) => {
      const alvo = s.edges.find(
        (e) => e.source === id && (e.sourceHandle ?? "") === "downsell",
      )?.target;
      if (!alvo) return null;
      const n = s.nodeLookup.get(alvo);
      if (!n || n.type !== "reengage") return null;
      const raw = Number((n.data as Record<string, unknown> | undefined)?.intervalMinutes);
      return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 30;
    },
  );

  // Modo LINK usa checkout escolhido; modos BUTTON/CHAT usam plans (ou
  // valor único no fallback single-plan).
  const linked = checkouts.find((c) => c.id === d.checkoutId);
  const amountCents = Math.round(Number(d.amountCents ?? d.priceCents ?? 0));

  function pickCheckout(c: BotFunnelCheckout) {
    updateNodeData(id, {
      ...d,
      mode: "link",
      checkoutId: c.id,
      checkoutSlug: c.slug,
      checkoutName: c.name,
      productName: c.productName,
      image: c.image,
      // no link mode o valor vem do próprio checkout
      amountCents: c.priceCents,
      checkoutHost: host,
    });
    setShowPicker(false);
  }

  return (
    <div
      className={cn(
        "relative w-[280px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-cyan-400/80 ring-2 ring-cyan-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500"
      />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-cyan-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
        <CreditCard className="size-3.5" /> Pagamento
      </div>
      <div className="space-y-2 p-2.5">
        {/* Selector de modo — 3 opções */}
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => updateNodeData(id, { ...d, mode: "button" })}
            className={cn(
              "nodrag rounded-md border px-1 py-1.5 text-[10px] font-medium transition",
              mode === "button"
                ? "border-cyan-400/60 bg-cyan-400/20 text-cyan-100"
                : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white",
            )}
            title="RECOMENDADO. Bot manda um botão. Cliente clica → PIX é gerado no chat."
          >
            🔘 Botão
          </button>
          <button
            type="button"
            onClick={() => updateNodeData(id, { ...d, mode: "chat" })}
            className={cn(
              "nodrag rounded-md border px-1 py-1.5 text-[10px] font-medium transition",
              mode === "chat"
                ? "border-cyan-400/60 bg-cyan-400/20 text-cyan-100"
                : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white",
            )}
            title="Gera PIX imediatamente (QR + copia-cola)."
          >
            💬 Auto
          </button>
          <button
            type="button"
            onClick={() => updateNodeData(id, { ...d, mode: "link" })}
            className={cn(
              "nodrag rounded-md border px-1 py-1.5 text-[10px] font-medium transition",
              mode === "link"
                ? "border-cyan-400/60 bg-cyan-400/20 text-cyan-100"
                : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white",
            )}
            title="Botão com link do checkout web (PIX + cartão + boleto)."
          >
            <Link2 className="inline size-2.5" /> Link
          </button>
        </div>

        {mode === "link" ? (
          /* MODO LINK: escolher checkout */
          linked || d.checkoutSlug ? (
            <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 p-2">
              <div className="flex items-center gap-2">
                {(linked?.image ?? d.image) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={linked?.image ?? d.image ?? ""} alt="" loading="lazy" decoding="async" className="size-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/[0.05]">
                    <Package className="size-4 text-zinc-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-white">
                    {linked?.name ?? d.checkoutName ?? "(checkout apagado)"}
                  </p>
                  <p className="truncate text-[10px] text-zinc-400">
                    {linked?.productName ?? d.productName ?? ""} · {formatBRL(linked?.priceCents ?? amountCents ?? 0)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="nodrag rounded-md border border-white/[0.08] px-1.5 py-1 text-[9px] text-zinc-300 hover:bg-white/[0.06]"
                >
                  Trocar
                </button>
              </div>
              {d.checkoutSlug && (
                <p className="mt-1 truncate text-[9px] text-zinc-500">
                  <ExternalLink className="inline size-2.5" /> {host}/c/{d.checkoutSlug}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-400/25 bg-cyan-400/[0.05] px-3 py-3 text-[11px] font-medium text-cyan-300 hover:bg-cyan-400/[0.10]"
            >
              <Plus className="size-3.5" /> Escolher checkout
            </button>
          )
        ) : (
          /* MODOS BUTTON/CHAT: só valor + nome (sem checkout).
             MODO BUTTON pode ter MÚLTIPLOS PLANOS — 1 botão por plano. */
          <PaymentPlansEditor
            data={d}
            onChange={(patch) => updateNodeData(id, { ...d, ...patch })}
          />
        )}

        {/* Mensagem opcional */}
        <textarea
          value={d.text ?? ""}
          onChange={(e) => updateNodeData(id, { ...d, text: e.target.value })}
          placeholder={
            mode === "chat"
              ? "Mensagem acima do PIX (opcional). Use {{nome}}, {{cupom}}."
              : mode === "button"
                ? "Mensagem acima do botão (opcional). Ex: '👇 Clica pra receber seu PIX'"
                : "Mensagem acima do botão (opcional)."
          }
          rows={2}
          className="nodrag w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
        />

        {(mode === "link" || mode === "button") && (
          <input
            value={d.buttonLabel ?? ""}
            onChange={(e) => updateNodeData(id, { ...d, buttonLabel: e.target.value })}
            placeholder={
              mode === "button"
                ? "Label do botão (default: 🛒 Pagar agora)"
                : "Label do botão (default: 🛒 Comprar agora)"
            }
            className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
          />
        )}

        <p className="text-[9px] leading-snug text-zinc-500">
          {mode === "button"
            ? "Cliente clica no botão → QR + PIX no chat. Conecte pagou / não-pagou pra pós-compra."
            : mode === "chat"
              ? "QR + PIX aparecem direto. Conecte pagou / não-pagou pra pós-compra."
              : "Manda link do checkout (PIX+cartão+boleto). Segue por next."}
        </p>

        {/* Prazo do "não pagou".
            01/08/2026 (seller: "coloquei uma caixinha de reengajamento pra
            enviar 5 minutos depois que o lead n pagou ... deixei durante o dia
            todo e nada de enviar"). Antes esse ramo dependia da adquirente
            avisar que o PIX venceu — e nenhuma avisa, então nunca disparava.
            Agora o próprio bloco marca a hora de desistir. */}
        {(mode === "chat" || mode === "button") && (
          <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 px-2.5 py-2">
            <span className="text-[10px] font-semibold" style={{ color: UNPAID }}>
              ⏳ Desistir e sair por “não pagou”
            </span>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={4320}
                value={d.unpaidAfterMinutes ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const n = Math.round(Number(v));
                  updateNodeData(id, {
                    ...d,
                    unpaidAfterMinutes:
                      v === "" || !Number.isFinite(n) || n <= 0
                        ? undefined
                        : Math.min(4320, Math.max(1, n)),
                  });
                }}
                placeholder="10"
                className="nodrag w-20 rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
              />
              <span className="text-[10px] text-zinc-400">
                minutos depois de enviar o PIX
              </span>
            </div>
            {reengageAfter !== null && (
              <p className="mt-1.5 rounded-md bg-amber-400/[0.08] px-2 py-1.5 text-[9px] leading-snug text-amber-200/90">
                ⚠️ Os dois relógios SOMAM. Este bloco espera{" "}
                <b>{d.unpaidAfterMinutes ?? 10} min</b>, e só então o
                reengajamento começa a contar os <b>{reengageAfter} min</b> dele.
                A 1ª mensagem chega{" "}
                <b>{(d.unpaidAfterMinutes ?? 10) + reengageAfter} min</b> depois
                do PIX.
              </p>
            )}
            <p className="mt-1 text-[9px] leading-snug text-zinc-500">
              Vazio = 10 min. Quem vai pagar PIX paga nos primeiros minutos;
              passou disso, esfriou. O PIX continua válido (1h) — se pagar
              depois, a entrega sai igual. Máximo 3 dias.
            </p>
          </div>
        )}

        {/* Order Bump (só modo button — cliente clica no plano e é oferecido) */}
        {mode === "button" && (
          <OrderBumpEditor
            data={d}
            onChange={(patch) => updateNodeData(id, { ...d, ...patch })}
          />
        )}

        {/* Personalização visual da mensagem do PIX (modos button + chat).
            Com 2+ planos vira uma aba por plano — ver PixPersonalizationSection. */}
        {mode !== "link" && (
          <PixPersonalizationSection
            nodeId={id}
            data={d}
            mode={mode}
            onChange={(patch) => updateNodeData(id, { ...d, ...patch })}
          />
        )}
      </div>

      {/* Handles de saída dependem do modo. `button` e `chat` compartilham
          upsell/downsell (ambos terminam gerando PIX + pausam). Só `link`
          usa `next`.

          29/07/2026: quando o bloco tem 2+ planos, o `pagou` genérico é
          substituído pelas bolinhas por plano (dentro de PaymentPlansEditor).
          Um plano só = bolinha genérica basta. Funis antigos com o `pagou`
          genérico conectado ganham migração automática no hydrateEdges. */}
      {mode === "chat" || mode === "button" ? (
        <>
          {!(mode === "button" && Array.isArray(d.plans) && d.plans.length >= 2) && (
            <>
              <Handle
                type="source"
                position={Position.Right}
                id="upsell"
                className="!size-3.5 !border-2 !border-zinc-900"
                style={{ background: PAID }}
              />
              <span
                className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+10px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
                style={{ background: `${PAID}22`, color: PAID }}
              >
                pagou
              </span>
            </>
          )}
          <Handle
            type="source"
            position={Position.Bottom}
            id="downsell"
            className="!size-3.5 !border-2 !border-zinc-900"
            style={{ background: UNPAID }}
          />
          <span
            className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+8px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
            style={{ background: `${UNPAID}22`, color: UNPAID }}
          >
            não pagou
          </span>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          className="!size-3.5 !border-2 !border-zinc-900"
          style={{ background: NEXT }}
        />
      )}

      {showPicker && (
        <CheckoutPickerModal
          checkouts={checkouts}
          onPick={pickCheckout}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function CheckoutPickerModal({
  checkouts,
  onPick,
  onClose,
}: {
  checkouts: BotFunnelCheckout[];
  onPick: (c: BotFunnelCheckout) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const filtered = checkouts.filter(
    (c) =>
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.productName.toLowerCase().includes(q.toLowerCase()),
  );
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-zinc-900/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-white">Escolher checkout</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-white/[0.06]">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5">
            <Search className="size-3.5 text-zinc-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por checkout ou produto…"
              className="w-full bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-zinc-500">
                {checkouts.length === 0
                  ? "Você não tem checkouts ativos. Crie um em Produtos."
                  : "Nada na busca."}
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onPick(c)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-left hover:border-cyan-400/40 hover:bg-white/[0.04]"
                >
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" loading="lazy" decoding="async" className="size-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                      <Package className="size-4 text-zinc-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{c.name}</p>
                    <p className="truncate text-[11px] text-zinc-400">
                      {c.productName} · {formatBRL(c.priceCents)}
                    </p>
                    <p className="mt-0.5 truncate text-[9px] text-zinc-600">/c/{c.slug}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* --------------- WAIT (delay longo, horas/dias) ---------------
 * 22/07/2026 (davi fase 2): reengajamento. Ex: cliente entrou no funil, gerou
 * PIX, não pagou. Depois de 2h/24h/48h o cron acorda a conversa e continua
 * pelo próximo bloco (ex: "vi que ficou de fora, tá 30% off só hoje").
 */
/* ------------------- REENGAJAMENTO (mensagens recorrentes) -----------------
 * 29/07/2026 (davi: "retire a opção de esperar (reengajamento) e adicione uma
 * nova opção de reengajamento onde o bot vai mandar mensagens automatizadas de
 * tempos em tempos, por exemplo 6 em 6 horas, e possa ser configurado pro tempo
 * que quiser e escolher se a mensagem irá ser mandada juntamente de uma imagem
 * ou vídeo ou apenas a mensagem solo" + "RETIRE ESSA OPÇÃO DALI E BOTE TUDO
 * DENTRO DO FLUXO DO BOT, É PARA ESTAR TUDO ALI").
 *
 * Substituiu o bloco `wait` (que só dormia) e absorveu a aba Broadcast, que
 * era uma tela separada com mensagem + imagem + botão de link. Agora tudo isso
 * mora aqui dentro, no mesmo canvas do funil.
 */
type ReengageMsg = {
  text: string;
  url?: string;
  kind?: "image" | "video" | "";
  filename?: string;
  btnLabel?: string;
  btnUrl?: string;
};
type ReengageData = {
  intervalMinutes: number;
  loop: boolean;
  messages: ReengageMsg[];
};

/** Mesmo teto do runtime (bot-funnel-runtime.ts). */
const REENGAGE_MAX_MSGS = 6;

function humanizeMinutes(m: number): string {
  if (m < 60) return `${m}min`;
  if (m < 60 * 24) return `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)}h`;
  return `${(m / (60 * 24)).toFixed(m % (60 * 24) === 0 ? 0 : 1)}d`;
}

const REENGAGE_PRESETS = [
  { m: 60, l: "1h" },
  { m: 180, l: "3h" },
  { m: 360, l: "6h" },
  { m: 720, l: "12h" },
  { m: 1440, l: "24h" },
  { m: 2880, l: "48h" },
];

function ReengageNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ReengageData;
  const { updateNodeData } = useReactFlow();
  const interval = Number.isFinite(d.intervalMinutes) ? Number(d.intervalMinutes) : 360;
  const msgs: ReengageMsg[] =
    Array.isArray(d.messages) && d.messages.length > 0 ? d.messages : [{ text: "", kind: "" }];

  const setMsgs = (next: ReengageMsg[]) => updateNodeData(id, { messages: next });
  const patch = (i: number, p: Partial<ReengageMsg>) =>
    setMsgs(msgs.map((m, idx) => (idx === i ? { ...m, ...p } : m)));

  return (
    <div
      className={cn(
        "w-[300px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected
          ? "border-indigo-400/80 ring-2 ring-indigo-400/20"
          : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-indigo-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
        <Repeat className="size-3.5" /> Reengajamento
      </div>

      <div className="space-y-2.5 p-2.5">
        {/* --- intervalo --- */}
        <div>
          <label className="mb-1 block text-[10px] text-zinc-400">
            Mandar 1 mensagem a cada
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={5}
              max={60 * 24 * 30}
              value={interval}
              onChange={(e) =>
                updateNodeData(id, {
                  intervalMinutes: Math.max(
                    5,
                    Math.min(60 * 24 * 30, Number(e.target.value) || 360),
                  ),
                })
              }
              className="nodrag w-20 rounded-lg border border-white/[0.08] bg-zinc-950 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
            />
            <span className="text-[10px] text-zinc-500">
              minutos = <strong className="text-indigo-300">{humanizeMinutes(interval)}</strong>
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-6 gap-1">
            {REENGAGE_PRESETS.map((p) => (
              <button
                key={p.m}
                type="button"
                onClick={() => updateNodeData(id, { intervalMinutes: p.m })}
                className={cn(
                  "nodrag rounded-md border px-1 py-1 text-[10px] transition",
                  interval === p.m
                    ? "border-indigo-400/50 bg-indigo-400/[0.15] text-indigo-200"
                    : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white",
                )}
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {/* --- sequência de mensagens --- */}
        <div className="space-y-2">
          {msgs.map((m, i) => {
            const kind = m.kind === "image" || m.kind === "video" ? m.kind : "";
            return (
              <div
                key={i}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-2"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-indigo-300">
                    {i + 1}ª · em {humanizeMinutes(interval * (i + 1))}
                  </span>
                  {msgs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMsgs(msgs.filter((_, idx) => idx !== i))}
                      className="nodrag rounded-full p-0.5 text-zinc-500 hover:bg-white/[0.06] hover:text-red-300"
                      title="Remover mensagem"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* solo / imagem / vídeo */}
                <div className="mb-1.5 grid grid-cols-3 gap-1">
                  {(
                    [
                      { k: "", l: "Só texto", Icon: MessageCircle },
                      { k: "image", l: "Imagem", Icon: ImageIcon },
                      { k: "video", l: "Vídeo", Icon: Video },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => patch(i, { kind: opt.k, url: "", filename: undefined })}
                      className={cn(
                        "nodrag flex items-center justify-center gap-1 rounded-md border px-1 py-1 text-[9px] transition",
                        kind === opt.k
                          ? "border-indigo-400/50 bg-indigo-400/[0.15] text-indigo-200"
                          : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white",
                      )}
                    >
                      <opt.Icon className="size-3" /> {opt.l}
                    </button>
                  ))}
                </div>

                {kind !== "" && (
                  <div className="mb-1.5">
                    <MediaField
                      url={m.url ?? ""}
                      filename={m.filename}
                      kind={kind}
                      accept={
                        kind === "image"
                          ? "image/jpeg,image/png,image/webp,image/heic"
                          : "video/mp4,video/webm,video/quicktime"
                      }
                      onChange={(url, filename) => patch(i, { url, filename })}
                    />
                  </div>
                )}

                <textarea
                  value={m.text ?? ""}
                  onChange={(e) => patch(i, { text: e.target.value })}
                  placeholder={
                    kind === ""
                      ? "Texto da mensagem — use {{nome}}, <b>negrito</b>"
                      : "Legenda da mídia (opcional)"
                  }
                  rows={2}
                  className="nodrag w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-950 px-2 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
                />

                {/* botão de link opcional (o que a aba Broadcast fazia) */}
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <input
                    value={m.btnLabel ?? ""}
                    onChange={(e) => patch(i, { btnLabel: e.target.value })}
                    placeholder="Botão (opcional)"
                    className="nodrag rounded-lg border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
                  />
                  <input
                    value={m.btnUrl ?? ""}
                    onChange={(e) => patch(i, { btnUrl: e.target.value })}
                    placeholder="https://…"
                    className="nodrag rounded-lg border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
                  />
                </div>
              </div>
            );
          })}

          {msgs.length < REENGAGE_MAX_MSGS && (
            <button
              type="button"
              onClick={() => setMsgs([...msgs, { text: "", kind: "" }])}
              className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-indigo-400/30 bg-indigo-400/[0.04] px-2 py-1.5 text-[10px] text-indigo-300 hover:bg-indigo-400/[0.10]"
            >
              <Plus className="size-3" /> Adicionar mensagem
            </button>
          )}
        </div>

        {/* --- repetir --- */}
        <label className="nodrag flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1.5">
          <input
            type="checkbox"
            checked={d.loop === true}
            onChange={(e) => updateNodeData(id, { loop: e.target.checked })}
            className="mt-0.5 size-3 accent-indigo-400"
          />
          <span className="text-[10px] leading-snug text-zinc-400">
            Repetir a sequência do começo quando acabar{" "}
            <span className="text-zinc-600">(para em 30 envios)</span>
          </span>
        </label>

        <p className="text-[9px] leading-snug text-zinc-500">
          A 1ª sai <strong>{humanizeMinutes(interval)}</strong> depois que o cliente chega
          aqui. Quem <strong>responde, clica ou paga</strong> sai do ciclo na hora. No fim,
          o funil segue pelo <span style={{ color: NEXT }}>próximo</span>.
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

/* --------------- INPUT (captura resposta livre) ---------------
 * Bot faz uma pergunta, cliente responde texto, resposta vira variável
 * ({{resposta_1}}, {{email_cliente}}, etc). Pode ramificar por palavra-chave.
 */
type InputData = {
  prompt: string;
  varName: string;
  keywords?: Array<{ word: string }>;
};

function InputNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as InputData;
  const { updateNodeData } = useReactFlow();
  const keywords = Array.isArray(d.keywords) ? d.keywords : [];

  function setKw(i: number, word: string) {
    const next = keywords.map((k, j) => (j === i ? { word } : k));
    updateNodeData(id, { ...d, keywords: next });
  }
  function addKw() {
    if (keywords.length >= 5) return;
    updateNodeData(id, { ...d, keywords: [...keywords, { word: "" }] });
  }
  function rmKw(i: number) {
    updateNodeData(id, { ...d, keywords: keywords.filter((_, j) => j !== i) });
  }

  return (
    <div
      className={cn(
        "w-[280px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected
          ? "border-teal-400/80 ring-2 ring-teal-400/20"
          : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-teal-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-teal-300">
        <MessageSquareText className="size-3.5" /> Resposta livre
      </div>
      <div className="space-y-2 p-2.5">
        <textarea
          value={d.prompt ?? ""}
          onChange={(e) => updateNodeData(id, { ...d, prompt: e.target.value })}
          placeholder="Pergunta pro cliente (ex: qual seu principal desejo?)"
          rows={2}
          className="nodrag w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-400/40"
        />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500">Salva em:</span>
          <code className="text-[10px] text-teal-300">{"{{"}</code>
          <input
            value={d.varName ?? "resposta_1"}
            onChange={(e) => updateNodeData(id, { ...d, varName: e.target.value.replace(/[^a-z0-9_]/gi, "") })}
            className="nodrag flex-1 rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-0.5 text-[11px] font-mono text-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-400/40"
          />
          <code className="text-[10px] text-teal-300">{"}}"}</code>
        </div>
        <p className="text-[9px] leading-snug text-zinc-500">
          Ramifique por <strong>palavra-chave</strong> (opcional). Se nada bater, segue por "next".
        </p>
        {keywords.map((k, i) => (
          <div key={i} className="relative flex items-center gap-1.5">
            <span className="w-3 shrink-0 text-center text-[9px] font-bold text-teal-300/80">
              {i + 1}
            </span>
            <input
              value={k.word}
              onChange={(e) => setKw(i, e.target.value)}
              placeholder="palavra-chave (contém)"
              className="nodrag flex-1 rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-400/40"
            />
            <button
              type="button"
              onClick={() => rmKw(i)}
              className="nodrag rounded-full p-0.5 text-zinc-500 hover:bg-white/[0.06] hover:text-red-300"
            >
              <X className="size-3" />
            </button>
            {/* Handle DENTRO da linha (mesma correção de buttons/poll/random).
                CSS default centra na altura EXATA da linha; `right: -10`
                empurra pra borda do node (p-2.5 no wrapper externo). */}
            <Handle
              type="source"
              position={Position.Right}
              id={`kw_${i}`}
              className="!size-3 !border-2 !border-zinc-900"
              style={{ background: "#2dd4bf", right: -10 }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addKw}
          disabled={keywords.length >= 5}
          className="nodrag inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-teal-400/25 bg-teal-400/[0.05] px-2 py-1.5 text-[10px] font-medium text-teal-300 hover:bg-teal-400/[0.12] disabled:opacity-50"
        >
          <Plus className="size-3" /> Palavra-chave {keywords.length >= 5 && "(máx 5)"}
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT, bottom: 12, top: "auto" }}
      />
    </div>
  );
}

/* --------------- INACTIVITY (detectar cliente sumido) ---------------
 * 30/07/2026 (seller: "altere esse bloco deixe de ser resposta livre e seja
 * apenas (reengajar ao ficar inativo) e faça um bloco novo para resposta
 * livre"). Bloco autônomo: cliente chega, dorme X min esperando qualquer
 * interação. Se falar algo antes → sai por `respondeu`. Se sumir → sai
 * por `inativo`. Coloque na frente de um bloco de decisão pra pegar quem
 * some antes de escolher. */
type InactivityData = { minutes: number };

function InactivityNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as InactivityData;
  const { updateNodeData } = useReactFlow();
  const mins = Number.isFinite(d.minutes) ? Number(d.minutes) : 30;

  return (
    <div
      className={cn(
        "w-[260px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected
          ? "border-amber-400/80 ring-2 ring-amber-400/20"
          : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-amber-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        <Timer className="size-3.5" /> Inatividade
      </div>
      <div className="space-y-2 p-2.5">
        <label className="block text-[10px] text-zinc-400">
          Esperar até <strong className="text-amber-300">{humanizeMinutes(mins)}</strong> por interação
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={60 * 24 * 30}
            value={mins}
            onChange={(e) =>
              updateNodeData(id, {
                minutes: Math.max(1, Math.min(60 * 24 * 30, Number(e.target.value) || 30)),
              })
            }
            className="nodrag w-20 rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
          <span className="text-[10px] text-zinc-500">minutos</span>
        </div>
        <p className="text-[9px] leading-snug text-zinc-500">
          Cliente falar/clicar/pagar antes → sai por{" "}
          <span style={{ color: NEXT }}>respondeu</span>. Sumir → sai por{" "}
          <span className="text-amber-300">inativo</span> (plugue um reengajamento).
        </p>
      </div>
      {/* Bolinha "respondeu" (next) — cliente interagiu antes do timeout */}
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT, bottom: 40, top: "auto" }}
      />
      <span
        className="pointer-events-none absolute right-0 translate-x-[calc(100%+10px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase whitespace-nowrap"
        style={{ background: `${NEXT}22`, color: NEXT, bottom: 34 }}
      >
        respondeu
      </span>
      {/* Bolinha "inativo" — cron dispara depois de X min */}
      <Handle
        type="source"
        position={Position.Right}
        id="inactive"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: "#f59e0b", bottom: 12, top: "auto" }}
      />
      <span
        className="pointer-events-none absolute right-0 translate-x-[calc(100%+10px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase whitespace-nowrap"
        style={{
          background: "color-mix(in srgb, var(--tp-port-warn) 13%, transparent)",
          color: "var(--tp-port-warn)",
          bottom: 6,
        }}
      >
        inativo
      </span>
    </div>
  );
}

/* --------------- COUPON (gera cupom único) --------------- */

type CouponData = { varName: string; prefix?: string };

function CouponNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CouponData;
  const { updateNodeData } = useReactFlow();
  return (
    <div
      className={cn(
        "w-[240px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected
          ? "border-amber-400/80 ring-2 ring-amber-400/20"
          : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-amber-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        <Ticket className="size-3.5" /> Cupom (gerar)
      </div>
      <div className="space-y-2 p-2.5">
        <div>
          <label className="block text-[10px] text-zinc-400">Prefixo (opcional, 4 chars)</label>
          <input
            value={d.prefix ?? ""}
            onChange={(e) => updateNodeData(id, { ...d, prefix: e.target.value.toUpperCase().slice(0, 4) })}
            placeholder="ex: HOT"
            className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] font-mono text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
          />
        </div>
        <div>
          <label className="block text-[10px] text-zinc-400">Salvar em variável</label>
          <div className="flex items-center gap-1">
            <code className="text-[10px] text-amber-300">{"{{"}</code>
            <input
              value={d.varName ?? "cupom"}
              onChange={(e) => updateNodeData(id, { ...d, varName: e.target.value.replace(/[^a-z0-9_]/gi, "") })}
              className="nodrag flex-1 rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] font-mono text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
            />
            <code className="text-[10px] text-amber-300">{"}}"}</code>
          </div>
        </div>
        <p className="text-[9px] leading-snug text-zinc-500">
          Gera código único (~5 chars). Use <code className="text-amber-300">{"{{" + (d.varName ?? "cupom") + "}}"}</code> nas próximas mensagens.
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

/* --------------- CONDITION (branch yes/no) --------------- */

type ConditionData = {
  kind: "language" | "variable" | "variable_contains";
  equalsIn?: string;
  varName?: string;
  equals?: string;
  contains?: string;
};

function ConditionNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ConditionData;
  const { updateNodeData } = useReactFlow();
  const kind = d.kind ?? "language";

  return (
    <div
      className={cn(
        "relative w-[260px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected
          ? "border-rose-400/80 ring-2 ring-rose-400/20"
          : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-rose-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
        <GitBranch className="size-3.5" /> Condição
      </div>
      <div className="space-y-2 p-2.5">
        <select
          value={kind}
          onChange={(e) => updateNodeData(id, { ...d, kind: e.target.value })}
          className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none"
        >
          <option value="language">🌎 Idioma do cliente</option>
          <option value="variable">🔡 Variável = valor</option>
          <option value="variable_contains">📎 Variável contém texto</option>
        </select>
        {kind === "language" && (
          <div>
            <label className="block text-[10px] text-zinc-400">Aceita se idioma for (separe por vírgula)</label>
            <input
              value={d.equalsIn ?? "pt,pt-BR"}
              onChange={(e) => updateNodeData(id, { ...d, equalsIn: e.target.value })}
              placeholder="pt,pt-BR"
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-rose-400/40"
            />
            <p className="mt-0.5 text-[9px] text-zinc-500">Prefixos aceitos (pt cobre pt-BR/pt-PT).</p>
          </div>
        )}
        {(kind === "variable" || kind === "variable_contains") && (
          <>
            <div>
              <label className="block text-[10px] text-zinc-400">Nome da variável</label>
              <input
                value={d.varName ?? "resposta_1"}
                onChange={(e) => updateNodeData(id, { ...d, varName: e.target.value.replace(/[^a-z0-9_]/gi, "") })}
                placeholder="resposta_1"
                className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-rose-400/40"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-400">
                {kind === "variable" ? "Deve ser igual a" : "Deve conter"}
              </label>
              <input
                value={kind === "variable" ? (d.equals ?? "") : (d.contains ?? "")}
                onChange={(e) =>
                  updateNodeData(id, kind === "variable" ? { ...d, equals: e.target.value } : { ...d, contains: e.target.value })
                }
                placeholder={kind === "variable" ? "sim" : "quero"}
                className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-rose-400/40"
              />
            </div>
          </>
        )}
        <p className="text-[9px] leading-snug text-zinc-500">
          <span className="text-cyan-300">yes</span> = bate · <span className="text-red-300">no</span> = senão
        </p>
      </div>
      {/* Handles yes/no */}
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: "#06b6d4" }}
      />
      <span
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+10px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
        style={{
          background: "color-mix(in srgb, var(--tp-port-ok) 13%, transparent)",
          color: "var(--tp-port-ok)",
        }}
      >
        yes
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: "#ef4444" }}
      />
      <span
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[calc(100%+8px)] rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
        style={{
          background: "color-mix(in srgb, var(--tp-port-bad) 13%, transparent)",
          color: "var(--tp-port-bad)",
        }}
      >
        no
      </span>
    </div>
  );
}

/* --------------- SOCIAL PROOF --------------- */

type SocialProofData = {
  mode: "counter" | "notification" | "both";
  hoursBack: number;
  counterTemplate?: string;
  notificationTemplate?: string;
};

function SocialProofNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as SocialProofData;
  const { updateNodeData } = useReactFlow();
  const mode = d.mode ?? "counter";
  return (
    <div
      className={cn(
        "w-[260px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-orange-400/80 ring-2 ring-orange-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-orange-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-orange-300">
        <Flame className="size-3.5" /> Prova social
      </div>
      <div className="space-y-2 p-2.5">
        <select
          value={mode}
          onChange={(e) => updateNodeData(id, { ...d, mode: e.target.value })}
          className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none"
        >
          <option value="counter">🔥 Contador (N pessoas compraram)</option>
          <option value="notification">🎉 Notificação (Fulano comprou)</option>
          <option value="both">Ambos</option>
        </select>
        <div>
          <label className="block text-[9px] text-zinc-500">Janela (horas atrás)</label>
          <input
            type="number"
            min={1}
            max={72}
            value={d.hoursBack ?? 24}
            onChange={(e) =>
              updateNodeData(id, {
                ...d,
                hoursBack: Math.max(1, Math.min(72, Number(e.target.value) || 24)),
              })
            }
            className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none"
          />
        </div>
        {(mode === "counter" || mode === "both") && (
          <div>
            <label className="block text-[9px] text-zinc-500">Template contador</label>
            <input
              value={d.counterTemplate ?? ""}
              onChange={(e) => updateNodeData(id, { ...d, counterTemplate: e.target.value })}
              placeholder="🔥 {count} pessoas compraram nas últimas {hours}h"
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
        )}
        {(mode === "notification" || mode === "both") && (
          <div>
            <label className="block text-[9px] text-zinc-500">Template notificação</label>
            <input
              value={d.notificationTemplate ?? ""}
              onChange={(e) => updateNodeData(id, { ...d, notificationTemplate: e.target.value })}
              placeholder="🎉 {name} acabou de comprar {product}"
              className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
        )}
        <p className="text-[9px] leading-snug text-zinc-500">
          Puxa vendas REAIS do seller. {"{count}"}, {"{hours}"}, {"{name}"}, {"{product}"}.
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

/* --------------- SCARCITY (escassez) --------------- */

type ScarcityData = {
  mode: "vagas" | "timer" | "both";
  vagas?: number;
  vagasTemplate?: string;
  expiresInMinutes?: number;
  expiresAt?: string;
  timerTemplate?: string;
};

function ScarcityNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ScarcityData;
  const { updateNodeData } = useReactFlow();
  const mode = d.mode ?? "vagas";
  return (
    <div
      className={cn(
        "w-[260px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-red-400/80 ring-2 ring-red-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-red-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-red-300">
        <Timer className="size-3.5" /> Escassez / Urgência
      </div>
      <div className="space-y-2 p-2.5">
        <select
          value={mode}
          onChange={(e) => updateNodeData(id, { ...d, mode: e.target.value })}
          className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none"
        >
          <option value="vagas">⚡ Vagas (N restantes)</option>
          <option value="timer">⏰ Timer (X min até expirar)</option>
          <option value="both">Ambos</option>
        </select>
        {(mode === "vagas" || mode === "both") && (
          <>
            <div>
              <label className="block text-[9px] text-zinc-500">Vagas restantes</label>
              <input
                type="number"
                min={1}
                value={d.vagas ?? 5}
                onChange={(e) => updateNodeData(id, { ...d, vagas: Math.max(1, Number(e.target.value) || 5) })}
                className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[9px] text-zinc-500">Template vagas</label>
              <input
                value={d.vagasTemplate ?? ""}
                onChange={(e) => updateNodeData(id, { ...d, vagasTemplate: e.target.value })}
                placeholder="⚡ Restam apenas {n} vagas!"
                className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          </>
        )}
        {(mode === "timer" || mode === "both") && (
          <>
            <div>
              <label className="block text-[9px] text-zinc-500">Expira em (min a partir de agora)</label>
              <input
                type="number"
                min={1}
                value={d.expiresInMinutes ?? 60}
                onChange={(e) =>
                  updateNodeData(id, { ...d, expiresInMinutes: Math.max(1, Number(e.target.value) || 60) })
                }
                className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[9px] text-zinc-500">Template timer</label>
              <input
                value={d.timerTemplate ?? ""}
                onChange={(e) => updateNodeData(id, { ...d, timerTemplate: e.target.value })}
                placeholder="⏰ Oferta termina em {time}"
                className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[10px] text-white placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          </>
        )}
        <p className="text-[9px] leading-snug text-zinc-500">
          Placeholders: {"{n}"} · {"{time}"}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

/* --------------- TAG (adiciona tag ao chat) --------------- */

type TagData = {
  action: "add" | "remove";
  tags: string[];
};

function TagNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TagData;
  const { updateNodeData } = useReactFlow();
  const action = d.action ?? "add";
  const tags = Array.isArray(d.tags) ? d.tags : [];
  const tagsStr = tags.join(", ");
  return (
    <div
      className={cn(
        "w-[240px] rounded-2xl border bg-zinc-900/95 shadow-xl backdrop-blur transition",
        selected ? "border-pink-400/80 ring-2 ring-pink-400/20" : "border-white/[0.1] hover:border-white/20",
      )}
    >
      <Handle type="target" position={Position.Left} id="in" className="!size-3 !border-2 !border-zinc-900 !bg-zinc-500" />
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-white/[0.06] bg-pink-400/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-pink-300">
        <Hash className="size-3.5" /> Tag (segmentação)
      </div>
      <div className="space-y-2 p-2.5">
        <select
          value={action}
          onChange={(e) => updateNodeData(id, { ...d, action: e.target.value })}
          className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] text-white focus:outline-none"
        >
          <option value="add">➕ Adicionar tags</option>
          <option value="remove">➖ Remover tags</option>
        </select>
        <div>
          <label className="block text-[9px] text-zinc-500">Tags (separar por vírgula)</label>
          <input
            value={tagsStr}
            onChange={(e) =>
              updateNodeData(id, {
                ...d,
                tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
              })
            }
            placeholder="vip, black_friday, abandonou"
            className="nodrag w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2 py-1 text-[11px] font-mono text-pink-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
        <p className="text-[9px] leading-snug text-zinc-500">
          Marca o chat pra você filtrar/segmentar depois. Ex: tag {'"vip"'} em quem
          clicou no plano caro.
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="next"
        className="!size-3.5 !border-2 !border-zinc-900"
        style={{ background: NEXT }}
      />
    </div>
  );
}

const nodeTypes = {
  message: MessageNode,
  botproduct: BotProductNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  gif: GifNode,
  delay: DelayNode,
  buttons: ButtonsNode,
  poll: PollNode,
  location: LocationNode,
  random: RandomNode,
  payment: PaymentNode,
  reengage: ReengageNode,
  input: InputNode,
  inactivity: InactivityNode,
  coupon: CouponNode,
  condition: ConditionNode,
  social_proof: SocialProofNode,
  scarcity: ScarcityNode,
  tag: TagNode,
};

type BlockKind =
  | "message"
  | "image"
  | "video"
  | "audio"
  | "gif"
  | "delay"
  | "buttons"
  | "poll"
  | "location"
  | "random"
  | "payment"
  | "reengage"
  | "input"
  | "inactivity"
  | "coupon"
  | "condition"
  | "social_proof"
  | "scarcity"
  | "tag";

/**
 * 29/07/2026 (davi: "agora faça uma opção com que eu possa desconectar os
 * fios"). Antes o único jeito de desconectar era selecionar o fio (clicar
 * nele — nada indica que dá) e apertar Delete/Backspace. No celular era
 * impossível: nem teclado tem, e o fio some no meio de tantas linhas.
 *
 * Este edge custom herda o visual do smoothstep colorido de sempre, mas
 * põe um X pequeno flutuante bem no meio do fio. O X só aparece quando o
 * fio está selecionado ou com o mouse em cima — sem selection nem hover
 * fica invisível, senão poluia o canvas com N cliques-de-graça.
 *
 * Clicar no X:
 *  - stopPropagation() → não seleciona nem move o node do lado
 *  - setEdges filter → remove só ESSA aresta (mantém as outras)
 *
 * A tecla Delete/Backspace do desktop continua funcionando (ReactFlow já
 * cuida via `deleteKeyCode`), este X é o caminho tocável.
 */
function DeletableEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, selected } = props;
  /**
   * 30/07/2026 (davi: "Deixa todo o fluxo mais clean tambem, com animacoes
   * mov, as linhas uniformes e nao potilhadas, curvas, tudo bem clean e
   * moderno"). Trocado `getSmoothStepPath` (fios em ângulos retos, cara de
   * árvore de arquivos) por `getBezierPath` (curvas suaves de-um-lado-a-outro
   * — o padrão de canvas moderno tipo Figma/Miro).
   */
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    curvature: 0.35,
  });
  const { setEdges } = useReactFlow();
  const kind = String((data as { kind?: string } | undefined)?.kind ?? "next");

  /**
   * Fio selecionado: destaque com stroke maior + glow (drop-shadow) na cor
   * do próprio fio. Faz a peça saltar do canvas quando o seller acerta o
   * clique no fim mesmo com N linhas atravessadas.
   */
  const strokeColor = (style?.stroke as string | undefined) ?? NEXT;
  const activeStyle: React.CSSProperties = selected
    ? { ...style, strokeWidth: 4, filter: `drop-shadow(0 0 6px ${strokeColor})` }
    : (style ?? {});

  /**
   * 30/07/2026 (seller: "faça também com que os fios tenham animações
   * deixando o design mais dinâmico"). Partícula que percorre o path
   * infinitamente, na cor do próprio fio — dá a sensação de que o fluxo
   * está "vivo" mesmo em standby. Só nos fios coloridos (não no `next`
   * cinza padrão, pra não poluir o canvas quando tem 20 fios genéricos).
   */
  const shouldAnimate = kind !== "next";
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={activeStyle} />
      {shouldAnimate && (
        <circle
          r={selected ? 4 : 3}
          fill={strokeColor}
          opacity={0.9}
          style={{ filter: `drop-shadow(0 0 3px ${strokeColor})` }}
        >
          <animateMotion
            dur="2.2s"
            repeatCount="indefinite"
            path={path}
            rotate="auto"
          />
        </circle>
      )}
      {/* Label textual do fio (pagou / pagou #N / botão 2 / etc). Antes ficava
          nas props do edge; agora vai por aqui pra que fique no mesmo <g>
          selecionável e não conflite com o botão X. */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 14}px)`,
            pointerEvents: "none",
            background: "#18181b",
            color: getColorFromStyle(style),
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 6,
          }}
          className="nodrag nopan"
        >
          {labelForKind(kind)}
        </div>
        {/* Botão X — só aparece quando selecionado (o único caminho no
            desktop e mobile). Fica um pouco abaixo do label pra não colidir. */}
        {selected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEdges((eds) => eds.filter((x) => x.id !== id));
            }}
            aria-label="Desconectar fio"
            title="Desconectar fio"
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 10}px)`,
              pointerEvents: "all",
              width: 22,
              height: 22,
              borderRadius: 999,
              border: `2px solid ${getColorFromStyle(style)}`,
              background: "#0a0a0a",
              color: getColorFromStyle(style),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
              padding: 0,
              boxShadow: "0 4px 10px rgba(0,0,0,0.35)",
            }}
          >
            ✕
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

/** Extrai o stroke do style (pra o label/X herdarem a cor do fio). */
function getColorFromStyle(style: React.CSSProperties | undefined): string {
  const s = style?.stroke;
  return typeof s === "string" && s ? s : NEXT;
}

/** Rótulo humanizado por kind — mesma tabela usada no edgeStyle antigo. */
function labelForKind(kind: string): string {
  if (kind === "next") return "próximo";
  if (kind === "upsell") return "pagou";
  if (kind.startsWith("upsell_")) return `pagou #${Number(kind.slice(7)) + 1}`;
  if (kind === "downsell") return "não pagou";
  if (kind === "inactive") return "inativo";
  if (kind.startsWith("btn_")) return `botão ${Number(kind.slice(4)) + 1}`;
  if (kind.startsWith("poll_")) return String.fromCharCode(65 + Number(kind.slice(5)));
  if (kind.startsWith("rand_")) return String.fromCharCode(65 + Number(kind.slice(5)));
  if (kind.startsWith("kw_")) return `kw ${Number(kind.slice(3)) + 1}`;
  if (kind === "yes") return "yes";
  if (kind === "no") return "no";
  return kind;
}

const edgeTypes = { deletable: DeletableEdge };

function edgeStyle(kind: string): Partial<Edge> {
  // Só a cor entra aqui. O label é decidido pelo DeletableEdge (labelForKind)
  // pra ficar num único lugar — antes tinha duplicação label vs. labelForKind.
  let color = NEXT;
  if (kind === "upsell") color = PAID;
  else if (kind.startsWith("upsell_")) color = PAID;
  else if (kind === "downsell") color = UNPAID;
  else if (kind === "inactive") color = "#f59e0b";
  else if (kind.startsWith("btn_")) color = BTN_COLOR;
  else if (kind.startsWith("poll_")) color = POLL_COLOR;
  else if (kind.startsWith("rand_")) color = RAND_COLORS[Number(kind.slice(5))] ?? "#a1a1aa";
  else if (kind.startsWith("kw_")) color = "#2dd4bf";
  else if (kind === "yes") color = "#06b6d4";
  else if (kind === "no") color = "#ef4444";
  /**
   * 30/07/2026 (davi: "linhas uniformes e nao potilhadas, curvas, tudo bem
   * clean e moderno"). Removido `animated` — era ele que fazia todas as
   * saídas coloridas ficarem tracejadas animadas (dash rolling). Agora
   * todos os fios são traço SÓLIDO uniforme, cor por tipo (mesma paleta).
   * `strokeLinecap: round` termina o fio suave, sem quinas visíveis.
   * A curvatura vem do `getBezierPath` no DeletableEdge, não daqui.
   */
  return {
    type: "deletable",
    style: { stroke: color, strokeWidth: 2.5, strokeLinecap: "round" },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
  };
}

function defaultData(type: BlockKind): Record<string, unknown> {
  switch (type) {
    case "message":
      return { text: "" };
    case "delay":
      return { seconds: 2, action: "typing" };
    case "buttons":
      return { text: "Escolha uma opção:", buttons: [{ label: "Continuar", kind: "next" }] };
    case "poll":
      return { question: "Você tem interesse?", options: ["Sim", "Não"] };
    case "location":
      return { lat: -23.5505, lng: -46.6333, title: "", address: "" };
    case "random":
      return {};
    case "payment":
      // Default = modo "button" com 1 plano vazio pra o seller preencher.
      // Adicionar planos gera botões extras (multi-plano).
      return {
        mode: "button",
        plans: [{ amountCents: 0, title: "", period: "" }],
        amountCents: 0,
        productName: "",
        text: "",
        buttonLabel: "🛒 Pagar agora",
        showCopyButton: true,
        showQrButton: true,
        showVerifyButton: true,
      };
    case "reengage":
      // 6 em 6 horas é o exemplo que o davi deu — vira o default.
      return { intervalMinutes: 360, loop: false, messages: [{ text: "", kind: "" }] };
    case "input":
      return { prompt: "Responda com uma palavra:", varName: "resposta_1", keywords: [] };
    case "inactivity":
      // 30 min de default — meio caminho entre "vou testar" (5 min) e
      // "esqueceu de vez" (horas). O seller ajusta.
      return { minutes: 30 };
    case "coupon":
      return { varName: "cupom", prefix: "" };
    case "condition":
      return { kind: "language", equalsIn: "pt,pt-BR" };
    case "social_proof":
      return {
        mode: "counter",
        hoursBack: 24,
        counterTemplate: "🔥 <b>{count}</b> pessoas compraram nas últimas {hours}h",
        notificationTemplate: "🎉 <b>{name}</b> acabou de comprar {product}",
      };
    case "scarcity":
      return {
        mode: "vagas",
        vagas: 5,
        vagasTemplate: "⚡ Restam apenas <b>{n}</b> vagas!",
        expiresInMinutes: 60,
        timerTemplate: "⏰ Oferta termina em <b>{time}</b>",
      };
    case "tag":
      return { action: "add", tags: [] };
    default:
      return { url: "", caption: "", filename: undefined };
  }
}

function hydrateNodes(
  raw: unknown,
  products: BotFunnelProduct[],
  checkouts: BotFunnelCheckout[],
  checkoutHost: string,
): Node[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const checkoutById = new Map(checkouts.map((c) => [c.id, c]));
  const out: Node[] = [];
  for (const n of raw as Node[]) {
    const d = (n.data as Record<string, unknown>) ?? {};
    const pos = n.position ?? { x: 0, y: 0 };
    if (n.type === "message") {
      out.push({ id: n.id, type: "message", position: pos, data: { text: String(d.text ?? "") } });
    } else if (n.type === "botproduct") {
      const pid = d.productId as string | undefined;
      const p = pid ? byId.get(pid) : undefined;
      if (!p) continue;
      out.push({
        id: n.id,
        type: "botproduct",
        position: pos,
        data: { productId: p.id, name: p.name, image: p.image, price: p.priceCents },
      });
    } else if (n.type === "image" || n.type === "video" || n.type === "audio" || n.type === "gif") {
      out.push({
        id: n.id,
        type: n.type,
        position: pos,
        data: {
          url: String(d.url ?? ""),
          caption: String(d.caption ?? ""),
          filename: d.filename ? String(d.filename) : undefined,
          // Este normalizador RECONSTRÓI o data campo a campo — o que não
          // estiver aqui some ao recarregar a página. Só imagem/vídeo usam
          // (Telegram não agrupa áudio/GIF), mas guardo pra todos: é mais
          // barato que descobrir o bug depois.
          ...(d.groupWithNext === true ? { groupWithNext: true } : {}),
          ...(d.asMusic === true ? { asMusic: true } : {}),
          ...(d.audioTitle ? { audioTitle: String(d.audioTitle) } : {}),
        },
      });
    } else if (n.type === "delay") {
      const s = Number(d.seconds ?? 2);
      const a = d.action === "record_voice" ? "record_voice" : "typing";
      out.push({
        id: n.id,
        type: "delay",
        position: pos,
        data: {
          seconds: Math.min(30, Math.max(0.5, Number.isFinite(s) ? s : 2)),
          action: a,
        },
      });
    } else if (n.type === "buttons") {
      const rawBtns = Array.isArray(d.buttons) ? (d.buttons as unknown[]) : [];
      const buttons: ButtonEntry[] = rawBtns.slice(0, 8).map((b) => {
        const o = (b ?? {}) as Record<string, unknown>;
        const kind = o.kind === "url" ? "url" : "next";
        return {
          label: String(o.label ?? "Botão").slice(0, 64),
          kind,
          ...(kind === "url" ? { url: String(o.url ?? "") } : {}),
        };
      });
      out.push({
        id: n.id,
        type: "buttons",
        position: pos,
        data: {
          text: String(d.text ?? ""),
          buttons,
          // `showBack` só é gravado quando FALSE: o padrão é mostrar o
          // "Voltar", e assim os funis antigos ganham o botão sem migração.
          ...(d.showBack === false ? { showBack: false } : {}),
          ...(String(d.backLabel ?? "").trim()
            ? { backLabel: String(d.backLabel).slice(0, 64) }
            : {}),
        },
      });
    } else if (n.type === "poll") {
      const rawOpts = Array.isArray(d.options) ? (d.options as unknown[]) : [];
      const opts = rawOpts
        .map((o) => String(o ?? "").trim())
        .filter(Boolean)
        .slice(0, 10);
      out.push({
        id: n.id,
        type: "poll",
        position: pos,
        data: {
          question: String(d.question ?? ""),
          options: opts.length >= 2 ? opts : ["Sim", "Não"],
        },
      });
    } else if (n.type === "location") {
      out.push({
        id: n.id,
        type: "location",
        position: pos,
        data: {
          lat: Number(d.lat ?? -23.5505),
          lng: Number(d.lng ?? -46.6333),
          title: String(d.title ?? ""),
          address: String(d.address ?? ""),
        },
      });
    } else if (n.type === "random") {
      out.push({ id: n.id, type: "random", position: pos, data: {} });
    } else if (n.type === "payment") {
      const mode = d.mode === "link" ? "link" : d.mode === "chat" ? "chat" : "button";
      const cid = String(d.checkoutId ?? "");
      const linked = cid ? checkoutById.get(cid) : undefined;
      const legacyPrice = Number(d.priceCents ?? 0);
      const cur = Number(d.amountCents ?? 0);
      const amountCents =
        cur > 0
          ? cur
          : mode === "link"
            ? (linked?.priceCents ?? legacyPrice)
            : legacyPrice;
      // Hidrata plans (novo). Se ausente, sintetiza 1 plano do legacy
      // amountCents/productName.
      const rawPlans = Array.isArray(d.plans) ? (d.plans as unknown[]) : null;
      const plans: PaymentPlan[] | undefined = rawPlans
        ? rawPlans.slice(0, 6).map((raw) => {
            const p = (raw ?? {}) as Record<string, unknown>;
            return {
              amountCents: Math.round(Number(p.amountCents ?? 0)),
              title: String(p.title ?? ""),
              period: p.period !== undefined ? String(p.period) : "",
              description: p.description !== undefined ? String(p.description).slice(0, 200) : "",
            };
          })
        : undefined;
      out.push({
        id: n.id,
        type: "payment",
        position: pos,
        data: {
          mode,
          plans,
          amountCents,
          productName: String(d.productName ?? linked?.productName ?? d.checkoutName ?? ""),
          text: String(d.text ?? ""),
          buttonLabel: String(d.buttonLabel ?? (mode === "link" ? "🛒 Comprar agora" : "🛒 Pagar agora")),
          pixTitle: d.pixTitle !== undefined ? String(d.pixTitle) : undefined,
          pixInstruction: d.pixInstruction !== undefined ? String(d.pixInstruction) : undefined,
          pixHelp: d.pixHelp !== undefined ? String(d.pixHelp) : undefined,
          copyButtonLabel: d.copyButtonLabel !== undefined ? String(d.copyButtonLabel) : undefined,
          qrButtonLabel: d.qrButtonLabel !== undefined ? String(d.qrButtonLabel) : undefined,
          verifyButtonLabel: d.verifyButtonLabel !== undefined ? String(d.verifyButtonLabel) : undefined,
          showCopyButton: d.showCopyButton !== false,
          showQrButton: d.showQrButton !== false,
          showVerifyButton: d.showVerifyButton !== false,
          // Order bump (até 2 — o 2º só vale se o 1º estiver ligado, que é
          // a mesma regra do editor e do runtime)
          orderBumpEnabled: d.orderBumpEnabled === true,
          orderBumpTitle: d.orderBumpTitle !== undefined ? String(d.orderBumpTitle) : "",
          orderBumpAmountCents: Math.round(Number(d.orderBumpAmountCents ?? 0)),
          orderBumpPrompt: d.orderBumpPrompt !== undefined ? String(d.orderBumpPrompt) : undefined,
          orderBump2Enabled: d.orderBumpEnabled === true && d.orderBump2Enabled === true,
          orderBump2Title: d.orderBump2Title !== undefined ? String(d.orderBump2Title) : "",
          orderBump2AmountCents: Math.round(Number(d.orderBump2AmountCents ?? 0)),
          orderBump2Prompt: d.orderBump2Prompt !== undefined ? String(d.orderBump2Prompt) : undefined,
          checkoutId: cid,
          checkoutSlug: linked?.slug ?? String(d.checkoutSlug ?? ""),
          checkoutName: linked?.name ?? String(d.checkoutName ?? ""),
          image: linked?.image ?? (d.image as string | null) ?? null,
          checkoutHost,
        },
      });
    } else if (n.type === "reengage" || n.type === "wait") {
      // `wait` é o bloco antigo (só dormia e seguia). Em vez de sumir do
      // canvas e arrebentar as arestas do seller, ele vira um reengajamento
      // com o mesmo intervalo — sem mensagem, esperando o seller preencher.
      const raw = Number(d.intervalMinutes ?? d.minutes ?? 360);
      const list = Array.isArray(d.messages) ? (d.messages as unknown[]) : [];
      const messages = list.slice(0, REENGAGE_MAX_MSGS).map((item) => {
        const m = (item ?? {}) as Record<string, unknown>;
        const k = String(m.kind ?? "");
        return {
          text: String(m.text ?? ""),
          kind: k === "image" || k === "video" ? k : "",
          url: String(m.url ?? ""),
          filename: m.filename !== undefined ? String(m.filename) : undefined,
          btnLabel: String(m.btnLabel ?? ""),
          btnUrl: String(m.btnUrl ?? ""),
        };
      });
      out.push({
        id: n.id,
        type: "reengage",
        position: pos,
        data: {
          intervalMinutes: Math.max(
            5,
            Math.min(60 * 24 * 30, Number.isFinite(raw) ? Math.round(raw) : 360),
          ),
          loop: d.loop === true,
          messages: messages.length > 0 ? messages : [{ text: "", kind: "" }],
        },
      });
    } else if (n.type === "input") {
      const kws = Array.isArray(d.keywords)
        ? (d.keywords as unknown[])
            .slice(0, 5)
            .map((k) => ({ word: String((k as { word?: string })?.word ?? "").trim() }))
        : [];
      // Funis salvos entre 30/07 manhã (input com inactivityMinutes) e 30/07
      // tarde (bloco `inactivity` separado): se um input trouxer o campo,
      // migra pra um bloco inactivity separado logo depois. Aqui só descarta
      // o campo — a migração de edges/nodes fica no serialize/hydrateEdges.
      out.push({
        id: n.id,
        type: "input",
        position: pos,
        data: {
          prompt: String(d.prompt ?? ""),
          varName: String(d.varName ?? "resposta_1").replace(/[^a-z0-9_]/gi, "") || "resposta_1",
          keywords: kws,
        },
      });
    } else if (n.type === "inactivity") {
      const m = Number(d.minutes ?? 30);
      out.push({
        id: n.id,
        type: "inactivity",
        position: pos,
        data: { minutes: Math.max(1, Math.min(60 * 24 * 30, Number.isFinite(m) ? m : 30)) },
      });
    } else if (n.type === "coupon") {
      out.push({
        id: n.id,
        type: "coupon",
        position: pos,
        data: {
          varName: String(d.varName ?? "cupom").replace(/[^a-z0-9_]/gi, "") || "cupom",
          prefix: String(d.prefix ?? "").toUpperCase().slice(0, 4),
        },
      });
    } else if (n.type === "condition") {
      const k = d.kind === "variable" || d.kind === "variable_contains" ? d.kind : "language";
      out.push({
        id: n.id,
        type: "condition",
        position: pos,
        data: {
          kind: k,
          equalsIn: String(d.equalsIn ?? "pt,pt-BR"),
          varName: String(d.varName ?? "resposta_1"),
          equals: String(d.equals ?? ""),
          contains: String(d.contains ?? ""),
        },
      });
    } else if (n.type === "social_proof") {
      const m = d.mode === "notification" || d.mode === "both" ? d.mode : "counter";
      out.push({
        id: n.id,
        type: "social_proof",
        position: pos,
        data: {
          mode: m,
          hoursBack: Math.max(1, Math.min(72, Number(d.hoursBack ?? 24))),
          counterTemplate: d.counterTemplate !== undefined ? String(d.counterTemplate) : undefined,
          notificationTemplate: d.notificationTemplate !== undefined ? String(d.notificationTemplate) : undefined,
        },
      });
    } else if (n.type === "scarcity") {
      const m = d.mode === "timer" || d.mode === "both" ? d.mode : "vagas";
      out.push({
        id: n.id,
        type: "scarcity",
        position: pos,
        data: {
          mode: m,
          vagas: Math.max(1, Math.min(9999, Number(d.vagas ?? 5))),
          vagasTemplate: d.vagasTemplate !== undefined ? String(d.vagasTemplate) : undefined,
          expiresInMinutes: Math.max(1, Number(d.expiresInMinutes ?? 60)),
          expiresAt: d.expiresAt !== undefined ? String(d.expiresAt) : undefined,
          timerTemplate: d.timerTemplate !== undefined ? String(d.timerTemplate) : undefined,
        },
      });
    } else if (n.type === "tag") {
      const rawTags = Array.isArray(d.tags) ? (d.tags as unknown[]) : [];
      out.push({
        id: n.id,
        type: "tag",
        position: pos,
        data: {
          action: d.action === "remove" ? "remove" : "add",
          tags: rawTags.map((t) => String(t ?? "").trim()).filter(Boolean),
        },
      });
    }
  }
  return out;
}

function hydrateEdges(raw: unknown, nodes?: unknown): Edge[] {
  if (!Array.isArray(raw)) return [];

  /**
   * 29/07/2026: funis salvos ANTES do refactor tinham 1 bolinha `pagou`
   * global no bloco `payment`. Agora, quando o bloco tem 2+ planos, essa
   * bolinha global sumiu — foi substituída por N bolinhas por plano
   * (`upsell_0`, `upsell_1`, ...). Pra não deixar edges órfãs (linha
   * pendurada no nada), migro os edges `upsell` cujo source é um payment
   * com 2+ planos pra `upsell_0` (plano #1 herda o comportamento antigo).
   * Os outros planos ficam sem upsell configurado; o seller conecta se
   * quiser fluxos diferentes.
   *
   * Runtime já tinha fallback (`upsell_${i}` → `upsell`), então o edge
   * antigo também continuava funcional; a migração é só visual/UX.
   */
  const paymentsMultiPlan = new Set<string>();
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      const nn = (n ?? {}) as Record<string, unknown>;
      if (nn.type !== "payment") continue;
      const d = (nn.data ?? {}) as Record<string, unknown>;
      const plans = Array.isArray(d.plans) ? d.plans : [];
      const mode = d.mode === "chat" ? "chat" : d.mode === "link" ? "link" : "button";
      if (mode === "button" && plans.length >= 2) paymentsMultiPlan.add(String(nn.id));
    }
  }

  return (raw as Edge[]).map((e) => {
    const dk = (e.data as Record<string, unknown> | undefined)?.kind;
    let kind = String(typeof dk === "string" && dk ? dk : e.sourceHandle ?? "next");
    if (kind === "upsell" && paymentsMultiPlan.has(e.source)) kind = "upsell_0";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle && e.sourceHandle !== "upsell" ? e.sourceHandle : kind,
      targetHandle: e.targetHandle ?? "in",
      data: { kind },
      ...edgeStyle(kind),
    } as Edge;
  });
}
function serialize(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      data: { kind: (e.data as Record<string, unknown> | undefined)?.kind ?? "next" },
    })),
  };
}

/* --------------- FLOW PREVIEW SIMULATOR --------------- */

type ChatMessage =
  | { kind: "bot"; text?: string; media?: { type: "image" | "video" | "gif" | "audio"; url: string; caption?: string; asMusic?: boolean; title?: string }; album?: Array<{ type: "image" | "video"; url: string }>; buttons?: Array<{ label: string; onClick?: () => void; url?: string }>; poll?: { question: string; options: string[]; onPick: (i: number) => void }; location?: { lat: number; lng: number; title?: string; address?: string }; system?: string }
  | { kind: "user"; text: string };

function findStartClient(nodes: Node[], edges: Edge[]): Node | null {
  const targets = new Set(edges.map((e) => e.target));
  const steps = nodes.filter((n) => n.type && n.type !== "unknown");
  return steps.find((n) => !targets.has(n.id)) ?? steps[0] ?? null;
}
function edgeKindOf(e: Edge): string {
  const dk = (e.data as { kind?: string } | undefined)?.kind;
  return String(dk ?? e.sourceHandle ?? "next");
}
function renderVarsClient(text: string, name = "Cliente"): string {
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
  const saudacao = h >= 5 && h < 12 ? "bom dia" : h >= 12 && h < 18 ? "boa tarde" : "boa noite";
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    if (k === "nome") return name;
    if (k === "primeiro_nome") return name.split(/\s+/)[0] ?? "";
    if (k === "produto") return "Produto";
    if (k === "hora") return hora;
    if (k === "data") return data;
    if (k === "dia_semana") return diaSemana;
    if (k === "saudacao") return saudacao;
    return "";
  });
}

function PreviewModal({ nodes, edges, onClose }: { nodes: Node[]; edges: Edge[]; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pauseNodeRef = useRef<string | null>(null);
  // Espelha o `navHistory` da conversa real (BotConversation): trilha dos
  // blocos `buttons` já respondidos. Sem isto o preview mentiria — não
  // mostraria o "Voltar" e os botões de mensagem antiga ficariam mortos,
  // que é justamente o comportamento que o runtime deixou de ter.
  const navHistoryRef = useRef<string[]>([]);
  const stepsRef = useRef(0);
  // Simula variables da conversa (cupom, resposta_1, etc). Preview vive
  // enquanto a modal está aberta — reset ao clicar Reiniciar.
  const previewVars = useRef<Record<string, unknown>>({}).current;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const push = useCallback((m: ChatMessage) => {
    setMessages((cur) => [...cur, m]);
  }, []);

  /**
   * Fila dos ramos pendentes — espelha `enfileirar` do runtime
   * (bot-funnel-runtime.ts). Quando uma bolinha tem mais de um fio, o preview
   * roda o 1º ramo inteiro e só depois volta pros outros. Sem isso o seller
   * puxaria 3 fios do "pagou" e o teste mostraria só o primeiro, parecendo que
   * os outros não funcionam.
   */
  const queueRef = useRef<string[]>([]);

  /** Todos os destinos de uma saída, na ordem em que os fios foram puxados. */
  const outsOf = useCallback(
    (nodeId: string, kind: string): Node[] => {
      const vistos = new Set<string>();
      const out: Node[] = [];
      for (const e of edges) {
        if (e.source !== nodeId) continue;
        if (edgeKindOf(e) !== kind && e.sourceHandle !== kind) continue;
        if (vistos.has(e.target)) continue;
        vistos.add(e.target);
        const n = nodes.find((x) => x.id === e.target);
        if (n) out.push(n);
      }
      return out;
    },
    [nodes, edges],
  );

  /** Próximo bloco: 1º fio agora, fios extras na fila, saída vazia puxa a fila. */
  const goClient = useCallback(
    (nodeId: string, kind: string): Node | null => {
      const alvos = outsOf(nodeId, kind);
      if (alvos.length > 1) {
        queueRef.current = [...alvos.slice(1).map((n) => n.id), ...queueRef.current];
      }
      if (alvos[0]) return alvos[0];
      while (queueRef.current.length > 0) {
        const id = queueRef.current.shift()!;
        const n = nodes.find((x) => x.id === id);
        if (n) return n;
      }
      return null;
    },
    [nodes, outsOf],
  );

  const executeFromClient = useCallback(
    async (startId: string) => {
      setRunning(true);
      let cur: Node | null = nodes.find((n) => n.id === startId) ?? null;
      stepsRef.current = 0;
      while (cur && stepsRef.current++ < 30) {
        const type = cur.type ?? "";
        const d = (cur.data ?? {}) as Record<string, unknown>;
        if (type === "message") {
          const t = renderVarsClient(String(d.text ?? ""));
          if (t) push({ kind: "bot", text: t });
          cur = goClient(cur.id, "next");
          await sleep(400);
          continue;
        }
        /* Álbum — espelha `coletarAlbum` do runtime. Sem isso o teste
           mostraria 4 mensagens onde o cliente vai receber 1. */
        if ((type === "image" || type === "video") && d.groupWithNext === true) {
          const corrente: Node[] = [cur];
          let atual = cur;
          while (corrente.length < ALBUM_MAX) {
            const dAtual = (atual.data ?? {}) as Record<string, unknown>;
            if (dAtual.groupWithNext !== true) break;
            const saidas = outsOf(atual.id, "next");
            if (saidas.length !== 1) break;
            const p = saidas[0];
            const tipoP = p.type ?? "";
            if (tipoP !== "image" && tipoP !== "video") break;
            if (!String(((p.data ?? {}) as Record<string, unknown>).url ?? "")) break;
            if (corrente.some((n) => n.id === p.id)) break;
            corrente.push(p);
            atual = p;
          }
          if (corrente.length >= 2) {
            const itens = corrente
              .map((n) => ({
                type: (n.type === "video" ? "video" : "image") as "image" | "video",
                url: String(((n.data ?? {}) as Record<string, unknown>).url ?? ""),
              }))
              .filter((i) => i.url);
            const primeira = String(
              ((corrente[0].data ?? {}) as Record<string, unknown>).caption ?? "",
            );
            push({
              kind: "bot",
              album: itens,
              text: primeira ? renderVarsClient(primeira) : undefined,
            });
            cur = goClient(corrente[corrente.length - 1].id, "next");
            await sleep(400);
            continue;
          }
        }
        if (type === "image" || type === "video" || type === "audio" || type === "gif") {
          const url = String(d.url ?? "");
          if (url) {
            push({
              kind: "bot",
              media: {
                type: type as "image" | "video" | "gif" | "audio",
                url,
                ...(type === "audio"
                  ? {
                      asMusic: d.asMusic === true,
                      title:
                        String(d.audioTitle ?? "") ||
                        String(d.filename ?? "").replace(/\.[a-z0-9]{1,5}$/i, ""),
                    }
                  : {}),
              },
              text: d.caption ? renderVarsClient(String(d.caption)) : undefined,
            });
          }
          cur = goClient(cur.id, "next");
          await sleep(400);
          continue;
        }
        if (type === "delay") {
          const secs = Math.min(5, Math.max(0.3, Number(d.seconds ?? 2))); // preview: cap 5s
          push({ kind: "bot", system: `⏳ Delay ${secs}s (${d.action === "record_voice" ? "gravando..." : "digitando..."})` });
          await sleep(secs * 1000);
          cur = goClient(cur.id, "next");
          continue;
        }
        if (type === "reengage") {
          // No preview a sequência inteira roda comprimida, pra o seller ver
          // exatamente o que o cliente vai receber sem esperar 6h de verdade.
          const mins = Math.max(5, Number(d.intervalMinutes ?? 360));
          const list = Array.isArray(d.messages) ? (d.messages as Record<string, unknown>[]) : [];
          const usable = list.filter(
            (m) => String(m?.text ?? "").trim() || String(m?.url ?? "").trim(),
          );
          if (usable.length === 0) {
            push({ kind: "bot", system: "🔁 Reengajamento sem mensagem — o funil segue direto" });
            await sleep(500);
            cur = goClient(cur.id, "next");
            continue;
          }
          push({
            kind: "bot",
            system: `🔁 Reengajamento: ${usable.length} mensagem(ns), 1 a cada ${humanizeMinutes(mins)}${d.loop === true ? " · repetindo" : ""}`,
          });
          await sleep(600);
          for (let i = 0; i < usable.length; i++) {
            const m = usable[i];
            const k = String(m.kind ?? "");
            const url = String(m.url ?? "").trim();
            push({ kind: "bot", system: `⏰ +${humanizeMinutes(mins * (i + 1))}` });
            await sleep(400);
            push({
              kind: "bot",
              text: m.text ? renderVarsClient(String(m.text)) : undefined,
              media:
                url && (k === "image" || k === "video")
                  ? { type: k as "image" | "video", url }
                  : undefined,
              buttons: m.btnLabel
                ? [{ label: String(m.btnLabel), url: String(m.btnUrl ?? "") }]
                : undefined,
            });
            await sleep(500);
          }
          push({ kind: "bot", system: "✅ Sequência terminou — segue o funil" });
          await sleep(400);
          cur = goClient(cur.id, "next");
          continue;
        }
        if (type === "coupon") {
          const varName = String(d.varName ?? "cupom");
          const prefix = String(d.prefix ?? "").toUpperCase().slice(0, 4);
          const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let s = "";
          for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
          const code = prefix ? `${prefix}-${s}` : s;
          // Sim variables
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (previewVars as any)[varName] = code;
          push({ kind: "bot", system: `🎟 Cupom gerado: ${code} (variavel: {{${varName}}})` });
          await sleep(400);
          cur = goClient(cur.id, "next");
          continue;
        }
        if (type === "condition") {
          const kind = String(d.kind ?? "language");
          let matched = false;
          if (kind === "language") {
            const list = String(d.equalsIn ?? "pt,pt-BR").toLowerCase().split(",").map((s) => s.trim());
            matched = list.some((l) => "pt-br".startsWith(l) || l.startsWith("pt"));
          } else if (kind === "variable") {
            const val = String((previewVars as Record<string, unknown>)[String(d.varName ?? "")] ?? "").toLowerCase();
            matched = val === String(d.equals ?? "").toLowerCase();
          } else if (kind === "variable_contains") {
            const val = String((previewVars as Record<string, unknown>)[String(d.varName ?? "")] ?? "").toLowerCase();
            const c = String(d.contains ?? "").toLowerCase();
            matched = c !== "" && val.includes(c);
          }
          push({ kind: "bot", system: `🔀 Condição ${kind}: ${matched ? "YES" : "NO"}` });
          await sleep(400);
          // Testa antes de chamar: `goClient` numa saída vazia já puxaria a
          // fila de ramos, e aí o "next" nunca rodaria.
          const saida = matched ? "yes" : "no";
          cur = outsOf(cur.id, saida).length > 0 ? goClient(cur.id, saida) : goClient(cur.id, "next");
          continue;
        }
        if (type === "input") {
          const prompt = renderVarsClient(String(d.prompt ?? ""));
          const captured = cur;
          const kws = Array.isArray(d.keywords) ? (d.keywords as Array<{ word?: string }>) : [];
          push({
            kind: "bot",
            text: prompt || "Responda:",
            buttons: [
              ...kws
                .map((k, i) => ({ label: `Digitar: "${k.word}"`, w: k.word ?? "", i }))
                .filter((k) => k.w)
                .map((k) => ({
                  label: k.label,
                  onClick: () => {
                    if (pauseNodeRef.current !== captured.id) return;
                    pauseNodeRef.current = null;
                    push({ kind: "user", text: k.w });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (previewVars as any)[String(d.varName ?? "resposta_1")] = k.w;
                    const nxt = goClient(captured.id, `kw_${k.i}`);
                    if (nxt) executeFromClient(nxt.id);
                    else setRunning(false);
                  },
                })),
              {
                label: "→ Próximo (skip keyword)",
                onClick: () => {
                  if (pauseNodeRef.current !== captured.id) return;
                  pauseNodeRef.current = null;
                  push({ kind: "user", text: "(resposta livre)" });
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (previewVars as any)[String(d.varName ?? "resposta_1")] = "(livre)";
                  const nxt = goClient(captured.id, "next");
                  if (nxt) executeFromClient(nxt.id);
                  else setRunning(false);
                },
              },
            ],
          });
          pauseNodeRef.current = captured.id;
          setRunning(false);
          return;
        }
        if (type === "location") {
          push({
            kind: "bot",
            location: {
              lat: Number(d.lat),
              lng: Number(d.lng),
              title: d.title ? String(d.title) : undefined,
              address: d.address ? String(d.address) : undefined,
            },
          });
          cur = goClient(cur.id, "next");
          await sleep(400);
          continue;
        }
        if (type === "random") {
          // `outsOf` e não `goClient`: aqui é só olhar quais ramos o seller
          // ligou. Sortear primeiro, avançar depois — chamar `goClient` nos
          // três embaralharia a fila de ramos pendentes.
          const ligados: number[] = [];
          for (let i = 0; i < 3; i++) {
            if (outsOf(cur.id, `rand_${i}`).length > 0) ligados.push(i);
          }
          if (ligados.length === 0) {
            cur = goClient(cur.id, "next");
            continue;
          }
          const sorteado = ligados[Math.floor(Math.random() * ligados.length)];
          push({ kind: "bot", system: `🎲 Random: ramo ${String.fromCharCode(65 + sorteado)}` });
          await sleep(400);
          cur = goClient(cur.id, `rand_${sorteado}`);
          continue;
        }
        if (type === "buttons") {
          const text = renderVarsClient(String(d.text ?? ""));
          const btnsRaw = Array.isArray(d.buttons)
            ? (d.buttons as Array<{ label?: string; kind?: string; url?: string }>)
            : [];
          let hasNext = btnsRaw.some((b) => b.kind !== "url");
          const captured = cur; // typescript narrow
          const historyAtRender = [...navHistoryRef.current];

          /**
           * Aceita o clique se ele veio do bloco atual OU de um bloco por onde
           * a conversa já passou — no chat do Telegram as mensagens antigas
           * continuam ali com os botões clicáveis. Devolve a trilha rebobinada
           * até aquele ponto, ou null quando o clique é inválido.
           */
          const claim = (): string[] | null => {
            if (pauseNodeRef.current === captured.id) return [...navHistoryRef.current];
            const idx = navHistoryRef.current.lastIndexOf(captured.id);
            if (idx < 0) return null;
            return navHistoryRef.current.slice(0, idx);
          };

          const btns = btnsRaw.map((b, i) => {
            const label = String(b.label ?? "").trim() || "Botão";
            if (b.kind === "url") return { label, url: b.url };
            return {
              label,
              onClick: () => {
                const base = claim();
                if (!base) return;
                pauseNodeRef.current = null;
                navHistoryRef.current = [...base, captured.id];
                push({ kind: "user", text: label });
                const nxt = goClient(captured.id, `btn_${i}`);
                if (nxt) executeFromClient(nxt.id);
                else setRunning(false);
              },
            };
          });

          if (historyAtRender.length > 0 && d.showBack !== false) {
            const backLabel =
              String(d.backLabel ?? "").trim() || "⬅️ Voltar";
            btns.push({
              label: backLabel,
              onClick: () => {
                const base = claim();
                if (!base) return;
                const prevId = base[base.length - 1];
                if (!prevId) return;
                pauseNodeRef.current = null;
                navHistoryRef.current = base.slice(0, -1);
                push({ kind: "user", text: backLabel });
                executeFromClient(prevId);
              },
            });
            hasNext = true;
          }

          push({ kind: "bot", text: text || undefined, buttons: btns });
          if (hasNext) {
            pauseNodeRef.current = captured.id;
            setRunning(false);
            return;
          }
          cur = goClient(cur.id, "next");
          await sleep(400);
          continue;
        }
        if (type === "poll") {
          const question = renderVarsClient(String(d.question ?? ""));
          const opts = Array.isArray(d.options)
            ? (d.options as string[]).map((s) => String(s)).filter(Boolean).slice(0, 10)
            : [];
          const captured = cur;
          if (!question || opts.length < 2) {
            cur = goClient(cur.id, "next");
            continue;
          }
          push({
            kind: "bot",
            poll: {
              question,
              options: opts,
              onPick: (i) => {
                if (pauseNodeRef.current !== captured.id) return;
                pauseNodeRef.current = null;
                push({ kind: "user", text: `Votou: ${opts[i]}` });
                const nxt = goClient(captured.id, `poll_${i}`);
                if (nxt) executeFromClient(nxt.id);
                else setRunning(false);
              },
            },
          });
          pauseNodeRef.current = captured.id;
          setRunning(false);
          return;
        }
        if (type === "botproduct") {
          const name = String(d.name ?? "Produto");
          const price = Number(d.price ?? 0);
          const captured = cur;
          push({
            kind: "bot",
            system: `💳 PIX gerado — ${name} R$ ${(price / 100).toFixed(2)}`,
            buttons: [
              {
                label: "✅ Simular pagamento",
                onClick: () => {
                  if (pauseNodeRef.current !== captured.id) return;
                  pauseNodeRef.current = null;
                  push({ kind: "user", text: "PIX pago" });
                  const nxt = goClient(captured.id, "upsell");
                  if (nxt) executeFromClient(nxt.id);
                  else setRunning(false);
                },
              },
              {
                label: "❌ Simular expiração",
                onClick: () => {
                  if (pauseNodeRef.current !== captured.id) return;
                  pauseNodeRef.current = null;
                  push({ kind: "user", text: "PIX expirou" });
                  const nxt = goClient(captured.id, "downsell");
                  if (nxt) executeFromClient(nxt.id);
                  else setRunning(false);
                },
              },
            ],
          });
          pauseNodeRef.current = captured.id;
          setRunning(false);
          return;
        }
        if (type === "payment") {
          // 22/07/2026 (davi): preview do bloco de pagamento. Espelha o runtime:
          //  - mode="button" (default) → botão "Pagar agora" que ao clicar
          //    "gera PIX" (simula) e depois vira botões simular pago/expirou
          //  - mode="chat" → PIX gerado imediatamente + botões simular
          //  - mode="link" → botão URL "Comprar agora" (não pausa)
          const mode: "button" | "chat" | "link" =
            d.mode === "link" ? "link" : d.mode === "chat" ? "chat" : "button";
          const name = String(d.productName ?? d.checkoutName ?? "Pagamento");
          const amountCents = Math.round(Number(d.amountCents ?? d.priceCents ?? 0));
          const priceStr = `R$ ${(amountCents / 100).toFixed(2)}`;
          const text = renderVarsClient(String(d.text ?? ""));
          const slug = String(d.checkoutSlug ?? "");

          // Extrai planos válidos (mesma lógica do runtime)
          const rawPlansPrev = Array.isArray(d.plans) ? (d.plans as Array<{ amountCents?: number; title?: string; period?: string; description?: string }>) : [];
          const validPlansPrev = rawPlansPrev
            .slice(0, 6)
            .map((p) => ({
              amountCents: Math.round(Number(p?.amountCents ?? 0)),
              title: String(p?.title ?? "").trim(),
              description: String(p?.description ?? "").trim().slice(0, 200),
              period: String(p?.period ?? "").trim(),
            }))
            .filter((p) => p.amountCents >= 200);
          const hasValidValue = validPlansPrev.length > 0 || amountCents >= 200;

          if (mode !== "link" && !hasValidValue) {
            push({ kind: "bot", system: "⚠ Bloco de pagamento sem valor válido (mín R$2) — pulando." });
            await sleep(300);
            cur = goClient(cur.id, "next");
            continue;
          }
          if (mode === "link" && !slug) {
            push({ kind: "bot", system: "⚠ Modo Link sem checkout escolhido — pulando." });
            await sleep(300);
            cur = goClient(cur.id, "next");
            continue;
          }

          if (mode === "link") {
            const label = String(d.buttonLabel ?? "🛒 Comprar agora").trim() || "🛒 Comprar agora";
            const labelWithPrice = label.includes("R$") ? label : `${label} — ${priceStr}`;
            const host = String(d.checkoutHost ?? "trilhopag.com");
            const url = `https://${host}/c/${slug}?utm_source=telegram_bot&utm_content=preview`;
            push({
              kind: "bot",
              text: text || `${name}\n💰 ${priceStr}\n\nClique no botão pra pagar:`,
              buttons: [{ label: labelWithPrice, url }],
            });
            await sleep(400);
            cur = goClient(cur.id, "next");
            continue;
          }

          // Simula EMV do PIX (só pra visual — não é código real)
          const fakePix =
            "00020101021226810014br.gov.bcb.pix2559qr.woovi.com/qr/v2/cob/1ee2ac61-56ad-4939-951e-86381a1e2e4b52040000530398654051" +
            (amountCents / 100).toFixed(2) +
            "5802BR5910PAGCIHERO6009SaoPaulo622905258c0e0e210ca443829188e7119630450C6";

          const captured = cur;

          /**
            * 29/07/2026: recebe o plano escolhido pra rotear pelo `upsell_${i}`
            * correto quando simular pagamento — igual o runtime real. Sem
            * planIdx (single-plan ou modo chat), cai direto no `upsell` geral.
            */
          const showStyledPix = (planIdx?: number) => {
            // 1) Texto persuasivo (se houver)
            if (text) push({ kind: "bot", text });
            // 2) Mensagem estilizada do PIX (título + code + legenda + botões)
            const title = renderVarsClient(String(d.pixTitle ?? DEFAULT_PIX_TITLE));
            const instruction = renderVarsClient(String(d.pixInstruction ?? DEFAULT_PIX_INSTRUCTION));
            const help = renderVarsClient(String(d.pixHelp ?? ""));
            const pixButtons: Array<{ label: string; onClick: () => void }> = [];
            if (d.showCopyButton !== false) {
              pixButtons.push({
                label: String(d.copyButtonLabel ?? DEFAULT_COPY_LABEL),
                onClick: () => {
                  push({ kind: "user", text: "📋 Copiar" });
                  push({ kind: "bot", text: `<code>${fakePix}</code>`.slice(0, 60) + "..." });
                },
              });
            }
            if (d.showQrButton !== false) {
              pixButtons.push({
                label: String(d.qrButtonLabel ?? DEFAULT_QR_LABEL),
                onClick: () => {
                  push({ kind: "user", text: "📱 QR Code" });
                  push({ kind: "bot", system: "📱 [imagem do QR seria enviada aqui]" });
                },
              });
            }
            // Botões de simulação (fim do funil pro preview)
            const simButtons: Array<{ label: string; onClick: () => void }> = [
              {
                label:
                  planIdx !== undefined
                    ? `✅ Simular PAGO — plano #${planIdx + 1}`
                    : "✅ Simular PAGO",
                onClick: () => {
                  if (pauseNodeRef.current !== captured.id) return;
                  pauseNodeRef.current = null;
                  push({ kind: "user", text: "PIX pago" });
                  // Roteia pelo plano quando existe; senão cai no genérico.
                  // Igualzinho ao advanceConversation do runtime.
                  const nxt =
                    (planIdx !== undefined
                      ? goClient(captured.id, `upsell_${planIdx}`)
                      : null) ?? goClient(captured.id, "upsell");
                  if (nxt) executeFromClient(nxt.id);
                  else setRunning(false);
                },
              },
              {
                label: "❌ Simular EXPIROU",
                onClick: () => {
                  if (pauseNodeRef.current !== captured.id) return;
                  pauseNodeRef.current = null;
                  push({ kind: "user", text: "PIX expirou" });
                  const nxt = goClient(captured.id, "downsell");
                  if (nxt) executeFromClient(nxt.id);
                  else setRunning(false);
                },
              },
            ];
            // 3) Bot mostra tudo junto: pixButtons (simulados) + simulação pago/expirou
            let body = "";
            if (title) body += `<b>${title}</b>\n\n`;
            body += `<code>${fakePix.slice(0, 90)}...</code>`;
            if (instruction) body += `\n\n${instruction}`;
            if (help) body += `\n\n${help}`;
            push({
              kind: "bot",
              text: body,
              buttons: [...pixButtons, ...simButtons],
            });
            pauseNodeRef.current = captured.id;
            setRunning(false);
          };

          if (mode === "button") {
            // MULTI-PLANOS: 1 botão por plano
            if (validPlansPrev.length > 1) {
              // 30/07/2026 (fix): rawText do bloco NÃO substitui a comparação.
              // Vira o CABEÇALHO no topo, e a comparação sai em seguida.
              const anyDesc = validPlansPrev.some((p) => p.description);
              const header = text ? text : `<b>${name || "Escolha um plano"}</b>`;
              let headText: string;
              if (anyDesc) {
                const lines = validPlansPrev.map((p, i) => {
                  const price = `R$ ${(p.amountCents / 100).toFixed(2).replace(".", ",")}`;
                  const titleFallback = p.title || `Plano ${i + 1}`;
                  const periodBit = p.period ? ` · ${p.period}` : "";
                  const head = `💠 <b>${titleFallback}</b> — ${price}${periodBit}`;
                  const desc = p.description ? `\n<i>${p.description}</i>` : "";
                  return head + desc;
                });
                headText = `${header}\n\n${lines.join("\n\n")}\n\n👇 Escolha abaixo:`;
              } else {
                headText = `${header}\n\n👇 Escolha:`;
              }
              push({
                kind: "bot",
                text: headText,
                buttons: validPlansPrev.map((p, planIdx) => {
                  const price = `R$ ${(p.amountCents / 100).toFixed(2).replace(".", ",")}`;
                  const label =
                    (p.title || "Plano") + (p.period ? ` (${p.period})` : "");
                  return {
                    label: `${price} / ${label}`,
                    onClick: () => {
                      if (pauseNodeRef.current !== captured.id) return;
                      push({ kind: "user", text: `${price} / ${label}` });
                      // Passa o índice pra rotear pelo `upsell_${planIdx}`
                      // — assim o preview reflete o comportamento real.
                      showStyledPix(planIdx);
                    },
                  };
                }),
              });
              pauseNodeRef.current = captured.id;
              setRunning(false);
              return;
            }
            // Single (1 plano OU legacy amountCents)
            const singleAmount = validPlansPrev[0]?.amountCents ?? amountCents;
            const singleName = validPlansPrev[0]?.title || name;
            const singlePrice = `R$ ${(singleAmount / 100).toFixed(2)}`;
            const label = String(d.buttonLabel ?? "🛒 Pagar agora").trim() || "🛒 Pagar agora";
            const labelWithPrice = label.includes("R$") ? label : `${label} — ${singlePrice}`;
            push({
              kind: "bot",
              text: text || `${singleName || "Pagamento"}\n💰 ${singlePrice}\n\n👇 Clica no botão pra receber seu PIX:`,
              buttons: [
                {
                  label: labelWithPrice,
                  onClick: () => {
                    if (pauseNodeRef.current !== captured.id) return;
                    push({ kind: "user", text: labelWithPrice });
                    showStyledPix();
                  },
                },
              ],
            });
            pauseNodeRef.current = captured.id;
            setRunning(false);
            return;
          }

          // mode === "chat": PIX estilizado aparece direto (sem botão inicial)
          showStyledPix();
          return;
        }
        // unknown → tenta next
        cur = goClient(cur.id, "next");
      }
      setRunning(false);
    },
    [nodes, edges, push],
  );

  function start() {
    setMessages([]);
    pauseNodeRef.current = null;
    navHistoryRef.current = []; // mesma regra do /start no runtime
    stepsRef.current = 0;
    // Reset variáveis simuladas do preview
    for (const k of Object.keys(previewVars)) delete previewVars[k];
    const start = findStartClient(nodes, edges);
    if (!start) {
      push({ kind: "bot", system: "Nenhum bloco encontrado. Adicione um bloco pra começar." });
      return;
    }
    executeFromClient(start.id);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ height: "min(720px, 90vh)" }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-gradient-to-r from-sky-600/30 to-sky-500/10 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-sky-400/30">
              <Send className="size-4 text-sky-100" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Preview do funil</p>
              <p className="text-[10px] text-sky-100/80">simulador · não envia de verdade</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={start}
              disabled={running}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-[11px] text-white hover:bg-white/[0.14] disabled:opacity-50"
            >
              {running ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
              {messages.length === 0 ? "Iniciar" : "Reiniciar"}
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-white/80 hover:bg-white/[0.08]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%230e0e10%22 width=%22100%22 height=%22100%22/><circle cx=%2250%22 cy=%2250%22 r=%221%22 fill=%22%23222%22/></svg>')] p-4"
        >
          {messages.length === 0 && (
            <div className="mt-16 text-center text-[11px] text-zinc-500">
              Clique <strong className="text-white">Iniciar</strong> pra simular a conversa.
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} m={m} />
          ))}
          {running && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <Loader2 className="size-3 animate-spin" /> bot digitando...
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-sky-500 px-3 py-1.5 text-[13px] text-white shadow">
          {m.text}
        </div>
      </div>
    );
  }
  if (m.system) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-white/[0.06] px-3 py-1 text-[10px] text-zinc-400">
          {m.system}
        </div>
      </div>
    );
  }
  const album = m.album ?? [];
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2 overflow-hidden rounded-2xl rounded-bl-md bg-zinc-800 text-[13px] text-white shadow">
        {album.length > 0 && (
          // Grade parecida com a do Telegram: 2 colunas e, quando a
          // quantidade é ímpar, a 1ª mídia ocupa a linha inteira. Não é
          // pixel-perfect — o ponto é o seller ver que chegou tudo junto.
          <div className="grid grid-cols-2 gap-[2px] overflow-hidden">
            {album.map((it, i) => (
              <div
                key={`${it.url}-${i}`}
                className={cn(
                  "relative bg-black/40",
                  album.length % 2 === 1 && album.length > 1 && i === 0
                    ? "col-span-2"
                    : "",
                )}
              >
                {it.type === "video" ? (
                  <video
                    src={it.url}
                    controls
                    preload="none"
                    playsInline
                    className="h-28 w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-28 w-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {m.media && (
          <div className="overflow-hidden">
            {m.media.type === "image" || m.media.type === "gif" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.media.url} alt="" loading="lazy" decoding="async" className="max-h-64 w-full object-cover" />
            ) : m.media.type === "video" ? (
              <video src={m.media.url} controls preload="none" playsInline className="max-h-64 w-full" />
            ) : (
              <div className="bg-white/[0.03] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{m.media.asMusic ? "🎵" : "🎤"}</span>
                  <audio src={m.media.url} controls preload="none" className="h-8 flex-1" />
                </div>
                {/* O ponto do print do davi: em voz NÃO aparece nome de
                    arquivo; em música aparece o título que o seller pôs. */}
                <div className="mt-1 text-[9px] text-zinc-500">
                  {m.media.asMusic
                    ? `faixa de música — “${m.media.title || "sem título"}”`
                    : "mensagem de voz (a ondinha, sem nome de arquivo)"}
                </div>
              </div>
            )}
          </div>
        )}
        {m.text && (
          <div
            className="whitespace-pre-wrap px-3 py-1.5 [&_code]:block [&_code]:bg-black/40 [&_code]:rounded [&_code]:px-2 [&_code]:py-1.5 [&_code]:my-1 [&_code]:text-[11px] [&_code]:font-mono [&_code]:break-all [&_code]:border-l-2 [&_code]:border-red-400/60 [&_b]:font-bold"
            // Preview roda 100% local com input do próprio seller — HTML
            // é seguro nesse contexto (não vem de outros users).
            dangerouslySetInnerHTML={{ __html: m.text }}
          />
        )}
        {m.location && (
          <div className="border-t border-white/[0.06] bg-emerald-500/[0.08] p-3 text-[11px]">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <MapPin className="size-3" /> {m.location.title || "Localização"}
            </div>
            {m.location.address && <div className="mt-0.5 text-zinc-300">{m.location.address}</div>}
            <div className="mt-1 text-[10px] text-zinc-500">
              {m.location.lat.toFixed(4)}, {m.location.lng.toFixed(4)}
            </div>
          </div>
        )}
        {m.poll && (
          <div className="border-t border-white/[0.06] bg-pink-500/[0.08] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-pink-300">
              <ListChecks className="size-3" /> Enquete
            </div>
            <div className="mb-2 text-[13px] text-white">{m.poll.question}</div>
            <div className="space-y-1">
              {m.poll.options.map((o, i) => (
                <button
                  key={i}
                  onClick={() => m.poll?.onPick(i)}
                  className="block w-full rounded-md bg-white/[0.06] px-3 py-1.5 text-left text-[12px] text-white transition hover:bg-white/[0.12]"
                >
                  <span className="mr-2 font-bold text-pink-300">{String.fromCharCode(65 + i)}</span>
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}
        {m.buttons && m.buttons.length > 0 && (
          <div className="grid gap-1 border-t border-white/[0.06] p-2">
            {m.buttons.map((b, i) =>
              b.url ? (
                <a
                  key={i}
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-white/[0.06] px-3 py-1.5 text-center text-[12px] text-sky-300 hover:bg-white/[0.12]"
                >
                  🔗 {b.label}
                </a>
              ) : (
                <button
                  key={i}
                  onClick={b.onClick}
                  className="rounded-md bg-white/[0.06] px-3 py-1.5 text-center text-[12px] text-white transition hover:bg-white/[0.12]"
                >
                  {b.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------- board ---------------------------------- */

function Board({ funnelId, name, backHref, botId, botType, active, runtimeEnabled, health, products, checkouts, checkoutHost, initialGraph }: BotFunnelLoaderProps) {
  const router = useRouter();
  const initial = (initialGraph ?? {}) as { nodes?: unknown; edges?: unknown };
  const [nodes, setNodes, onNodesChange] = useNodesState(
    hydrateNodes(initial.nodes, products, checkouts, checkoutHost),
  );
  // Context estático (checkouts/host mudam raramente — só ao recarregar página)
  const checkoutCtx = useMemo<CheckoutCtx>(
    () => ({ checkouts, checkoutHost }),
    [checkouts, checkoutHost],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    hydrateEdges(initial.edges, initial.nodes),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isApplying, startApply] = useTransition();
  const [isRuntimeOn, setIsRuntimeOn] = useState(runtimeEnabled);
  // Ativação local — depois de clicar "Ativar conversa" o banner some
  // sem precisar refresh (o prop `active` não muda dinamicamente).
  const [isActive, setIsActive] = useState(active);
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  // 22/07/2026 (davi mobile): sidebar colapsável no mobile — canvas ganha
  // 100% da largura. Botão flutuante abre/fecha.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /**
   * 30/07/2026 (seller: "faça com que essa aba tenha uma opção para
   * esconder ela e mostrar assim deixando melhor para edição do funil").
   * No desktop a sidebar de blocos ocupava 280px fixos, apertando o canvas.
   * Persisto no localStorage — o seller volta e o funil abre no jeito que
   * ele deixou (colapsada ou aberta), não precisa esconder toda vez.
   */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("tp_funil_sidebar_collapsed");
      if (v === "1") setSidebarCollapsed(true);
    } catch {
      /* localStorage indisponível — usa default */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("tp_funil_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignora */
    }
  }, [sidebarCollapsed]);
  // 22/07/2026 (davi: "adciona opcao de apagar um bloco por vez, so tem
  // opcao de limpar tudo!") — rastreia seleção pra mostrar botão "Apagar
  // bloco" flutuante quando o seller clica em algum bloco.
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  // 29/07/2026 (davi: "faça uma opção com que eu possa desconectar os fios").
  // Espelha o padrão do selectedNodeIds — botão flutuante "Desconectar fio"
  // aparece quando um ou mais fios estão selecionados. O X no meio do fio
  // (DeletableEdge) é o caminho principal; este botão é reforço no canto.
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);

  /**
   * 30/07/2026 — BUG DA SIDEBAR (seller reportou 5x: "clico em resumo e nao
   * acontece NADA"). Diagnosticado no browser: `pendingLanes: 3584` /
   * `expiredLanes: 3584` / `suspendedLanes: 0` na raiz do React — 3 lanes de
   * transition presas PRA SEMPRE. O RSC do destino baixava 200 OK, o <Link>
   * dava `defaultPrevented=true`, mas o `history.pushState` NUNCA rodava:
   * a navegação do App Router é uma transition, e ela ficava entangled com
   * transitions do canvas que nunca fechavam.
   *
   * Uma das fontes do loop era este handler: o `onSelectionChange` do
   * ReactFlow dispara a CADA tick do store dele (não só quando a seleção
   * muda de verdade), e como `selNodes.map(...)` cria um ARRAY NOVO toda
   * vez, os dois setState re-renderizavam sempre → novo tick → setState de
   * novo. Com 89 blocos isso nunca estabilizava e segurava a lane.
   *
   * Fix: compara por valor e só chama setState quando a seleção mudou
   * mesmo. Sem array novo, sem re-render, a transition fecha.
   */
  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const nextNodeIds = selNodes.map((n) => n.id);
      const nextEdgeIds = selEdges.map((e) => e.id);
      setSelectedNodeIds((prev) =>
        prev.length === nextNodeIds.length &&
        prev.every((id, i) => id === nextNodeIds[i])
          ? prev
          : nextNodeIds,
      );
      // Rastreia edges selecionados pra o botão flutuante "Desconectar fio"
      // aparecer (mesmo padrão do "Apagar bloco").
      setSelectedEdgeIds((prev) =>
        prev.length === nextEdgeIds.length &&
        prev.every((id, i) => id === nextEdgeIds[i])
          ? prev
          : nextEdgeIds,
      );
    },
    [],
  );

  function toggleRuntime() {
    const next = !isRuntimeOn;
    setIsRuntimeOn(next);
    startApply(async () => {
      const r = await setBotFunnelRuntime(botId, next);
      if (!r.ok) {
        setIsRuntimeOn(!next);
        setStatus(`✗ ${r.error}`);
      } else {
        setStatus(
          next
            ? "⚡ Execução LIGADA — manda /start no bot pra testar."
            : "Execução desligada (bot voltou ao normal).",
        );
      }
    });
  }

  const mounted = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 30/07/2026 — parte 2 do fix da sidebar. `saveFunnelGraph` é SERVER
   * ACTION: toda resposta passa pela fila de ações do App Router e agenda um
   * update de router state DENTRO de uma transition. O ReactFlow mexe em
   * `nodes` por conta própria (medição de dimensão, fitView, seleção), então
   * o autosave disparava sem o seller editar nada — cada disparo empilhava
   * mais uma transition entangled com a navegação, que então nunca commitava.
   *
   * Fix: guarda o último grafo salvo e só chama a action quando o JSON MUDA
   * de verdade. Mexer/selecionar bloco sem alterar o grafo não gera mais
   * server action — e a navegação da sidebar fica livre.
   */
  const lastSavedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      lastSavedRef.current = JSON.stringify(serialize(nodes, edges));
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const graph = serialize(nodes, edges);
      const snapshot = JSON.stringify(graph);
      if (snapshot === lastSavedRef.current) return; // nada mudou de fato
      lastSavedRef.current = snapshot;
      saveFunnelGraph(funnelId, graph).then((r) => {
        if (r.ok) setStatus("salvo automaticamente");
        else lastSavedRef.current = null; // falhou → tenta de novo na próxima
      });
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, funnelId]);

  const addBlock = useCallback(
    (type: BlockKind) => {
      setNodes((nds) => [
        ...nds,
        {
          id: `${type}_${Date.now()}`,
          type,
          position: {
            x: 140 + (nds.length * 36) % 320,
            y: 120 + nds.length * 36,
          },
          data: defaultData(type),
        },
      ]);
    },
    [setNodes],
  );

  const addProduct = useCallback(
    (p: BotFunnelProduct) => {
      setNodes((nds) => [
        ...nds,
        {
          id: `botprod_${p.id}_${Date.now()}`,
          type: "botproduct",
          position: { x: 480, y: 140 + nds.length * 36 },
          data: { productId: p.id, name: p.name, image: p.image, price: p.priceCents },
        },
      ]);
    },
    [setNodes],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const sh = conn.sourceHandle ?? "next";
      const kind = sh;
      if (conn.source === conn.target) {
        setStatus("Não dá pra conectar um bloco nele mesmo.");
        return;
      }
      setEdges((eds) => {
        /**
         * 29/07/2026 (davi: "faça com que eu possa puxar mais fios de conexão
         * da bolinha (pagou) para conseguir conectar o upsell em várias
         * coisas").
         *
         * Antes cada bolinha aceitava UM fio só: puxar o segundo apagava o
         * primeiro sem avisar. Agora a mesma saída aceita vários, e o runtime
         * roda os ramos em sequência (ver `enfileirar` em
         * bot-funnel-runtime.ts).
         *
         * Só o fio repetido pro MESMO bloco é descartado — mandaria a mesma
         * coisa duas vezes.
         */
        const cleaned = eds.filter(
          (e) =>
            !(
              e.source === conn.source &&
              e.target === conn.target &&
              ((e.data as Record<string, unknown> | undefined)?.kind ?? "next") === kind
            ),
        );
        const newEdge: Edge = {
          id: `e_${conn.source}_${kind}_${Date.now()}`,
          source: conn.source!,
          target: conn.target!,
          sourceHandle: conn.sourceHandle ?? kind,
          targetHandle: conn.targetHandle ?? "in",
          data: { kind },
          ...edgeStyle(kind),
        };
        return addEdge(newEdge, cleaned);
      });
    },
    [setEdges],
  );

  const onCanvas = useMemo(
    () =>
      new Set(
        nodes
          .filter((n) => n.type === "botproduct")
          .map((n) => (n.data as unknown as ProdData).productId),
      ),
    [nodes],
  );
  const palette = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  function clearAll() {
    if (!window.confirm("Limpar todo o canvas?")) return;
    setNodes([]);
    setEdges([]);
    setSelectedNodeIds([]);
  }
  function deleteSelected() {
    const ids = selectedNodeIds;
    if (ids.length === 0) return;
    if (!window.confirm(`Apagar ${ids.length === 1 ? "esse bloco" : `${ids.length} blocos`}?`)) return;
    const idSet = new Set(ids);
    setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
    // Remove arestas conectadas aos nodes deletados
    setEdges((eds) => eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
    setSelectedNodeIds([]);
  }
  /**
   * Desconecta os fios selecionados. Diferente do delete de bloco, aqui não
   * pede confirmação: fio é fácil de puxar de volta, e o próprio ato de
   * selecionar (clicar em cima) já é intencional.
   */
  function disconnectSelectedEdges() {
    const ids = selectedEdgeIds;
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setEdges((eds) => eds.filter((e) => !idSet.has(e.id)));
    setSelectedEdgeIds([]);
  }

  /**
   * 30/07/2026 (seller: "quando um bloco selecionado dentro do fluxo do funil
   * eu possa dar (ctrl c ctrl v) assim podendo duplicar ele com mais
   * praticidade").
   *
   * Clipboard INTERNO do funil (não usa navigator.clipboard). Motivos:
   *  - Nada de request de permissão pro browser
   *  - Copiar/colar não briga com o clipboard do sistema (o seller pode
   *    estar copiando textos dos campos ao mesmo tempo)
   *  - Guarda REACT nodes/edges direto, sem serializar pra JSON/string
   *
   * Copia inclui edges INTERNAS ao grupo (source E target no seleção).
   * Edges que saem/entram do grupo pra fora ficam de fora — não faz sentido
   * duplicar um fio pro mesmo target original.
   */
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  const copySelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const idSet = new Set(selectedNodeIds);
    const copiedNodes = nodes.filter((n) => idSet.has(n.id));
    if (copiedNodes.length === 0) return;
    const copiedEdges = edges.filter(
      (e) => idSet.has(e.source) && idSet.has(e.target),
    );
    // Deep-ish clone dos data — evita que edição futura do original mexa
    // no que ficou no clipboard.
    clipboardRef.current = {
      nodes: copiedNodes.map((n) => ({
        ...n,
        data: JSON.parse(JSON.stringify(n.data ?? {})),
        position: { ...n.position },
      })),
      edges: copiedEdges.map((e) => ({
        ...e,
        data: e.data ? JSON.parse(JSON.stringify(e.data)) : undefined,
      })),
    };
    setStatus(
      `📋 ${copiedNodes.length} bloco(s) copiado(s) — Ctrl+V pra colar`,
    );
  }, [selectedNodeIds, nodes, edges]);

  const pasteClipboard = useCallback(() => {
    const c = clipboardRef.current;
    if (!c || c.nodes.length === 0) return;
    // Mapping id_antigo → id_novo. Precisa ser único mesmo se colar 2x
    // seguidas (por isso Date.now + rand).
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const idMap = new Map<string, string>();
    c.nodes.forEach((n, i) => idMap.set(n.id, `n_${stamp}_${i}`));

    // Offset diagonal — pequeno o suficiente pra ficar do lado, grande o
    // suficiente pra não ficar exatamente em cima e virar invisível.
    const OFFSET = 48;
    const newNodes: Node[] = c.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      position: { x: n.position.x + OFFSET, y: n.position.y + OFFSET },
      selected: true,
      // Clone denovo (o clipboard sobrevive várias colagens).
      data: JSON.parse(JSON.stringify(n.data ?? {})),
    }));
    const newEdges: Edge[] = c.edges.map((e, i) => ({
      ...e,
      id: `e_${stamp}_${i}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      data: e.data ? JSON.parse(JSON.stringify(e.data)) : undefined,
    }));
    // Deseleciona os antigos pra o "selected" novo ficar em destaque.
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
    setSelectedNodeIds(newNodes.map((n) => n.id));
    setStatus(`✓ ${newNodes.length} bloco(s) colado(s)`);
  }, [setNodes, setEdges]);

  /**
   * Ctrl/Cmd + C copia, Ctrl/Cmd + V cola. Ignora quando o foco tá num
   * input/textarea/contentEditable — senão o seller não conseguia mais
   * copiar texto DENTRO dos campos do bloco (o handler engolia o evento).
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "v") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      // Também respeita seleção de texto: se o usuário está com uma parte
      // de texto marcada, deixa o navegador fazer copy normal.
      if (key === "c") {
        if (selectedNodeIds.length === 0) return;
        const sel = window.getSelection?.();
        if (sel && sel.toString().length > 0) return;
        e.preventDefault();
        copySelectedNodes();
      } else if (key === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        pasteClipboard();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNodeIds, copySelectedNodes, pasteClipboard]);

  /**
   * 30/07/2026 — parte 3 do fix da sidebar: CINTO DE SEGURANÇA.
   *
   * As partes 1 e 2 acima matam as duas fontes conhecidas de transition
   * presa. Mas o canvas é grande demais (ReactFlow + 89 blocos + libs de
   * terceiro) pra eu garantir que NENHUMA outra vá travar a lane algum dia.
   * E o custo de travar é o seller achando que o site inteiro quebrou.
   *
   * Então, ENQUANTO o board estiver montado, qualquer clique num link de
   * FORA do funil (sidebar, topbar, avatar…) navega direto pelo browser em
   * vez de passar pelo router client-side do Next. Full reload é ~200ms mais
   * lento, mas é 100% determinístico: não depende de transition commitar.
   * O listener morre junto com o board — o resto do dashboard segue SPA.
   *
   * Preserva os atalhos do browser: ctrl/cmd/shift/alt+click, botão do meio
   * e target=_blank continuam abrindo em aba nova normalmente.
   */
  const boardRootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      // Link de dentro do próprio funil (ex.: "Sair") já se resolve sozinho.
      if (boardRootRef.current?.contains(anchor)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.href === window.location.href) return;
      // Tira o <Link> do Next do caminho ANTES dele chamar router.push().
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(url.href);
    }
    // Capture: precisa rodar antes do handler do <Link> (que faz bubble).
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, []);

  function doActivate() {
    startApply(async () => {
      const r = await activateFunnel(funnelId, serialize(nodes, edges));
      if (r.ok) {
        // Ativar agora TAMBÉM liga a execução do bot (server-side).
        // Reflete no estado local pra o banner sumir imediato.
        setIsActive(true);
        setIsRuntimeOn(true);
        setStatus("✓ ATIVADO — manda /start no bot pra testar");
      } else {
        setStatus(`✗ ${r.error}`);
      }
    });
  }

  return (
    <CheckoutContext.Provider value={checkoutCtx}>
    {/**
     * 30/07/2026 (seller reincidente: "arrume este retangulo branco no
     * fundo do bloco de resposta livre. Tira esse negocio branco bugado").
     *
     * O CSS default do @xyflow/react (import "style.css") aplica:
     *   .react-flow__node        → background:#fff + border-radius diferente
     *                              do card, aparecia como retângulo branco
     *                              atrás DE TODOS os blocos custom
     *   .react-flow__node.selected → outline cinza claro (brilho branco)
     *
     * Como nossos nodes CUSTOM já têm seu próprio card colorido com bg
     * escuro + border + ring, o wrapper default só polui. Zero total no
     * wrapper — deixa só o card do node aparecer.
     *
     * IMPORTANTE: <style jsx global> exige o pacote styled-jsx, que o App
     * Router do Next não linka por padrão. Usando <style dangerouslySet-
     * InnerHTML> a regra CSS entra crua no <head> — funciona 100% no App
     * Router sem depender de dep extra.
     */}
    <style
      dangerouslySetInnerHTML={{
        __html: `
        /* 30/07/2026 (seller: fundo do fluxo com o design do tema
           selecionado). O CSS default do ReactFlow aplica background:#fff
           no .react-flow — cobria o gradient do tema (Ferrari vermelho,
           Ocean azul, Ibiza tropical, etc). Forçado transparente pra o
           gradient do wrapper .bp-bg do dashboard aparecer atrás. */
        .react-flow, .react-flow__renderer, .react-flow__pane {
          background: transparent !important;
        }
        .react-flow__node {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        .react-flow__node.selected,
        .react-flow__node:focus,
        .react-flow__node:focus-visible,
        .react-flow__node-default.selected,
        .react-flow__handle:focus,
        .react-flow__handle:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .react-flow__nodesselection-rect,
        .react-flow__selection {
          background: rgba(132, 204, 22, 0.06) !important;
          border: 1px dashed rgba(132, 204, 22, 0.4) !important;
        }

        /* 30/07/2026 (seller: "arrume a resolução quando zoom é aplicado").
           Zoom no ReactFlow aplica CSS transform:scale no viewport. Sem
           will-change, o browser fica trocando entre CPU/GPU render a
           cada zoom = flicker + textos borrados. Com will-change:transform
           + backface-visibility:hidden, o wrapper vai pra layer GPU dedi-
           cada e o zoom fica nítido em qualquer escala.

           subpixel-antialiased no texto: pequena diferença de nitidez em
           telas retina depois do transform:scale, especialmente em zoom
           <0.5 onde os textos ficam bem miudinhos. */
        .react-flow__viewport {
          will-change: transform;
          backface-visibility: hidden;
          transform-style: preserve-3d;
        }
        .react-flow__node {
          -webkit-font-smoothing: subpixel-antialiased;
          text-rendering: optimizeLegibility;
        }

        /* Pan voltou ao default (arrastar com o botao esquerdo move o
           canvas), entao o cursor volta a ser a mãozinha de sempre. */
        .react-flow__pane { cursor: grab; }
        .react-flow__pane.dragging { cursor: grabbing; }
      `,
      }}
    />
    {/**
      * 30/07/2026 (seller: "faça com que o fundo do fluxo tenha os designs
      * de acordo com o tema selecionado").
      *
      * Cada [data-theme] (ver src/styles/themes.css) aplica `background:
      * linear/radial-gradient(...)` NO WRAPPER `.bp-bg` do dashboard —
      * Ferrari tem vermelho gradient, Ocean azul, Ibiza tropical, etc.
      * Antes o canvas do funil aplicava `bg: var(--tp-bg)` como cor sólida
      * POR CIMA do gradient do parent, cobrindo todo o design.
      *
      * Agora o wrapper é `transparent` — o gradient/desenho do tema
      * atravessa e aparece atrás dos blocos. Fallback com `--tp-bg` só é
      * usado quando o parent NÃO tem gradient (edge case).
      */}
    <div
      ref={boardRootRef}
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/[0.06]"
      style={{ background: "transparent" }}
    >
      {/* TOP BAR — 2 linhas no mobile (identidade em cima, ações scroll horizontal em baixo) */}
      <div className="border-b border-white/[0.08] bg-zinc-950/90 backdrop-blur">
        {/* Linha 1: sair + nome + status */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pt-2.5 sm:py-2.5">
          {/**
           * 30/07/2026 (seller reincidente): "o botao de sair ainda nao esta
           * funcionando".
           *
           * Tentei antes com <Link> (não pegou), depois router.push (também
           * quebrou pra alguns). O culpado é o `pt-4 pb-24` do <main> do
           * dashboard vs. o `-mt-4/-mt-6/-mt-8 -mb-24` do wrapper isolate do
           * funil (page.tsx) — que puxa a área do funil PRA CIMA da topbar,
           * então a topbar do funil visualmente aparece mas fica DENTRO da
           * área que o canvas do ReactFlow marca como pane com
           * `touch-action: none` — os cliques no botão são engolidos pelo
           * pointer capture do pane antes do onClick disparar.
           *
           * Fix final: `<a href>` puro. O browser trata `<a>` como click
           * primitivo (não depende de handler React), navega mesmo se o
           * pointer capture pegar depois. `window.location.assign` no
           * onClick como cinto+suspensório: se o browser cair no default
           * <a> nav, ótimo; se algo cancelar, o handler força a nav.
           */}
          <a
            href={backHref}
            onClick={(e) => {
              e.stopPropagation();
              // Não previne o default — deixa o browser fazer a nav dele.
              // O window.location.assign é backup caso algo cancele.
              setTimeout(() => {
                if (typeof window !== "undefined" && window.location.pathname !== backHref) {
                  window.location.assign(backHref);
                }
              }, 50);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 sm:px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] active:bg-white/[0.10] transition shrink-0 no-underline"
            aria-label="Sair do funil"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </a>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-white">{name}</h1>
            {isActive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                <CheckCircle2 className="size-3" /> Ativo
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                <Circle className="size-3" /> Inativo
              </span>
            )}
            <span className="hidden sm:inline shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400 capitalize">
              {botType}
            </span>
          </div>
          {status && (
            <span className="hidden md:block max-w-[220px] truncate text-[11px] text-zinc-500">{status}</span>
          )}
          {/* Ativar / Reativar — ação primária sempre visível */}
          <button
            onClick={doActivate}
            disabled={isApplying}
            className="shrink-0 inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-cyan-400 px-3 sm:px-4 py-1.5 text-xs font-semibold text-black hover:bg-cyan-300 shadow-lg shadow-cyan-400/20 disabled:opacity-50"
          >
            {isApplying ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
            <span className="hidden sm:inline">{isActive ? "Reativar" : "Ativar conversa"}</span>
            <span className="sm:hidden">{isActive ? "Reativar" : "Ativar"}</span>
          </button>
        </div>
        {/* Linha 2: ações secundárias (scroll horizontal no mobile) */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-3 sm:px-4 pb-2.5 sm:pt-0 pt-2">
          {/* Toggle sidebar (só mobile) */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="shrink-0 sm:hidden inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            <Plus className="size-3.5" /> {sidebarOpen ? "Fechar" : "Blocos"}
          </button>
          <button
            onClick={() => setShowPreview(true)}
            title="Simular a conversa (não envia no bot real)"
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/[0.06] px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-400/[0.12]"
          >
            <Play className="size-3.5" /> Preview
          </button>
          <button
            onClick={toggleRuntime}
            disabled={isApplying}
            title={
              isRuntimeOn
                ? "Execução LIGADA — o bot roda este funil de verdade. Clique pra desligar."
                : "Ligar a execução: o bot passa a rodar este funil (manda /start pra testar)."
            }
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50",
              isRuntimeOn
                ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-400/25"
                : "border border-white/[0.1] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.06]",
            )}
          >
            <Zap className="size-3.5" /> {isRuntimeOn ? "Execução ON" : "Ligar execução"}
          </button>
          <button
            onClick={clearAll}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            <Trash2 className="size-3.5" /> Limpar
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="relative flex flex-1 min-h-0">
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r border-white/[0.08] bg-zinc-950/60 transition-[width] duration-200",
            // Desktop: 280px quando aberta, some quando colapsada.
            // Mobile: overlay quando sidebarOpen, escondida por padrão.
            sidebarCollapsed ? "sm:w-0 sm:overflow-hidden sm:border-r-0" : "sm:w-[280px]",
            sidebarOpen
              ? "absolute inset-y-0 left-0 z-20 w-[280px] max-w-[85vw] shadow-2xl sm:relative sm:z-auto"
              : "hidden sm:flex",
          )}
        >
          <div className="space-y-2 border-b border-white/[0.06] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Blocos
            </p>
            <button
              onClick={() => addBlock("message")}
              className="inline-flex w-full items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/[0.06] px-3 py-2.5 text-xs font-medium text-sky-300 hover:bg-sky-400/[0.12]"
            >
              <MessageCircle className="size-4" /> Mensagem
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => addBlock("image")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-fuchsia-400/25 bg-fuchsia-400/[0.05] px-2 py-2 text-[11px] font-medium text-fuchsia-300 hover:bg-fuchsia-400/[0.12]"
              >
                <ImageIcon className="size-3.5" /> Imagem
              </button>
              <button
                onClick={() => addBlock("gif")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-yellow-400/25 bg-yellow-400/[0.05] px-2 py-2 text-[11px] font-medium text-yellow-300 hover:bg-yellow-400/[0.12]"
              >
                <Sparkles className="size-3.5" /> GIF
              </button>
              <button
                onClick={() => addBlock("video")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-400/25 bg-orange-400/[0.05] px-2 py-2 text-[11px] font-medium text-orange-300 hover:bg-orange-400/[0.12]"
              >
                <Video className="size-3.5" /> Vídeo
              </button>
              <button
                onClick={() => addBlock("audio")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-purple-400/25 bg-purple-400/[0.05] px-2 py-2 text-[11px] font-medium text-purple-300 hover:bg-purple-400/[0.12]"
              >
                <Music className="size-3.5" /> Áudio
              </button>
              <button
                onClick={() => addBlock("delay")}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.05] px-2 py-2 text-[11px] font-medium text-cyan-300 hover:bg-cyan-400/[0.12]"
              >
                <Clock className="size-3.5" /> Delay (esperar)
              </button>
              <button
                onClick={() => addBlock("buttons")}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-400/[0.08] px-2 py-2 text-[11px] font-medium text-sky-300 hover:bg-sky-400/[0.14]"
              >
                <MousePointerClick className="size-3.5" /> Botões (inline)
              </button>
              <button
                onClick={() => addBlock("poll")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-pink-400/25 bg-pink-400/[0.05] px-2 py-2 text-[11px] font-medium text-pink-300 hover:bg-pink-400/[0.12]"
              >
                <ListChecks className="size-3.5" /> Enquete
              </button>
              <button
                onClick={() => addBlock("random")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-400/[0.05] px-2 py-2 text-[11px] font-medium text-violet-300 hover:bg-violet-400/[0.12]"
              >
                <Shuffle className="size-3.5" /> Random
              </button>
              <button
                onClick={() => addBlock("location")}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.05] px-2 py-2 text-[11px] font-medium text-emerald-300 hover:bg-emerald-400/[0.12]"
              >
                <MapPin className="size-3.5" /> Localização
              </button>
              <button
                onClick={() => addBlock("payment")}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-cyan-400/50 bg-cyan-400/[0.10] px-2 py-2.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/[0.20] shadow-lg shadow-cyan-400/10"
                title="Pagamento — gera PIX no chat ou manda link do checkout web"
              >
                <CreditCard className="size-3.5" /> Pagamento (PIX / link)
              </button>
              <button
                onClick={() => addBlock("reengage")}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-400/[0.08] px-2 py-2 text-[11px] font-medium text-indigo-300 hover:bg-indigo-400/[0.14]"
                title="Manda mensagens de tempos em tempos (ex: 6 em 6h) com imagem, vídeo ou só texto"
              >
                <Repeat className="size-3.5" /> Reengajamento
              </button>
              <button
                onClick={() => addBlock("input")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-teal-400/25 bg-teal-400/[0.05] px-2 py-2 text-[11px] font-medium text-teal-300 hover:bg-teal-400/[0.12]"
                title="Captura resposta livre do cliente em variável"
              >
                <MessageSquareText className="size-3.5" /> Resposta livre
              </button>
              <button
                onClick={() => addBlock("inactivity")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-2 py-2 text-[11px] font-medium text-amber-300 hover:bg-amber-400/[0.12]"
                title="Detecta cliente sumido em X min e reengaja pela bolinha 'inativo'"
              >
                <Timer className="size-3.5" /> Inatividade
              </button>
              <button
                onClick={() => addBlock("coupon")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-2 py-2 text-[11px] font-medium text-amber-300 hover:bg-amber-400/[0.12]"
                title="Gera cupom único por chat (exemplo: HOT-A3F7K)"
              >
                <Ticket className="size-3.5" /> Cupom
              </button>
              <button
                onClick={() => addBlock("condition")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/[0.05] px-2 py-2 text-[11px] font-medium text-rose-300 hover:bg-rose-400/[0.12]"
                title="Ramifica por idioma ou variável (yes/no)"
              >
                <GitBranch className="size-3.5" /> Condição
              </button>
              <button
                onClick={() => addBlock("social_proof")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-400/25 bg-orange-400/[0.05] px-2 py-2 text-[11px] font-medium text-orange-300 hover:bg-orange-400/[0.12]"
                title="Mostra 'N pessoas compraram' com dados REAIS do seller"
              >
                <Flame className="size-3.5" /> Prova social
              </button>
              <button
                onClick={() => addBlock("scarcity")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/[0.05] px-2 py-2 text-[11px] font-medium text-red-300 hover:bg-red-400/[0.12]"
                title="Vagas restantes + countdown de oferta"
              >
                <Timer className="size-3.5" /> Escassez
              </button>
              <button
                onClick={() => addBlock("tag")}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-pink-400/25 bg-pink-400/[0.05] px-2 py-2 text-[11px] font-medium text-pink-300 hover:bg-pink-400/[0.12]"
                title="Marca o chat com tags pra segmentar/filtrar depois"
              >
                <Hash className="size-3.5" /> Tag (segmentação)
              </button>
            </div>
            <p className="pt-1 text-[10px] leading-snug text-zinc-500">
              Variáveis: <code className="text-zinc-300">{"{{nome}}"}</code>{" "}
              <code className="text-zinc-300">{"{{hora}}"}</code>{" "}
              <code className="text-zinc-300">{"{{saudacao}}"}</code>{" "}
              <code className="text-zinc-300">{"{{dia_semana}}"}</code>
            </p>
            <p className="text-[10px] leading-snug text-zinc-500">
              Produto: <span style={{ color: PAID }}>pagou</span> ·{" "}
              <span style={{ color: UNPAID }}>não pagou</span>.
            </p>
          </div>
          <div className="border-b border-white/[0.06] px-3 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5">
              <Search className="size-3.5 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto…"
                className="w-full bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {palette.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-zinc-600">
                {products.length === 0 ? "Você não tem produtos." : "Nada na busca."}
              </p>
            ) : (
              palette.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-left hover:border-cyan-400/40 hover:bg-white/[0.04] transition",
                    onCanvas.has(p.id) && "opacity-60",
                  )}
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" loading="lazy" decoding="async" className="size-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] shrink-0">
                      <Package className="size-4 text-zinc-500" />
                    </div>
                  )}
                  <span className="flex-1 truncate text-xs text-white">{p.name}</span>
                  <Plus className="size-4 text-zinc-500 shrink-0" />
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Overlay que fecha sidebar no mobile ao tocar fora */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-10 bg-black/50 sm:hidden"
          />
        )}

        <div className="relative flex-1">
          {/* BANNER DE STATUS — mostra se falta alguma coisa pro bot rodar.
              22/07/2026 (davi): "Seller reclamando que configurou certinho
              mas o pagamento nao aparece". Motivo comum: esqueceu de clicar
              Ativar E Ligar execução. Agora Ativar faz os 2, mas o banner
              deixa claro caso alguma coisa esteja OFF. */}
          {(!isActive || !isRuntimeOn) && (
            <div className="absolute inset-x-2 top-2 z-20 rounded-xl border border-amber-400/40 bg-amber-500/[0.10] px-3 py-2.5 backdrop-blur-sm shadow-lg">
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none">⚠</span>
                <div className="min-w-0 flex-1 text-[11px] leading-snug text-amber-100">
                  <p className="font-semibold">Este funil ainda NÃO está rodando</p>
                  <ul className="mt-1 space-y-0.5 text-amber-100/85">
                    {!isActive && (
                      <li>• Funil não ativado — clique <strong>Ativar conversa</strong> no topo</li>
                    )}
                    {!isRuntimeOn && (
                      <li>• Execução desligada — clique <strong>Ligar execução</strong> no topo</li>
                    )}
                  </ul>
                  <p className="mt-1 text-amber-100/70">
                    Enquanto isso, o /start no bot não vai disparar nada.
                  </p>
                </div>
                {!isActive && (
                  <button
                    onClick={doActivate}
                    disabled={isApplying}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full bg-cyan-400 px-3 py-1 text-[11px] font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
                  >
                    {isApplying ? <Loader2 className="size-3 animate-spin" /> : <Power className="size-3" />}
                    Ativar agora
                  </button>
                )}
                {isActive && !isRuntimeOn && (
                  <button
                    onClick={toggleRuntime}
                    disabled={isApplying}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                  >
                    <Zap className="size-3" /> Ligar
                  </button>
                )}
              </div>
            </div>
          )}
          {/**
            * 30/07/2026 — o selo verde só aparece se o bot ESTIVER MESMO no ar.
            *
            * Antes ele era exibido só por `isActive && isRuntimeOn`, ou seja:
            * duas flags no nosso banco. O seller ficou dias vendo "✓ Bot
            * rodando · /start já funciona" enquanto o bot estava mudo, porque
            * nenhuma das duas flags sabe se o Telegram está entregando os
            * updates. Agora quem manda é o monitor 24/7 (bot-health): se ele
            * achou defeito, o canvas mostra o defeito, não um selo verde.
            */}
          {isActive && isRuntimeOn && health?.status === "broken" && (
            <div className="absolute right-2 top-2 z-20 max-w-[min(22rem,calc(100%-1rem))] rounded-xl border border-red-400/40 bg-red-950/80 px-3 py-2 backdrop-blur-sm text-[10px] text-red-100 shadow-lg">
              <p className="font-semibold text-red-300">⚠️ O bot não está respondendo</p>
              {health.detail && <p className="mt-0.5 leading-snug text-red-100/80">{health.detail}</p>}
            </div>
          )}
          {isActive && isRuntimeOn && health?.status !== "broken" && (
            <div className="absolute right-2 top-2 z-20 rounded-full border border-cyan-400/40 bg-cyan-500/[0.10] px-3 py-1 backdrop-blur-sm text-[10px] font-semibold text-cyan-300">
              {health?.status
                ? "✓ Bot rodando · verificado agora há pouco"
                : "✓ Bot rodando · /start já funciona"}
            </div>
          )}

          {/* Toggle da sidebar de blocos — só desktop, canto superior esquerdo
              do canvas. Quando aberta mostra "fechar" (Panel<); quando fechada
              mostra "abrir" (Panel>). Persiste em localStorage. */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? "Mostrar blocos" : "Esconder blocos"}
            aria-label={sidebarCollapsed ? "Mostrar sidebar de blocos" : "Esconder sidebar de blocos"}
            className="hidden sm:inline-flex absolute left-3 top-3 z-20 items-center gap-1.5 rounded-full border border-white/[0.1] bg-zinc-950/80 backdrop-blur px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white transition shadow-lg"
          >
            {sidebarCollapsed ? (
              <>
                <PanelLeftOpen className="size-3.5" /> Blocos
              </>
            ) : (
              <>
                <PanelLeftClose className="size-3.5" /> Esconder
              </>
            )}
          </button>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-5 text-center">
                <MessageCircle className="mx-auto size-7 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-400">
                  Adicione uma mensagem ou produto pra começar a conversa
                </p>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.15}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]}
            edgesFocusable
            /**
             * 30/07/2026 — o `panOnDrag={[1,2]}` + `selectionOnDrag` que eu
             * tinha posto aqui era palpite (teoria do pointer capture) e NÃO
             * era a causa do bug da sidebar: o problema real eram transitions
             * do React presas (ver comentários no topo do componente). Como o
             * seller pediu "volta pra como estava antes", o pan volta ao
             * default do ReactFlow — arrastar com o botão esquerdo move o
             * canvas, que é o que ele já tinha na mão.
             */
            onlyRenderVisibleElements
          >
            {/* Dots menores e mais espaçados = canvas respira; o foco fica
                nos blocos + fios coloridos, não na grade. Cor puxa da CSS
                var `--tp-border-strong` do tema (mesma cor que os cards do
                dashboard usam pra bordar) — no dark padrão fica ~rgba(255,
                255,255,0.12), invisível o suficiente pra virar textura. */}
            <Background
              variant={BackgroundVariant.Dots}
              color="var(--tp-border-strong, #2a2a30)"
              gap={28}
              size={1}
            />
            <Controls className="!bg-zinc-900 !border-white/10 !rounded-xl overflow-hidden" />
            <MiniMap pannable zoomable className="!bg-zinc-900 !border !border-white/10 !rounded-xl" maskColor="rgba(0,0,0,0.6)" />
          </ReactFlow>

          {/* Botões flutuantes quando há bloco(s) selecionado(s): duplicar e
              apagar, na ordem de risco (o menos destrutivo em cima).
              30/07/2026 — "Duplicar" também dá pra fazer Ctrl+C / Ctrl+V.
              22/07/2026 — "Apagar" também dá pra fazer Backspace/Delete. */}
          {selectedNodeIds.length > 0 && (
            <>
              <button
                onClick={() => {
                  copySelectedNodes();
                  pasteClipboard();
                }}
                className="absolute top-16 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-sky-400/50 bg-sky-500 px-3 py-2 text-xs font-semibold text-white shadow-xl shadow-sky-500/30 hover:bg-sky-600 transition"
                title="Ctrl+C / Ctrl+V também duplica"
              >
                <Copy className="size-3.5" />
                Duplicar {selectedNodeIds.length === 1 ? "bloco" : `${selectedNodeIds.length} blocos`}
              </button>
              <button
                onClick={deleteSelected}
                className="absolute top-28 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-500 px-3 py-2 text-xs font-semibold text-white shadow-xl shadow-red-500/30 hover:bg-red-600 transition"
                title="Backspace ou Delete também apagam"
              >
                <Trash2 className="size-3.5" />
                Apagar {selectedNodeIds.length === 1 ? "bloco" : `${selectedNodeIds.length} blocos`}
              </button>
            </>
          )}
          {/* Botão flutuante "Desconectar fio" — aparece quando há aresta
              selecionada. 29/07/2026 (davi: "faça uma opção com que eu possa
              desconectar os fios"). O X no meio do fio (DeletableEdge) é o
              caminho principal; este botão é reforço visível no canto pra
              quando o seller já tá procurando "onde eu clico pra desconectar".
              Se bloco E fio estão selecionados, este vai abaixo do outro. */}
          {selectedEdgeIds.length > 0 && (
            <button
              onClick={disconnectSelectedEdges}
              className={cn(
                "absolute right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-xl shadow-amber-500/30 hover:bg-amber-600 transition",
                // Empilhamento: se tem bloco selecionado, o botão "Duplicar" e
                // "Apagar" ocupam top-16 e top-28. Este vai pra top-40.
                selectedNodeIds.length > 0 ? "top-40" : "top-16",
              )}
              title="Backspace ou Delete também desconectam"
            >
              <X className="size-3.5" />
              Desconectar {selectedEdgeIds.length === 1 ? "fio" : `${selectedEdgeIds.length} fios`}
            </button>
          )}

          <div className="absolute bottom-3 left-3 z-10 max-w-[520px] rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1.5 text-[10px] text-cyan-200/80">
            Runtime <strong>100%</strong>: mensagem · mídia · delay · botões · enquete ·
            random · localização · pagamento · <strong>esperar (cron)</strong> ·
            <strong>resposta livre</strong> · <strong>cupom</strong> · <strong>condição</strong>.
            Ligue <strong>Execução ON</strong> e mande /start no bot pra testar.{" "}
            <span className="text-cyan-200/60">
              Dica: clique num fio pra <strong>desconectar</strong>. Ctrl+C /
              Ctrl+V <strong>duplica</strong> bloco.
            </span>
          </div>
        </div>
      </div>

      {showPreview && (
        <PreviewModal nodes={nodes} edges={edges} onClose={() => setShowPreview(false)} />
      )}
    </div>
    </CheckoutContext.Provider>
  );
}

export function BotFunnelBoard(props: BotFunnelLoaderProps) {
  return (
    <ReactFlowProvider>
      <Board {...props} />
    </ReactFlowProvider>
  );
}
