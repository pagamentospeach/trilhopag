"use client";

import { Star } from "lucide-react";

export type TestimonialItem = { name: string; text: string; rating?: number };

/**
 * Testimonials — bloco de "Depoimentos" (prova social) renderizado abaixo de
 * QUALQUER template de checkout.
 *
 * Antes, os depoimentos do builder (theme.testimonials + toggle
 * blockTestimonials) só apareciam no renderer LEGADO do /c/[slug]. Os templates
 * (auto/extra/simple/drop/fast/gringa/tiktok_shop/mercado_livre/amazon/shopee)
 * NÃO renderizavam nada — então o seller ligava "Depoimentos" e não acontecia
 * nada. Agora o TemplateRenderer monta este bloco pra todos os templates.
 *
 * Estilo claro/neutro (cards brancos) que combina com a maioria dos templates.
 */
export function Testimonials({
  items,
  primaryColor = "#16a34a",
  title = "O que dizem nossos clientes",
}: {
  items: TestimonialItem[];
  primaryColor?: string;
  title?: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <section className="border-t border-zinc-200 bg-zinc-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <h2 className="mb-4 text-center text-[15px] font-bold text-zinc-900">
          {title}
        </h2>
        <div className="space-y-3">
          {items.map((t, i) => {
            const stars = Math.max(0, Math.min(5, t.rating ?? 5));
            return (
              <div
                key={i}
                className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="inline-flex size-8 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{ background: primaryColor }}
                  >
                    {(t.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-[13px] font-semibold text-zinc-800">
                    {t.name}
                  </span>
                  <span className="ml-auto inline-flex text-amber-400">
                    {Array.from({ length: stars }).map((_, k) => (
                      <Star key={k} className="size-3.5 fill-current" />
                    ))}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-600">
                  {t.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
