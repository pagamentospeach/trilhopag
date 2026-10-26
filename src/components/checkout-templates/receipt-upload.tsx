"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, FileCheck2 } from "lucide-react";

/**
 * Campo "Enviar comprovante" — mostrado na tela de resultado do PIX quando
 * o seller liga a opção no builder (theme.receiptUpload).
 *
 * O lead paga no banco e sobe o print/foto do comprovante. A imagem vai pro
 * Blob e a URL fica em Transaction.providerPayload.receipt_url. O seller vê
 * em Vendas. Componente standalone pra TODOS os templates poderem usar
 * (PixResultDisplay + templates que renderizam o pix inline, ex: dropv2).
 */
export function ReceiptUpload({
  enabled,
  txId,
  preview,
  primaryColor,
}: {
  enabled?: boolean;
  txId?: string | null;
  /** true quando é só preview do builder (QR não real) — esconde o campo. */
  preview?: boolean;
  primaryColor: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    if (!txId) return;
    setState("uploading");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/transactions/${txId}/receipt`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.saved !== false) {
        setState("done");
      } else {
        setState("error");
        setError(data.message || "Falha ao enviar. Tente de novo.");
      }
    } catch {
      setState("error");
      setError("Falha de conexão. Tente de novo.");
    }
  }

  if (!enabled || preview || !txId) return null;

  return (
    <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-4">
      {state === "done" ? (
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <FileCheck2 className="size-5" />
          </span>
          <p className="text-sm font-semibold text-emerald-700">
            Comprovante enviado!
          </p>
          <p className="text-[11px] text-zinc-500">
            Recebemos seu comprovante. Pode fechar esta tela.
          </p>
          <button
            type="button"
            onClick={() => {
              setState("idle");
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="mt-1 text-[11px] underline text-zinc-500 hover:text-zinc-800"
          >
            Enviar outro
          </button>
        </div>
      ) : (
        <>
          <p className="text-center text-sm font-semibold text-zinc-800">
            Já pagou? Envie o comprovante
          </p>
          <p className="mt-0.5 text-center text-[11px] text-zinc-500">
            Anexe o print/foto do comprovante do PIX (JPG, PNG, PDF — máx 10MB).
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <button
            type="button"
            disabled={state === "uploading"}
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 w-full rounded-lg border-2 py-3 text-sm font-semibold transition hover:bg-zinc-50 flex items-center justify-center gap-2 disabled:opacity-60 min-h-[48px]"
            style={{ borderColor: primaryColor, color: primaryColor }}
          >
            {state === "uploading" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Enviando…
              </>
            ) : (
              <>
                <Upload className="size-4" /> Enviar comprovante
              </>
            )}
          </button>
          {state === "error" && error && (
            <p className="mt-2 text-center text-[11px] text-red-500">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
