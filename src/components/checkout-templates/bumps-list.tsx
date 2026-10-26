"use client";

import { useState, useEffect } from "react";
import { Check, ImageOff } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import type { TemplateProps } from "./types";

type OrderBumpsListProps = {
  bumps: NonNullable<TemplateProps["orderBumps"]>;
  selectedIds: string[];
  onToggle: (id: string, next: boolean) => void;
  textColor?: string;
  subtleColor?: string;
  borderColor?: string;
  cardColor?: string;
  accentColor?: string;
  /** Moeda do checkout (BRL/USD/EUR). Default BRL. */
  currency?: string;
};

/**
 * Lista de OrderBumps v2 — múltiplos bumps por checkout, cada um com
 * imagem + título + descrição + preço (com opção de preço "de" riscado).
 * Renderizado em sequência dentro do template; o cliente marca os que
 * quer adicionar ao pedido.
 */
export function OrderBumpsList({
  bumps,
  selectedIds,
  onToggle,
  textColor = "#18181b",
  subtleColor = "#71717a",
  borderColor = "#e4e4e7",
  cardColor = "#ffffff",
  accentColor = "#facc15",
  currency = "BRL",
}: OrderBumpsListProps) {
  const formatBRL = (cents: number) => formatMoney(cents, currency);
  if (bumps.length === 0) return null;
  return (
    <div className="space-y-2">
      {bumps.map((b) => {
        const selected = selectedIds.includes(b.id);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onToggle(b.id, !selected)}
            className="w-full overflow-hidden rounded-xl text-left transition shadow-sm hover:shadow-md"
            style={{
              background: cardColor,
              borderWidth: 2,
              borderStyle: selected ? "solid" : "dashed",
              borderColor: selected ? accentColor : borderColor,
            }}
          >
            <div className="flex items-center gap-3 p-3">
              <div
                className="size-14 shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ background: borderColor }}
              >
                {b.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.imageUrl}
                    alt={b.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageOff className="size-4" style={{ color: subtleColor }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-bold leading-tight"
                  style={{ color: textColor }}
                >
                  {b.title}
                </p>
                {b.description && (
                  <p
                    className="mt-0.5 text-[11px] leading-tight"
                    style={{ color: subtleColor }}
                  >
                    {b.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: accentColor }}
                  >
                    {formatBRL(b.priceCents)}
                  </span>
                  {b.originalPriceCents != null &&
                    b.originalPriceCents > b.priceCents && (
                      <span
                        className="text-[11px] tabular-nums line-through"
                        style={{ color: subtleColor }}
                      >
                        {formatBRL(b.originalPriceCents)}
                      </span>
                    )}
                </div>
              </div>
              <span
                className="size-6 shrink-0 rounded-md border-2 flex items-center justify-center"
                style={{
                  borderColor: selected ? accentColor : borderColor,
                  background: selected ? accentColor : "transparent",
                }}
              >
                {selected && <Check className="size-3.5" style={{ color: "white" }} />}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

type ShippingListProps = {
  options: NonNullable<TemplateProps["shippingOptions"]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  textColor?: string;
  subtleColor?: string;
  borderColor?: string;
  cardColor?: string;
  accentColor?: string;
  /** Moeda do checkout (BRL/USD/EUR). Default BRL. */
  currency?: string;
};

/**
 * Lista de opções de frete. Comportamento radio (single-select).
 * Cliente escolhe uma; o priceCents da escolha é adicionado ao total.
 * Marca a default automaticamente quando montar.
 */
export function ShippingList({
  options,
  selectedId,
  onSelect,
  textColor = "#18181b",
  subtleColor = "#71717a",
  borderColor = "#e4e4e7",
  cardColor = "#ffffff",
  accentColor = "#2563eb",
  currency = "BRL",
}: ShippingListProps) {
  const formatBRL = (cents: number) => formatMoney(cents, currency);
  // Auto-select default option no primeiro render se nada selecionado
  useEffect(() => {
    if (selectedId || options.length === 0) return;
    const def = options.find((o) => o.isDefault) ?? options[0];
    if (def) onSelect(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length]);

  if (options.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p
        className="text-[11px] uppercase tracking-wider font-semibold mb-1"
        style={{ color: subtleColor }}
      >
        Frete
      </p>
      {options.map((o) => {
        const selected = selectedId === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className="w-full rounded-xl text-left transition"
            style={{
              background: cardColor,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: selected ? accentColor : borderColor,
            }}
          >
            <div className="flex items-center gap-3 p-3">
              <span
                className="size-4 shrink-0 rounded-full border-2 flex items-center justify-center"
                style={{
                  borderColor: selected ? accentColor : borderColor,
                  background: cardColor,
                }}
              >
                {selected && (
                  <span
                    className="size-2 rounded-full"
                    style={{ background: accentColor }}
                  />
                )}
              </span>
              {o.imageUrl && (
                <div
                  className="size-10 shrink-0 rounded overflow-hidden flex items-center justify-center"
                  style={{ background: borderColor }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={o.imageUrl}
                    alt={o.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-bold"
                  style={{ color: textColor }}
                >
                  {o.name}
                </p>
                {(o.description || o.estimatedTime) && (
                  <p
                    className="text-[11px]"
                    style={{ color: subtleColor }}
                  >
                    {o.estimatedTime
                      ? o.estimatedTime
                      : o.description}
                  </p>
                )}
              </div>
              <span
                className="text-sm font-bold tabular-nums shrink-0"
                style={{ color: o.priceCents === 0 ? "#10b981" : textColor }}
              >
                {o.priceCents === 0 ? "Grátis" : formatBRL(o.priceCents)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hook helper pra estado consolidado: bumps selecionados + frete selecionado
 * + cálculo do total adicional. Pra usar dentro dos templates.
 */
export function useBumpsShippingState({
  bumps,
  shipping,
}: {
  bumps: NonNullable<TemplateProps["orderBumps"]>;
  shipping: NonNullable<TemplateProps["shippingOptions"]>;
}) {
  const [selectedBumpIds, setSelectedBumpIds] = useState<string[]>([]);
  const [selectedShippingId, setSelectedShippingId] = useState<string | null>(
    null,
  );

  function toggleBump(id: string, next: boolean) {
    setSelectedBumpIds((s) =>
      next ? [...s, id] : s.filter((x) => x !== id),
    );
  }

  const selectedBumps = selectedBumpIds
    .map((id) => bumps.find((x) => x.id === id))
    .filter((b): b is (typeof bumps)[number] => b !== undefined);

  const selectedShipping = selectedShippingId
    ? shipping.find((s) => s.id === selectedShippingId) ?? null
    : null;

  const bumpsTotal = selectedBumps.reduce((sum, b) => sum + b.priceCents, 0);

  const shippingTotal = selectedShipping?.priceCents ?? 0;

  return {
    selectedBumpIds,
    toggleBump,
    selectedShippingId,
    setSelectedShippingId,
    selectedBumps,
    selectedShipping,
    bumpsTotal,
    shippingTotal,
    extrasTotal: bumpsTotal + shippingTotal,
  };
}
