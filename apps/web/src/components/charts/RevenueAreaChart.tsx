"use client";
/** AreaChart: receita acumulada por dia (mostra ritmo de fechamento do mês). */
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer, DarkTooltip, fmtBRL } from "./ChartContainer";

type Row = { date: string; receita: number; acumulado: number };

export function RevenueAreaChart({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <ChartContainer height={220}>
      <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--green)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          tickFormatter={(v: string) => v.slice(8, 10)}
          axisLine={{ stroke: "var(--line)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
          axisLine={false}
          tickLine={false}
        />
        <Area
          type="monotone"
          dataKey="acumulado"
          stroke="var(--green)"
          fill="url(#revenueGrad)"
          strokeWidth={2}
        />
        <DarkTooltip valueFormatter={fmtBRL} />
      </AreaChart>
    </ChartContainer>
  );
}
