"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { SERVER_LIMIT_BYTES } from "@/lib/image-compress";

/**
 * Seletor de arquivo do CADASTRO — tema claro.
 *
 * Diferenca crucial pro <FileUpload> do dashboard: aqui o arquivo NAO sobe na
 * hora. A rota de upload exige sessao, e no cadastro a conta ainda nao existe.
 * Entao o File fica em memoria e so vai pro servidor depois que o signup
 * autentica o usuario — assim tudo continua sendo UM fluxo so.
 */

/** Teto de selecao. Imagens acima disso ainda sao comprimidas antes de subir;
 *  PDF nao comprime, entao o aviso vem cedo pra nao falhar la na frente. */
const SELECT_LIMIT_BYTES = 20 * 1024 * 1024;

export function DocPicker({
  label,
  file,
  onPick,
  required,
  accept = "image/*,application/pdf",
  hint,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
  required?: boolean;
  accept?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handle(f: File) {
    setError(null);
    if (f.size === 0) {
      setError("Arquivo vazio.");
      return;
    }
    if (f.size > SELECT_LIMIT_BYTES) {
      setError("Arquivo muito grande. Use ate 20MB.");
      return;
    }
    // PDF nao passa pela compressao, entao ja avisa aqui em vez de estourar
    // o limite da funcao serverless depois do cadastro.
    if (!f.type.startsWith("image/") && f.size > SERVER_LIMIT_BYTES) {
      setError("PDF muito grande (max ~4MB). Reduza e tente de novo.");
      return;
    }
    onPick(f);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />

      {file ? (
        <div className="mt-2 flex items-center gap-2.5">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="size-11 shrink-0 rounded-lg border border-slate-200 object-cover"
            />
          ) : (
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-mist text-slate-500">
              <FileText className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">
              {file.name}
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs text-slate-500 underline-offset-2 hover:text-brand hover:underline"
            >
              Trocar arquivo
            </button>
          </div>
          <button
            type="button"
            onClick={() => onPick(null)}
            title="Remover"
            aria-label={`Remover ${label}`}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-mist px-4 py-3 text-[13px] font-medium text-slate-600 transition hover:border-brand hover:bg-brand/[0.05] hover:text-ink"
        >
          <Upload className="size-4" />
          Selecionar arquivo
        </button>
      )}

      {hint ? <p className="mt-1.5 text-[11px] text-slate-400">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
