"use client";

/**
 * BumpSlot — wrapper que renderiza <OrderBumpsList> só se `position`
 * (do builder) bater com `slot` (onde o template chama). Centraliza a
 * lógica pra os templates não duplicarem if-else.
 *
 * Slots possíveis:
 *  - "top"            → antes do produto e pagamento
 *  - "above_payment"  → depois do produto, antes do método
 *  - "below_payment"  → depois do método, antes do CTA (DEFAULT)
 *  - "after_cta"      → após o botão de comprar
 */
import { OrderBumpsList } from "./bumps-list";

type Bump = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  originalPriceCents: number | null;
};

export function BumpSlot({
  slot,
  position,
  bumps,
  selectedIds,
  onToggle,
  textColor,
  subtleColor,
  borderColor,
  cardColor,
  accentColor,
  currency,
}: {
  /** Onde no template esse bloco está sendo chamado. */
  slot: "top" | "above_payment" | "below_payment" | "after_cta";
  /** Onde o seller escolheu mostrar os bumps. Default = below_payment. */
  position: string | undefined;
  bumps: Bump[];
  selectedIds: string[];
  onToggle: (id: string, on: boolean) => void;
  textColor: string;
  subtleColor: string;
  borderColor: string;
  cardColor: string;
  accentColor: string;
  /** Moeda do checkout (BRL/USD/EUR). */
  currency?: string;
}) {
  if (!bumps || bumps.length === 0) return null;
  const effective = position || "below_payment";
  if (effective !== slot) return null;
  return (
    <OrderBumpsList
      bumps={bumps}
      selectedIds={selectedIds}
      onToggle={onToggle}
      textColor={textColor}
      subtleColor={subtleColor}
      borderColor={borderColor}
      cardColor={cardColor}
      accentColor={accentColor}
      currency={currency}
    />
  );
}
