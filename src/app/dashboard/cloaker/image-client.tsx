"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Loader2,
  Check,
  X,
  Download,
  ImageIcon,
  AlertCircle,
  Settings2,
} from "lucide-react";
import { logVideoCamuflagemUse } from "@/app/dashboard/video-camuflagem/actions";

type Preset = "subtle" | "medium" | "aggressive";

const PRESETS: Record<
  Preset,
  { label: string; description: string; filter: string }
> = {
  subtle: {
    label: "Sutil",
    description: "Brilho +1%, contraste +1%, saturação +2%",
    filter: "brightness(1.01) contrast(1.01) saturate(1.02)",
  },
  medium: {
    label: "Médio (recomendado)",
    description: "Brilho +2%, contraste +2%, saturação +5%",
    filter: "brightness(1.02) contrast(1.02) saturate(1.05)",
  },
  aggressive: {
    label: "Forte",
    description: "Brilho +3%, contraste +3%, saturação +8%, hue shift 2°",
    filter: "brightness(1.03) contrast(1.03) saturate(1.08) hue-rotate(2deg)",
  },
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function ImageCamuflagemClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("medium");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    name: string;
    sizeBytes: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [result, preview]);

  function handleFile(f: File | null) {
    setError(null);
    setResult(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("Arquivo deve ser uma imagem (JPG, PNG, WebP, etc.)");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("Arquivo muito grande. Limite: 50MB");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleProcess() {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      // Carrega a imagem (createImageBitmap aplica a orientação EXIF e já
      // descarta os metadados — o canvas re-encoda sem EXIF/GPS).
      const bitmap = await createImageBitmap(file).catch(async () => {
        // Fallback via <img> pra browsers sem createImageBitmap(File).
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();
        return img as unknown as ImageBitmap;
      });

      const w = (bitmap as ImageBitmap).width || (bitmap as unknown as HTMLImageElement).naturalWidth;
      const h = (bitmap as ImageBitmap).height || (bitmap as unknown as HTMLImageElement).naturalHeight;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas não suportado neste navegador.");

      // Filtro sutil — invisível pra você, suficiente pra mudar a assinatura
      // (hash perceptual) da imagem pros detectores de criativo duplicado.
      ctx.filter = PRESETS[preset].filter;
      ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

      // PNG preserva transparência; o resto vira JPG de alta qualidade.
      const isPng = file.type === "image/png";
      const mime = isPng ? "image/png" : "image/jpeg";
      const ext = isPng ? "png" : "jpg";

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Falha ao exportar imagem."))),
          mime,
          isPng ? undefined : 0.95,
        );
      });

      const url = URL.createObjectURL(blob);
      const cleanName = file.name.replace(/\.[^.]+$/, "") + `_camuflado.${ext}`;
      setResult({ url, name: cleanName, sizeBytes: blob.size });

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
      let msg = "Erro desconhecido";
      if (err instanceof Error) msg = err.message || err.name || String(err);
      else if (typeof err === "string") msg = err;
      console.error("[camuflagem-imagem] processing failed:", err);
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
              Arraste sua imagem aqui ou
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300"
            >
              <Upload className="size-3.5" /> Selecionar arquivo
            </button>
            <p className="mt-3 text-[11px] text-zinc-500">
              JPG, PNG, WebP • até 50MB • processado direto no seu navegador (zero
              upload)
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="prévia"
                className="size-16 shrink-0 rounded-lg border border-white/[0.06] object-cover"
              />
            ) : (
              <ImageIcon className="size-10 text-cyan-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-white">
                {file.name}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {formatBytes(file.size)} • {file.type || "image/*"}
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
          accept="image/*"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {/* Preset picker */}
      {file && !result && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">
              Intensidade do filtro
            </h3>
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
              <Loader2 className="size-5 animate-spin" /> Processando…
            </span>
          ) : (
            "Limpar metadata + aplicar filtro"
          )}
        </button>
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
              <h3 className="text-base font-bold text-white">
                Imagem processada!
              </h3>
              <p className="mt-1 text-xs text-zinc-400">
                {result.name} • {formatBytes(result.sizeBytes)}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.url}
                alt="resultado"
                className="mt-4 max-h-96 w-full rounded-xl border border-white/[0.06] bg-black object-contain"
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
    </div>
  );
}
