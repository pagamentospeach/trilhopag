"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { PixResultDisplay } from "./pix-result-modal";
import { usePixFlow } from "./use-pix-flow";
import { mergeAuto } from "./configs";
import type { TemplateProps } from "./types";
import { themeColors } from "./theme-utils";

/**
 * Auto: gera o Pix IMEDIATAMENTE assim que a página abre.
 * Não pede nada ao cliente — o servidor preenche os campos faltantes
 * com dados válidos aleatórios (ensureValidCustomer). Se houver pre-fill
 * via URL (?name=, ?email=, ?cpf=), é usado; senão é tudo gerado.
 *
 * Ideal pra tráfego pago direto pro QR Code (maior conversão).
 *
 * CORES: respeita TODAS as cores do builder via inline style — bgColor,
 * cardColor, textColor, primaryColor, accentColor, ctaBg, ctaColor.
 */
export function AutoTemplate(p: TemplateProps) {
  const { pix, loading, error, submit } = usePixFlow(p.slug, p.utm, p.variantId, p.isPreview);
  const fired = useRef(false);
  const cfg = mergeAuto(p.autoConfig);

  useEffect(() => {
    if (fired.current || pix || loading) return;
    fired.current = true;
    submit({
      name: p.prefillName ?? "",
      email: p.prefillEmail ?? "",
      phone: p.prefillPhone ?? "",
      cpf: p.prefillCpf ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = themeColors(p);
  const cardBg = c.card;
  const textColor = c.text;
  const subtleText = c.subtle;
  const borderColor = c.border;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 pb-[max(16px,env(safe-area-inset-bottom))]"
      style={{ background: p.bgColor, color: textColor }}
    >
      {pix ? (
        <PixResultDisplay
          pix={pix}
          priceCents={p.priceCents}
          productName={p.product.name}
          productImage={p.product.image}
          productDescription={p.product.description}
          primaryColor={p.primaryColor || p.ctaBg}
          pixResultConfig={p.pixResultConfig}
          receiptUpload={p.receiptUpload}
        />
      ) : error ? (
        <div
          className="rounded-2xl p-6 max-w-sm shadow-2xl text-center"
          style={{ background: cardBg, color: textColor }}
        >
          <p className="text-sm font-medium" style={{ color: "#dc2626" }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              fired.current = false;
              submit({
                name: p.prefillName ?? "",
                email: p.prefillEmail ?? "",
                phone: p.prefillPhone ?? "",
                cpf: p.prefillCpf ?? "",
              });
            }}
            className="mt-4 rounded-lg px-5 py-2.5 text-sm font-bold"
            style={{ background: p.ctaBg, color: p.ctaColor || "#fff" }}
          >
            {cfg.errorRetryLabel}
          </button>
        </div>
      ) : (
        <div
          className="rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-3"
          style={{ background: cardBg, color: textColor }}
        >
          {p.product.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.product.image}
              alt={p.product.name}
              className="size-14 rounded-full object-cover"
              style={{ borderColor, borderWidth: "1px", borderStyle: "solid" }}
            />
          )}
          <p className="text-sm font-semibold text-center" style={{ color: textColor }}>
            {p.product.name}
          </p>
          <Loader2
            className="mt-2 size-10 animate-spin"
            style={{ color: p.accentColor || p.primaryColor || p.ctaBg }}
          />
          <p className="text-sm font-medium" style={{ color: textColor }}>
            {cfg.loadingText}
          </p>
          <p className="text-xs" style={{ color: subtleText }}>
            {cfg.loadingSubtext}
          </p>
        </div>
      )}
    </div>
  );
}

