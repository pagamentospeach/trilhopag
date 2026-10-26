"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Loader2,
  Check,
  X,
  Download,
  FileVideo,
  AlertCircle,
  Settings2,
} from "lucide-react";
import { logVideoCamuflagemUse } from "./actions";

type HistoryItem = {
  id: string;
  preset: string;
  status: string;
  sizeBytes: number;
  createdAt: Date;
};

type Preset = "subtle" | "medium" | "aggressive";

const PRESETS: Record<Preset, { label: string; description: string; vf: string }> = {
  subtle: {
    label: "Sutil",
    description: "Brilho +1%, contraste +1%, saturação +2%",
    vf: "eq=brightness=0.01:contrast=1.01:saturation=1.02",
  },
  medium: {
    label: "Médio (recomendado)",
    description: "Brilho +2%, contraste +2%, saturação +5%, gamma +2%",
    vf: "eq=brightness=0.02:contrast=1.02:saturation=1.05:gamma=1.02",
  },
  aggressive: {
    label: "Forte",
    description: "Brilho +3%, contraste +3%, saturação +8%, gamma +3%, hue shift",
    vf: "eq=brightness=0.03:contrast=1.03:saturation=1.08:gamma=1.03,hue=h=2",
  },
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function VideoCamuflagemClient({ history }: { history: HistoryItem[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<Preset>("medium");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; sizeBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const ffmpegRef = useRef<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      // Limpa URLs de preview no unmount
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  /**
   * Carrega ffmpeg.wasm SELF-HOSTED em /public/ffmpeg/. Workers em
   * navegadores não aceitam URLs cross-origin (mesmo com CORS headers).
   * Por isso ffmpeg.js + 814.ffmpeg.js precisam vir do nosso domínio.
   *
   * Histórico das tentativas:
   *  1. import("@ffmpeg/ffmpeg") via npm → webpack chunk hell ("Cannot
   *     find module as expression is too dynamic")
   *  2. <script src=unpkg> + classWorkerURL=blob(unpkg/814) → blob's
   *     webpack publicPath quebra ("Cannot find module blob:...")
   *  3. <script src=unpkg> sem classWorkerURL → Worker tenta carregar
   *     814 do unpkg, browser bloqueia ("cannot be accessed from origin")
   *  4. ✓ self-host de tudo: script tag aponta pra /ffmpeg/ffmpeg.js,
   *     webpack publicPath fica = /ffmpeg/, worker URL = /ffmpeg/814.js
   *     (mesma origem → Worker permitido). Core.js + wasm ficam no
   *     unpkg via blob URL (importScripts dentro do worker aceita blob).
   */
  /**
   * Carrega ffmpeg.wasm 100% SELF-HOSTED de /public/ffmpeg/.
   *
   * TUDO precisa vir do mesmo origin pra Workers não bloquearem:
   *  - ffmpeg.js (main thread API)
   *  - 814.ffmpeg.js (worker chunk do @ffmpeg/ffmpeg)
   *  - ffmpeg-core.js (Emscripten core que o worker importScripts)
   *  - ffmpeg-core.wasm (binário ffmpeg)
   *
   * Histórico das tentativas anteriores que falharam:
   *  1. import("@ffmpeg/ffmpeg") via npm → webpack chunk hell
   *  2. <script unpkg> + classWorkerURL=blob → blob webpack publicPath
   *  3. <script unpkg> sem classWorkerURL → worker cross-origin blocked
   *  4. <script local> + core/wasm em blob → worker não acessa blob da main
   *  5. <script local> + core/wasm URLs unpkg → worker tentava spawnar
   *     sub-worker cross-origin (Emscripten internal)
   *  6. ✓ TUDO self-hosted: zero cross-origin. Worker spawn happy.
   */
  async function loadFfmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;
    setFfmpegLoading(true);
    try {
      // Cache-bust suffix muda quando atualizar a versão. Browsers vão
      // baixar o script novo em vez de pegar stale do disk cache.
      const CACHE_VERSION = "v6";

      const w = window as unknown as {
        FFmpegWASM?: { FFmpeg: new () => unknown };
      };
      if (!w.FFmpegWASM) {
        console.log("[metadados] injecting ffmpeg script (self-hosted)…");
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>(
            'script[data-ffmpeg-lib="1"]',
          );
          if (existing) {
            if (w.FFmpegWASM) return resolve();
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () =>
              reject(new Error("Falha ao carregar ffmpeg.js")),
            );
            return;
          }
          const script = document.createElement("script");
          script.src = `/ffmpeg/ffmpeg.js?${CACHE_VERSION}`;
          script.dataset.ffmpegLib = "1";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Falha ao carregar ffmpeg.js"));
          document.head.appendChild(script);
        });
      }
      if (!w.FFmpegWASM) {
        throw new Error(
          "ffmpeg.js carregou mas window.FFmpegWASM ficou undefined",
        );
      }

      // Core + wasm SELF-HOSTED. Mesma origem = zero CORS/Worker issues.
      const coreURL = `/ffmpeg/ffmpeg-core.js?${CACHE_VERSION}`;
      const wasmURL = `/ffmpeg/ffmpeg-core.wasm?${CACHE_VERSION}`;

      console.log("[metadados] loading ffmpeg (100% same-origin)…");
      const ffmpeg = new w.FFmpegWASM.FFmpeg() as {
        load: (opts: {
          coreURL: string;
          wasmURL: string;
        }) => Promise<boolean>;
      };
      await ffmpeg.load({ coreURL, wasmURL });
      console.log("[metadados] ✓ ffmpeg ready");
      ffmpegRef.current = ffmpeg;
      setFfmpegReady(true);
      return ffmpeg;
    } catch (e) {
      console.error("[metadados] ffmpeg load failed:", e);
      throw e;
    } finally {
      setFfmpegLoading(false);
    }
  }


  function handleFile(f: File | null) {
    setError(null);
    setResult(null);
    setProgress(0);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith("video/")) {
      setError("Arquivo deve ser um vídeo (MP4, MOV, AVI, etc.)");
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      setError("Arquivo muito grande. Limite: 500MB");
      return;
    }
    setFile(f);
  }

  async function handleProcess() {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setProgress(0);
    setResult(null);

    try {
      const ffmpeg = (await loadFfmpeg()) as {
        on: (event: string, cb: (e: { progress?: number; message?: string }) => void) => void;
        writeFile: (name: string, data: Uint8Array) => Promise<void>;
        readFile: (name: string) => Promise<Uint8Array>;
        deleteFile: (name: string) => Promise<void>;
        exec: (args: string[]) => Promise<number>;
      };

      // Captura stderr do ffmpeg pra diagnóstico de erros
      const logLines: string[] = [];
      ffmpeg.on("log", (e) => {
        if (e.message) {
          logLines.push(e.message);
          // Mantém só as últimas 50 linhas pra não estourar memória
          if (logLines.length > 50) logLines.shift();
        }
      });

      ffmpeg.on("progress", (e) => {
        if (typeof e.progress === "number") {
          setProgress(Math.round(Math.min(e.progress, 1) * 100));
        }
      });

      // Normaliza extensão (alguns browsers retornam .MOV maiúsculo)
      const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
      const inputName = `in.${ext || "mp4"}`;
      const outputName = "out.mp4";
      console.log("[metadados] reading file…", {
        name: file.name,
        sizeMB: (file.size / 1024 / 1024).toFixed(2),
        inputName,
      });
      const buf = new Uint8Array(await file.arrayBuffer());
      console.log("[metadados] writing to ffmpeg FS…");
      await ffmpeg.writeFile(inputName, buf);
      console.log("[metadados] running ffmpeg exec…");

      const vf = PRESETS[preset].vf;

      // Comando ffmpeg:
      // -map_metadata -1: remove TODOS metadados
      // -vf <filter>: aplica filtro visual sutil
      // -c:v libx264 -crf 20 -preset fast: x264 visualmente lossless
      // -c:a aac -b:a 128k: audio limpo (re-encode)
      // -movflags +faststart: stream-friendly
      const exitCode = await ffmpeg.exec([
        "-i", inputName,
        "-map_metadata", "-1",
        "-metadata", "title=",
        "-metadata", "artist=",
        "-metadata", "comment=",
        "-metadata", "encoder=",
        "-vf", vf,
        "-c:v", "libx264",
        "-crf", "20",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        // Audio: re-encode se houver, senão ignora (-c:a aac copia se possível)
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",
        outputName,
      ]);

      // exitCode != 0 → ffmpeg falhou. Pega últimas linhas do log pra diagnóstico
      if (exitCode !== 0) {
        const lastLines = logLines.slice(-10).join("\n");
        throw new Error(
          `ffmpeg saiu com código ${exitCode}.\n\nÚltimas mensagens:\n${lastLines || "(sem log)"}`,
        );
      }

      const data = await ffmpeg.readFile(outputName);
      // ffmpeg.wasm returns Uint8Array — wrap em ArrayBuffer pra satisfazer BlobPart
      const blob = new Blob([new Uint8Array(data).buffer as ArrayBuffer], {
        type: "video/mp4",
      });
      const url = URL.createObjectURL(blob);

      // Limpa do FS do ffmpeg
      try { await ffmpeg.deleteFile(inputName); } catch {}
      try { await ffmpeg.deleteFile(outputName); } catch {}

      const cleanName = file.name.replace(/\.[^.]+$/, "") + "_camuflado.mp4";
      setResult({ url, name: cleanName, sizeBytes: blob.size });

      // Loga uso (auditoria)
      try {
        await logVideoCamuflagemUse({
          sizeBytes: file.size,
          preset,
          success: true,
        });
      } catch {
        // log opcional, não bloqueia
      }
    } catch (err) {
      // Captura erro de forma DEFENSIVA — ffmpeg.wasm pode jogar DOMException,
      // RuntimeError do WASM, ou objetos arbitrários sem .message.
      let msg = "Erro desconhecido";
      if (err instanceof Error) {
        msg = err.message || err.name || String(err);
      } else if (typeof err === "string") {
        msg = err;
      } else if (err && typeof err === "object") {
        msg =
          (err as { message?: string }).message ||
          (err as { name?: string }).name ||
          JSON.stringify(err).slice(0, 200);
      }
      // Log no console pra debug
      console.error("[metadados] processing failed:", err);
      setError("Falha ao processar: " + msg);
      try {
        await logVideoCamuflagemUse({
          sizeBytes: file.size,
          preset,
          success: false,
          errorMessage: msg.slice(0, 200),
        });
      } catch {
        // ignore
      }
    } finally {
      setProcessing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dropRef.current?.classList.remove("border-cyan-400/60");
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div
        ref={dropRef}
        onDragOver={(e) => {
          e.preventDefault();
          dropRef.current?.classList.add("border-cyan-400/60");
        }}
        onDragLeave={() => dropRef.current?.classList.remove("border-cyan-400/60")}
        onDrop={handleDrop}
        className="rounded-2xl border-2 border-dashed border-white/[0.1] bg-white/[0.02] p-8 transition hover:border-white/[0.2]"
      >
        {!file ? (
          <div className="text-center">
            <Upload className="mx-auto size-10 text-zinc-500" />
            <p className="mt-4 text-base font-semibold text-white">
              Arraste seu vídeo aqui ou
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300"
            >
              <Upload className="size-3.5" /> Selecionar arquivo
            </button>
            <p className="mt-3 text-[11px] text-zinc-500">
              MP4, MOV, AVI, WebM • até 500MB • processado direto no seu navegador (zero upload)
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <FileVideo className="size-10 text-cyan-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-white">{file.name}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {formatBytes(file.size)} • {file.type || "video/*"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleFile(null)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
                >
                  <X className="mr-1 inline size-3" /> Remover
                </button>
              </div>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {/* Preset picker */}
      {file && !result && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Intensidade do filtro</h3>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(PRESETS) as Preset[]).map((p) => {
              const active = preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-cyan-400/50 bg-cyan-400/[0.06]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                  }`}
                >
                  <p className="text-sm font-semibold text-white">
                    {PRESETS[p].label}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-400">
                    {PRESETS[p].description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Process button */}
      {file && !result && (
        <button
          type="button"
          onClick={handleProcess}
          disabled={processing}
          className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-6 py-4 text-base font-bold text-black shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-emerald-300 disabled:opacity-60"
        >
          {processing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-5 animate-spin" />
              {ffmpegLoading
                ? "Carregando engine…"
                : progress > 0
                  ? `Processando ${progress}%`
                  : "Iniciando…"}
            </span>
          ) : (
            "Limpar metadata + aplicar filtro"
          )}
        </button>
      )}

      {/* Progress bar */}
      {processing && progress > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Progresso</span>
            <span className="text-cyan-400 tabular-nums">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="overflow-hidden rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-400/[0.08] to-transparent p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-400/20 ring-2 ring-emerald-400/40">
              <Check className="size-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-white">Vídeo processado!</h3>
              <p className="mt-1 text-xs text-zinc-400">
                {result.name} • {formatBytes(result.sizeBytes)}
              </p>
              <video
                src={result.url}
                controls
                className="mt-4 max-h-96 w-full rounded-xl border border-white/[0.06] bg-black"
              />
              <a
                href={result.url}
                download={result.name}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-400"
              >
                <Download className="size-4" /> Baixar arquivo
              </a>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="text-sm font-semibold text-white">Histórico recente</h3>
          <div className="mt-4 divide-y divide-white/[0.04]">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-3 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex size-2 rounded-full ${h.status === "done" ? "bg-emerald-400" : h.status === "failed" ? "bg-red-400" : "bg-zinc-500"}`}
                  />
                  <span className="text-zinc-300">
                    {PRESETS[h.preset as Preset]?.label ?? h.preset}
                  </span>
                  <span className="text-zinc-500">• {formatBytes(h.sizeBytes)}</span>
                </div>
                <span className="text-[11px] text-zinc-500">
                  {new Date(h.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!ffmpegReady && !processing && (
        <p className="text-center text-[10px] text-zinc-600">
          Engine de processamento (~25MB) será baixada na primeira utilização.
        </p>
      )}
    </div>
  );
}
