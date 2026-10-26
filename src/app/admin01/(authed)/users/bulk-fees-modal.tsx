"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { LinkModeDefaultsEditor } from "@/app/admin01/(authed)/users/_shared/link-mode-defaults-editor";
import { type LinkModeDefaults } from "@/lib/link-mode-defaults";

/**
 * Modal ADMIN de edição de taxas EM MASSA: abre o mesmo editor premium de 3
 * modos (black/white/hot + saque) e salva o MESMO conjunto pra TODOS os sellers
 * selecionados de uma vez. Diferente do indicador, o admin define LIVREMENTE
 * (sem piso "≥ taxa do indicador" — por isso NÃO passa `min`). Exige motivo
 * (auditado) antes de salvar.
 */
export function AdminBulkFeesModal({
  ids,
  initial,
  onClose,
}: {
  ids: string[];
  initial: LinkModeDefaults;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const hasReason = reason.trim().length > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-4xl rounded-3xl border border-white/[0.08] bg-[#070707] p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex size-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>

        {/* Motivo (auditado) — obrigatório pro fluxo em massa. */}
        <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-200">
              Motivo (auditado) · obrigatório
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex.: padronização de taxas do lote X"
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50"
            />
          </label>
          {!hasReason && (
            <p className="mt-1.5 text-[11px] text-amber-300/80">
              Preencha o motivo pra liberar o botão de salvar.
            </p>
          )}
        </div>

        <div className={hasReason ? "" : "pointer-events-none opacity-50"}>
          <LinkModeDefaultsEditor
            adminBulkUserIds={ids}
            adminReason={reason.trim()}
            initial={initial}
            title={`Editar taxas de ${ids.length} seller${ids.length !== 1 ? "s" : ""}`}
            description="Estas taxas serão aplicadas a TODOS os sellers selecionados de uma vez. Você define livremente (sem piso). Black e Hot só PIX; White PIX e cartão."
            onSaved={onClose}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Modal ADMIN de edição de taxas EM MASSA POR FILTRO: aplica o MESMO conjunto
 * de taxas (black/white/hot + saque) a TODOS os sellers que batem no filtro
 * atual da lista — não só os 200 visíveis na página, e sem precisar marcar
 * checkbox um a um. Exige motivo (auditado) e confirmação (afeta `count`
 * sellers de uma vez).
 */
export function AdminAllFilterFeesModal({
  filter,
  count,
  initial,
  onClose,
}: {
  filter: { q?: string; mode?: string; kyc?: string; blocked?: string };
  count: number;
  initial: LinkModeDefaults;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const hasReason = reason.trim().length > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-4xl rounded-3xl border border-white/[0.08] bg-[#070707] p-6 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex size-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>

        {/* Aviso forte: afeta TODO o filtro. */}
        <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-4">
          <p className="text-sm font-bold text-amber-100">
            ⚠️ Aplica a TODOS os {count} seller(s) do filtro atual
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-100/80">
            Não só os 200 visíveis — vale pra todos que batem na busca/abas
            selecionadas agora. Ação auditada e irreversível em massa.
          </p>
          <label className="mt-3 block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-200">
              Motivo (auditado) · obrigatório
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex.: padronização geral de taxas"
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-black/40 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50"
            />
          </label>
          {!hasReason && (
            <p className="mt-1.5 text-[11px] text-amber-300/80">
              Preencha o motivo pra liberar o botão de salvar.
            </p>
          )}
        </div>

        <div className={hasReason ? "" : "pointer-events-none opacity-50"}>
          <LinkModeDefaultsEditor
            adminAllFilter={filter}
            adminReason={reason.trim()}
            initial={initial}
            title={`Editar taxas de TODOS os ${count} seller${count !== 1 ? "s" : ""} do filtro`}
            description="Estas taxas serão aplicadas a TODOS os sellers do filtro atual de uma vez (não só os 200 da página). Você define livremente (sem piso). Black e Hot só PIX; White PIX e cartão."
            onSaved={onClose}
          />
        </div>
      </div>
    </div>
  );
}
