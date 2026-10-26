"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Bloco de código da documentação.
 *
 * 06/08/2026 (davi: "deixa mais bonitnho"): o rótulo da linguagem e o botão
 * de copiar eram texto solto ACIMA do bloco, separados por uma margem — não
 * pareciam parte dele. Agora são uma barra de verdade grudada no topo do
 * <pre>, com o mesmo fundo e a borda contínua.
 *
 * ⚠️ O botão deixou de ser `opacity-0 group-hover:opacity-100`. Isso não era
 * só estética: em celular/tablet NÃO EXISTE hover, então o botão de copiar
 * ficava invisível pra sempre — e copiar o cURL é literalmente a razão de
 * existir da página. Agora ele está sempre visível, só ganha contraste no
 * hover.
 */
export function Code({
  children,
  language = "bash",
}: {
  children: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard bloqueado (permissão/contexto inseguro) — não quebra a
      // página por causa de um botão de conveniência.
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          {language}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Copiar código"
        >
          {copied ? (
            <>
              <Check className="size-3 text-cyan-400" />
              <span className="text-cyan-400">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
        <code className="font-mono text-zinc-300">{children}</code>
      </pre>
    </div>
  );
}
