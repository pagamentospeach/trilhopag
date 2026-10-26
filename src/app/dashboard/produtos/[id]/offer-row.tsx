"use client";

import Link from "next/link";
import { useTransition, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getCheckoutUrl } from "@/lib/checkout-url";
import {
  Copy,
  Check,
  ExternalLink,
  Pencil,
  CopyPlus,
  Trash2,
  FlaskConical,
  Loader2,
  Link2,
  ArrowRight,
  X,
  BarChart3,
} from "lucide-react";
import {
  deleteCheckout,
  duplicateCheckout,
  updateCheckoutUrls,
} from "@/app/dashboard/checkouts/actions";

export function OfferRow({
  productId,
  checkoutId,
  slug,
  active,
  paidCount,
  variantCount,
  upsellUrl,
  backRedirectUrl,
  priceCentsOverride,
  productPriceCents,
  sellerDomain,
}: {
  productId: string;
  checkoutId: string;
  slug: string;
  active: boolean;
  paidCount: number;
  variantCount: number;
  upsellUrl: string | null;
  backRedirectUrl: string | null;
  priceCentsOverride: number | null;
  productPriceCents: number;
  /** Dominio verificado do seller. null = produto INATIVO (politica jun/2026). */
  sellerDomain: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [editingLinks, setEditingLinks] = useState(false);
  // URL so existe quando ha dominio verificado. Sem dominio, copia/abre
  // ficam bloqueados (UI esconde os botoes ou mostra "inativo").
  const url = sellerDomain
    ? getCheckoutUrl(slug, undefined, sellerDomain)
    : null;

  async function onCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onDuplicate() {
    startTransition(async () => {
      const r = await duplicateCheckout(checkoutId);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  function onDelete() {
    if (!confirm(`Excluir oferta /${slug}?\n\nIsso vai apagar o checkout e todas as variantes A/B.`)) return;
    startTransition(async () => {
      const r = await deleteCheckout(checkoutId);
      if (r.ok) router.refresh();
      else alert(r.error);
    });
  }

  return (
    <>
      <div className="grid grid-cols-12 items-center gap-3 border-b border-white/[0.04] px-5 py-4 text-sm last:border-b-0 hover:bg-white/[0.02] transition">
        <div className="col-span-4 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white truncate">/{slug}</p>
            {active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-1.5 py-0 text-[10px] text-cyan-300">
                <span className="size-1 rounded-full bg-cyan-400" /> Ativo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 px-1.5 py-0 text-[10px] text-zinc-400">
                Pausado
              </span>
            )}
          </div>
          {variantCount > 0 && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-zinc-500">
              <FlaskConical className="size-3" /> {variantCount} variante{variantCount > 1 ? "s" : ""} A/B
            </p>
          )}
          {/* Resumo Price/Upsell/Back */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
            {/* PREÇO da oferta (override OU base do produto) */}
            {(() => {
              const effectiveCents = priceCentsOverride ?? productPriceCents;
              const hasOwn = priceCentsOverride != null && priceCentsOverride > 0;
              return (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono ${
                    effectiveCents > 0
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                  title={hasOwn ? "Preço da oferta" : "Preço base do produto"}
                >
                  R$ {(effectiveCents / 100).toFixed(2).replace(".", ",")}
                  {hasOwn ? "" : " (base)"}
                </span>
              );
            })()}
            {upsellUrl ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-1.5 py-0.5 text-cyan-300">
                <ArrowRight className="size-2.5" /> Upsell
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/30 px-1.5 py-0.5 text-zinc-500">
                Sem upsell
              </span>
            )}
            {backRedirectUrl ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/10 px-1.5 py-0.5 text-yellow-300">
                <ArrowRight className="size-2.5 rotate-180" /> Back redirect
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/30 px-1.5 py-0.5 text-zinc-500">
                Sem back redirect
              </span>
            )}
            <button
              type="button"
              onClick={() => setEditingLinks(true)}
              className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-cyan-300 ml-1"
              title="Editar URLs rapidamente"
            >
              <Link2 className="size-2.5" /> editar
            </button>
          </div>
        </div>

        <div className="col-span-4 min-w-0 flex items-center gap-2">
          {url ? (
            <>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-xs font-mono text-zinc-300 hover:text-cyan-300 transition"
                title={url}
              >
                {url}
              </a>
              <button
                type="button"
                onClick={onCopy}
                className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.02] p-1.5 text-zinc-400 hover:border-cyan-400/40 hover:text-cyan-300 transition"
                title={copied ? "Copiado!" : "Copiar link"}
              >
                {copied ? <Check className="size-3.5 text-cyan-400" /> : <Copy className="size-3.5" />}
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.02] p-1.5 text-zinc-400 hover:border-cyan-400/40 hover:text-cyan-300 transition"
                title="Abrir checkout"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </>
          ) : (
            <a
              href="/dashboard/dominios"
              className="min-w-0 flex-1 truncate text-xs font-mono text-amber-300 hover:text-amber-200 underline"
              title="Conecte um dominio pra ativar este checkout"
            >
              inativo — conecte um domínio pra gerar o link
            </a>
          )}
        </div>

        <div className="col-span-1 text-xs text-zinc-300 font-medium tabular-nums">
          {paidCount}
        </div>

        {/* Coluna Acoes — responsiva.
          * Em telas < xl (laptop comum com sidebar aberta), os 4 botoes
          * com texto+icone (Metricas/Editar/Duplicar/Lixeira) somam
          * ~250px e NAO cabem em col-span-3. Por isso o texto fica
          * escondido em xl- e so o icone aparece (com tooltip). Em xl+
          * o texto volta. */}
        <div className="col-span-3 min-w-0 flex items-center justify-end gap-1.5">
          <Link
            href={`/dashboard/produtos/${productId}/ofertas/${checkoutId}/metricas`}
            className="inline-flex items-center gap-1 rounded-md border border-blue-400/30 bg-blue-400/[0.06] px-2 xl:px-2.5 py-1.5 text-[11px] font-medium text-blue-300 hover:bg-blue-400/15 transition"
            title="Ver métricas desta oferta (visitas, conversões, scroll)"
          >
            <BarChart3 className="size-3" /> <span className="hidden xl:inline">Métricas</span>
          </Link>
          <Link
            href={`/dashboard/produtos/${productId}/ofertas/${checkoutId}`}
            className="inline-flex items-center gap-1 rounded-md bg-cyan-400/10 border border-cyan-400/30 px-2 xl:px-2.5 py-1.5 text-[11px] font-medium text-cyan-300 hover:bg-cyan-400/15 transition"
            title="Abrir o Checkout Builder"
          >
            <Pencil className="size-3" /> <span className="hidden xl:inline">Editar</span>
          </Link>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 xl:px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.05] hover:text-white transition disabled:opacity-50"
            title="Duplicar oferta"
          >
            {isPending ? <Loader2 className="size-3 animate-spin" /> : <CopyPlus className="size-3" />}
            <span className="hidden xl:inline">Duplicar</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.02] p-1.5 text-zinc-400 hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-300 transition disabled:opacity-50"
            title="Excluir oferta"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {editingLinks && (
        <EditLinksModal
          checkoutId={checkoutId}
          slug={slug}
          initialUpsell={upsellUrl}
          initialBack={backRedirectUrl}
          initialPriceCents={priceCentsOverride}
          productPriceCents={productPriceCents}
          onClose={() => setEditingLinks(false)}
          onSaved={() => {
            setEditingLinks(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EditLinksModal({
  checkoutId,
  slug,
  initialUpsell,
  initialBack,
  initialPriceCents,
  productPriceCents,
  onClose,
  onSaved,
}: {
  checkoutId: string;
  slug: string;
  initialUpsell: string | null;
  initialBack: string | null;
  initialPriceCents: number | null;
  productPriceCents: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [upsell, setUpsell] = useState(initialUpsell ?? "");
  const [back, setBack] = useState(initialBack ?? "");
  const [priceInput, setPriceInput] = useState(
    initialPriceCents
      ? (initialPriceCents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setErr(null);
    // Parse preço: vazio = null (usa preço base), valor = override
    let priceCents: number | null = null;
    const trimmedPrice = priceInput.trim();
    if (trimmedPrice.length > 0) {
      const num = Number(trimmedPrice.replace(/[^\d,.]/g, "").replace(",", "."));
      if (!Number.isFinite(num) || num <= 0) {
        setErr("Preço inválido. Use formato 99,90 ou deixe vazio.");
        return;
      }
      priceCents = Math.round(num * 100);
    }
    startTransition(async () => {
      const r = await updateCheckoutUrls(
        checkoutId,
        upsell.trim() || null,
        back.trim() || null,
        priceCents,
      );
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-zinc-950 p-6 shadow-2xl my-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Editar oferta</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">/{slug}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.06]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Preço desta oferta{" "}
              <span className="text-zinc-600">(R$)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                R$
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={
                  productPriceCents > 0
                    ? (productPriceCents / 100).toFixed(2).replace(".", ",")
                    : "99,90"
                }
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-10 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              Preço cobrado nesta oferta específica. Vazio = usa preço base do
              produto
              {productPriceCents > 0 && (
                <>
                  {" "}
                  (R$ {(productPriceCents / 100).toFixed(2).replace(".", ",")})
                </>
              )}
              .
            </p>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Link de Upsell <span className="text-zinc-600">(opcional)</span>
            </label>
            <input
              type="url"
              value={upsell}
              onChange={(e) => setUpsell(e.target.value)}
              placeholder="https://seudominio.com/upsell"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Pra onde o cliente vai depois de pagar.
            </p>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Link de Back Redirect <span className="text-zinc-600">(opcional)</span>
            </label>
            <input
              type="url"
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="https://seudominio.com/oferta-especial"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Pra onde o cliente vai se apertar &ldquo;voltar&rdquo; no navegador (downsell).
            </p>
          </div>

          {err && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.05]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-semibold text-black hover:bg-cyan-300 disabled:opacity-50"
            >
              {isPending && <Loader2 className="size-3 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

/**
 * Renderiza children no document.body via React Portal. Importante pra
 * modais — evita ser cortado por parents com `overflow:hidden` ou
 * `transform`/`filter` que criam containing block pra elementos `fixed`.
 *
 * SSR-safe: retorna null no servidor (sem document).
 */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
