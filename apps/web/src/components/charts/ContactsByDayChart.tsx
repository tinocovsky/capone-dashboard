"use client";
/** BarChart: contatos por dia do mês. Cores amarelo para dias de pico (>= 90 leads). */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { ChartContainer, DarkTooltip, fmtPct, COLORS } from "./ChartContainer";

interface Row { label: string; count: number; percent: number }

export function ContactsByDayChart({ rows, total }: { rows: Row[]; total: number }) {
  if (!rows.length) return null;
  // Picos: dias com >= 90 leads (semana da campanha de ads)
  const peakThreshold = 90;
  return (
    <ChartContainer height={140}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          tickFormatter={(v: string) => v.slice(8, 10)} // só dia "DD"
          interval={1}
          axisLine={{ stroke: "var(--line)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={28}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.count >= peakThreshold ? COLORS.yellow : COLORS.accent} />
          ))}
        </Bar>
        <DarkTooltip
          valueFormatter={(v) => `${v} contatos (${fmtPct(v / total)})`}
        />
      </BarChart>
    </ChartContainer>
  );
}
