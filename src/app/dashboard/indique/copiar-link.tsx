"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Campo do link com botão de copiar. Substitui o CopyLink que morreu com a
 *  /dashboard/rede — mesma ideia, sem as dependências da aba antiga. */
export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={url}
        // `select()` no clique: o gesto natural de quem quer copiar na mão é
        // clicar no campo, e sem isso ele teria que arrastar a seleção.
        onClick={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 truncate rounded-xl border border-white/[0.08] bg-black/40 px-3.5 py-2.5 font-mono text-[13px] text-zinc-200 outline-none focus:border-cyan-400/40"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            // Sem permissão de clipboard (http, navegador antigo): o campo
            // continua selecionável na mão, então não vale gritar erro.
            return;
          }
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-[13px] font-semibold text-black transition hover:bg-cyan-300 active:scale-[0.99]"
      >
        {copiado ? (
          <>
            <Check className="size-4" /> Copiado
          </>
        ) : (
          <>
            <Copy className="size-4" /> Copiar
          </>
        )}
      </button>
    </div>
  );
}
