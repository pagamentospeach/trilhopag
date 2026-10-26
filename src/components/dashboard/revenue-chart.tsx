"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useIsLightTheme } from "@/lib/use-theme-mode";

type Point = {
  date: string;
  label: string;
  revenueCents: number;
  count: number;
};

/**
 * Recharts escreve stroke/fill como ATRIBUTO XML no SVG, e var() não resolve
 * em atributo — por isso o gráfico não pega a inversão de variáveis do modo
 * claro sozinho e as cores vêm de JS aqui (06/08/2026, toggle claro/escuro).
 *
 * No claro: a malha branca 4% (invisível no branco) vira preta 6%, o ciano
 * escurece pro tom que se lê em fundo claro e o tooltip inverte.
 */
export function RevenueChart({ data }: { data: Point[] }) {
  const isLight = useIsLightTheme();

  const line = isLight ? "#4d7c0f" : "#22d3ee";
  const grid = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
  const axis = "#71717a"; // cinza médio — legível nos dois fundos.

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line} stopOpacity={0.4} />
              <stop offset="100%" stopColor={line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={axis}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(data.length / 6) - 1)}
          />
          <YAxis
            stroke={axis}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              v >= 100000
                ? `R$ ${(v / 100000).toFixed(0)}k`
                : `R$ ${(v / 100).toFixed(0)}`
            }
            width={48}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: isLight
                ? "rgba(255,255,255,0.97)"
                : "rgba(10,10,10,0.95)",
              border: `1px solid ${
                isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"
              }`,
              borderRadius: 12,
              fontSize: 12,
              color: isLight ? "#09090b" : "#fafafa",
            }}
            labelStyle={{
              color: isLight ? "#52525b" : "#a1a1aa",
              fontSize: 11,
            }}
            formatter={(value, name) => [
              name === "revenueCents"
                ? `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`
                : String(value),
              name === "revenueCents" ? "Receita" : "Vendas",
            ]}
          />
          <Area
            type="monotone"
            dataKey="revenueCents"
            stroke={line}
            strokeWidth={2}
            fill="url(#rev)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
