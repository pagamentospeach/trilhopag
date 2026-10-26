"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Link2,
  Globe,
} from "lucide-react";
import { createBturbVideo } from "../actions";

type DomainOption = { id: string; domain: string };

/**
 * Upload Bturb — 5ª (e definitiva) arquitetura.
 *
 * Histórico:
 *  1-4. Tudo via @vercel/blob/client SDK → travava em loading infinito.
 *  5.  Agora: XHR FormData direto pra /api/bturb/upload → servidor
 *     processa e usa @vercel/blob server-side put. Sem SDK no client.
 *
 * Pros:
 *  - Funciona em 100% dos browsers (XHR é primordial)
 *  - Progress real via xhr.upload.onprogress
 *  - Logs servidor mostram requisição (debugável)
 *  - Sem callbacks, sem tokens client-side
 *
 * Limite: 4MB (Vercel body limit). Pra files maiores, fallback é
 * "Usar URL externa" — sobre o vídeo num CDN/Vimeo e cola o link.
 */
export function NewBturbVideoClient({
  domains,
}: {
  domains: DomainOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [customDomainId, setCustomDomainId] = useState(domains[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(f: File) {
    setFile(f);
    setError(null);
    setUploadedUrl(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));

    // Valida tamanho client-side (evita upload de 100MB pra cair em 413)
    if (f.size > 4 * 1024 * 1024) {
      setError(
        `Arquivo muito grande (${formatBytes(f.size)}). Limite: 4MB. ` +
          `Pra vídeos maiores, use a aba "Usar URL externa" e hospede em ` +
          `CDN/YouTube/Vimeo primeiro.`,
      );
      setUploading(false);
      return;
    }

    setUploading(true);
    setProgress(0);
    setStatusMsg("Iniciando upload…");

    console.log("[bturb] upload start", {
      name: f.name,
      sizeMB: (f.size / 1024 / 1024).toFixed(2),
      type: f.type,
    });

    try {
      const formData = new FormData();
      formData.append("file", f, f.name);

      // XMLHttpRequest pra ter onprogress real (fetch não tem upload progress).
      const result = await new Promise<{ url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/bturb/upload");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setProgress(pct);
            if (pct < 100) {
              setStatusMsg(
                `Enviando ${formatBytes(event.loaded)} / ${formatBytes(event.total)}…`,
              );
            } else {
              setStatusMsg("Processando no servidor…");
            }
          }
        };

        xhr.onload = () => {
          console.log("[bturb] xhr.onload", {
            status: xhr.status,
            responseText: xhr.responseText.slice(0, 300),
          });
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.ok && data.url) {
                resolve({ url: data.url });
              } else {
                reject(new Error(data.message || data.error || "Resposta inválida"));
              }
            } catch {
              reject(
                new Error(
                  "Resposta inválida do servidor: " +
                    xhr.responseText.slice(0, 100),
                ),
              );
            }
          } else {
            // Tenta extrair mensagem do erro
            let msg = `HTTP ${xhr.status}`;
            try {
              const data = JSON.parse(xhr.responseText);
              msg = data.message || data.error || msg;
            } catch {
              // ignore
            }
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => {
          console.error("[bturb] xhr.onerror — network failure");
          reject(new Error("Falha de rede ao subir o vídeo. Tente de novo."));
        };

        xhr.ontimeout = () => {
          console.error("[bturb] xhr.ontimeout");
          reject(new Error("Timeout no upload (60s)."));
        };

        xhr.timeout = 60_000; // 60s
        xhr.send(formData);
      });

      console.log("[bturb] ✓ upload success", result);
      setUploadedUrl(result.url);
      setStatusMsg("Upload concluído ✓");
    } catch (e) {
      console.error("[bturb] upload failed:", e);
      const msg = e instanceof Error ? e.message : "Falha no upload";
      setError(msg);
      setStatusMsg("");
    } finally {
      setUploading(false);
    }
  }

  function resetFile() {
    setFile(null);
    setUploadedUrl(null);
    setProgress(0);
    setStatusMsg("");
    setError(null);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleSubmit() {
    setError(null);
    const videoUrl = mode === "upload" ? uploadedUrl : externalUrl.trim();
    if (!title.trim()) {
      setError("Dê um título pro vídeo");
      return;
    }
    if (!videoUrl) {
      setError(
        mode === "upload" ? "Suba o vídeo primeiro" : "Cole a URL do vídeo",
      );
      return;
    }
    if (!customDomainId) {
      setError("Escolha um domínio próprio");
      return;
    }
    startTransition(async () => {
      const r = await createBturbVideo({
        title: title.trim(),
        description: description.trim() || null,
        videoUrl,
        mimeType: file?.type ?? null,
        sizeBytes: file?.size ?? null,
        customDomainId,
      });
      if (r.ok) {
        router.push(`/dashboard/bturb/${r.id}`);
      } else {
        setError(r.error);
      }
    });
  }

  const selectedDomain = domains.find((d) => d.id === customDomainId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Novo vídeo</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Suba uma VSL (até 4MB) ou cole a URL de um vídeo já hospedado.
        </p>
      </div>

      <div className="flex gap-1 border-b border-white/[0.06]">
        {[
          { key: "upload" as const, label: "Subir arquivo", icon: Upload },
          { key: "url" as const, label: "Usar URL externa", icon: Link2 },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                mode === t.key
                  ? "border-cyan-400 text-cyan-300"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
        {mode === "upload" ? (
          <div>
            <label className="block text-xs text-zinc-400 mb-2">
              Arquivo de vídeo (MP4, MOV, WEBM — até 4MB)
            </label>
            {!file ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-white/[0.12] bg-white/[0.02] p-10 text-center hover:border-cyan-400/40 hover:bg-cyan-400/[0.02] transition"
              >
                <Video className="mx-auto size-10 text-zinc-500" />
                <p className="mt-3 text-sm text-zinc-300">
                  Clique pra escolher um vídeo
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Pra vídeos &gt; 4MB, use a aba &quot;Usar URL externa&quot;
                </p>
              </button>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                <div className="flex items-center gap-3">
                  <Video className="size-6 text-cyan-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin text-cyan-300" />
                    ) : uploadedUrl ? (
                      <>
                        <CheckCircle2 className="size-5 text-cyan-300" />
                        <button
                          type="button"
                          onClick={resetFile}
                          className="text-[11px] text-zinc-400 hover:text-white underline"
                        >
                          Trocar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={resetFile}
                        className="text-[11px] text-zinc-400 hover:text-white underline"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
                {(uploading || progress > 0) && (
                  <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                {(statusMsg || uploading) && (
                  <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums">
                    <span className="text-zinc-400">{statusMsg}</span>
                    <span className="text-zinc-500">{progress}%</span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-zinc-400 mb-2">
              URL do vídeo (HTTPS direta — .mp4, .webm, .m3u8)
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://cdn.exemplo.com/vsl.mp4"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            <p className="mt-2 text-[11px] text-zinc-500">
              Use essa opção pra vídeos maiores que 4MB. Hospede no Vercel
              Blob, Cloudflare R2, Bunny CDN, ou Vimeo/YouTube e cole o link
              direto aqui.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs text-zinc-400 mb-2">Título</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Minha VSL — Oferta Q4"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            Descrição (opcional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-2">
            <Globe className="inline size-3 mr-1" />
            Domínio próprio do embed
          </label>
          <select
            value={customDomainId}
            onChange={(e) => setCustomDomainId(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id} className="bg-zinc-900">
                {d.domain}
              </option>
            ))}
          </select>
          {selectedDomain && (
            <p className="mt-1.5 text-[11px] text-zinc-500">
              URL do embed:{" "}
              <code className="text-cyan-300">
                https://{selectedDomain.domain}/v/&lt;id&gt;
              </code>
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3 text-xs text-red-200 flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard/bturb")}
            className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || uploading}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-300 transition disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-3 animate-spin" />}
            Criar vídeo
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
