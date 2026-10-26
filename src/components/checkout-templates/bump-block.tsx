"use client";

import { Check } from "lucide-react";
import { formatMoney } from "@/lib/utils";

/**
 * Bloco de Order Bump renderizado dentro dos templates de checkout.
 * Recebe o bump resolvido (já pode ser standalone OU vinculado a produto)
 * e o estado de seleção controlado pelo template parent.
 *
 * Visual: card com badge superior, imagem opcional, título, descrição,
 * preço "de" riscado, preço atual + checkbox grande. Cor de destaque
 * vem do builder (theme.bumpAccentColor).
 *
 * Em quase todos os templates é renderizado ACIMA do botão CTA — esse é
 * o spot historicamente com maior conversão.
 */
export function BumpBlock({
  bump,
  selected,
  onToggle,
  textColor = "#18181b",
  subtleColor = "#71717a",
  borderColor = "#e4e4e7",
  cardColor = "#ffffff",
  currency = "BRL",
}: {
  bump: NonNullable<import("./types").TemplateProps["bump"]>;
  selected: boolean;
  onToggle: (next: boolean) => void;
  textColor?: string;
  subtleColor?: string;
  borderColor?: string;
  cardColor?: string;
  /** Moeda do checkout (BRL/USD/EUR). Default BRL. */
  currency?: string;
}) {
  const accent = bump.accentColor || "#facc15";
  const formatBRL = (cents: number) => formatMoney(cents, currency);
  return (
    <button
      type="button"
      onClick={() => onToggle(!selected)}
      className="w-full overflow-hidden rounded-2xl text-left transition shadow-sm hover:shadow-md"
      style={{
        background: cardColor,
        borderWidth: 2,
        borderStyle: selected ? "solid" : "dashed",
        borderColor: selected ? accent : borderColor,
      }}
    >
      {bump.badge && (
        <div
          className="px-4 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider"
          style={{ background: accent, color: "#000" }}
        >
          {bump.badge}
        </div>
      )}

      <div className="flex items-start gap-3 p-4">
        {bump.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bump.imageUrl}
            alt={bump.name}
            className="size-14 shrink-0 rounded-lg object-cover"
            style={{ borderWidth: 1, borderStyle: "solid", borderColor: borderColor }}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: textColor }}>
            {bump.name}
          </p>
          {bump.description && (
            <p className="mt-0.5 text-xs leading-snug" style={{ color: subtleColor }}>
              {bump.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {bump.originalPrice && (
              <span
                className="text-xs line-through"
                style={{ color: subtleColor }}
              >
                {bump.originalPrice}
              </span>
            )}
            <span
              className="text-base font-bold"
              style={{ color: accent }}
            >
              + {formatBRL(bump.priceCents)}
            </span>
          </div>
        </div>

        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition"
          style={{
            background: selected ? accent : "transparent",
            borderColor: selected ? accent : borderColor,
            color: selected ? "#000" : "transparent",
          }}
          aria-hidden="true"
        >
          {selected && <Check className="size-4" strokeWidth={3} />}
        </span>
      </div>

      <div
        className="border-t px-4 py-2 text-center text-xs font-semibold"
        style={{
          borderColor: selected ? accent : borderColor,
          color: selected ? accent : subtleColor,
          background: selected ? `${accent}10` : "transparent",
        }}
      >
        {selected ? "✓ Adicionado ao pedido" : (bump.buttonText || "Sim, adicionar")}
      </div>
    </button>
  );
}
