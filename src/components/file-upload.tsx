"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X, Image as ImageIcon, FileText } from "lucide-react";

import { compressImage, SERVER_LIMIT_BYTES } from "@/lib/image-compress";

// Teto de selecao (imagens grandes sao comprimidas antes de subir).
const SELECT_LIMIT_BYTES = 20 * 1024 * 1024;

type UploadResult = {
  url: string;
  pathname: string;
  size: number;
  type: string;
};

export function FileUpload({
  purpose,
  accept = "image/*,application/pdf",
  currentUrl,
  onUploaded,
  onCleared,
  label = "Selecionar arquivo",
  helper = "JPG, PNG, WEBP ou PDF — máx. 10MB",
  buttonClassName,
}: {
  purpose: string;
  accept?: string;
  currentUrl?: string | null;
  onUploaded: (r: UploadResult) => void;
  onCleared?: () => void;
  label?: string;
  helper?: string;
  buttonClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(rawFile: File) {
    setErr(null);
    if (rawFile.size === 0) {
      setErr("Arquivo vazio.");
      return;
    }
    if (rawFile.size > SELECT_LIMIT_BYTES) {
      setErr("Arquivo muito grande. Use até 20MB.");
      return;
    }
    setBusy(true);
    // TIMEOUT rígido: o spinner NUNCA fica infinito. Se passar de 60s,
    // aborta e mostra erro (era o bug do upload travado).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      // Comprime imagens pra caber no limite da função serverless.
      const file = await compressImage(rawFile);
      if (file.size > SERVER_LIMIT_BYTES) {
        setErr(
          "Arquivo muito grande (máx ~4MB). Reduza/comprima e tente de novo.",
        );
        return;
      }
      const fd = new FormData();
      fd.set("file", file);
      fd.set("purpose", purpose);
      const res = await fetch("/api/dashboard/upload", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || data.error || "Falha ao enviar.");
        return;
      }
      onUploaded({
        url: data.url,
        pathname: data.pathname,
        size: data.size,
        type: data.type,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setErr("Demorou demais pra enviar. Verifique a conexão e tente de novo.");
      } else {
        setErr(e instanceof Error ? e.message : "Erro de rede. Tente de novo.");
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  const isImage =
    currentUrl && /\.(jpe?g|png|webp|heic|gif|avif|svg)(\?|$)/i.test(currentUrl);
  // Xadrez atrás da miniatura: com o painel escuro, um PNG transparente
  // parecia ter fundo preto e o seller não sabia se a transparência tinha
  // sobrevivido ao upload. Com o xadrez dá pra ver na hora.
  const CHECKER =
    "repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%) 50% / 12px 12px";
  const isPdf = currentUrl && /\.pdf(\?|$)/i.test(currentUrl);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {currentUrl ? (
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2">
          {isImage ? (
            <span
              className="inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded"
              style={{ background: CHECKER }}
            >
              {/* object-contain (não cover): com transparência, cortar a arte
                  esconde justamente a borda que o seller quer conferir. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt="upload"
                className="size-full object-contain"
              />
            </span>
          ) : isPdf ? (
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded bg-red-500/15 text-red-300">
              <FileText className="size-5" />
            </span>
          ) : (
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded bg-zinc-500/15 text-zinc-300">
              <ImageIcon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-300 hover:underline"
            >
              Visualizar arquivo
            </a>
            <p className="text-[10px] text-zinc-500 truncate">{currentUrl.split("/").pop()}</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Substituir
          </button>
          {onCleared && (
            <button
              type="button"
              onClick={onCleared}
              disabled={busy}
              className="rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-300"
              title="Remover"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={
            buttonClassName ??
            "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.15] bg-white/[0.02] px-4 py-3 text-sm text-zinc-300 hover:border-cyan-400/40 hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
          }
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {label}
        </button>
      )}

      <p className="text-[11px] text-zinc-500">{helper}</p>
      {err && <p className="text-xs text-red-300">{err}</p>}
    </div>
  );
}
