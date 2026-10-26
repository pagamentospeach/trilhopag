"use client";

/**
 * Lazy-loading wrapper pro RevenueChart (recharts).
 *
 * recharts pesa ~95kb gzipped — bundle inicial do dashboard ficava enorme
 * por causa dele. Como o chart fica abaixo da fold no /dashboard, lazy-load
 * com fallback estatico nao prejudica a UX visualmente E corta uns 80kb
 * do TTI inicial em PCs fracos.
 */
import dynamic from "next/dynamic";

type Point = {
  date: string;
  label: string;
  revenueCents: number;
  count: number;
};

export const RevenueChart = dynamic<{ data: Point[] }>(
  () =>
    import("./revenue-chart").then((m) => ({
      default: m.RevenueChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center">
        <span className="text-xs text-zinc-500">carregando gráfico…</span>
      </div>
    ),
  },
);
