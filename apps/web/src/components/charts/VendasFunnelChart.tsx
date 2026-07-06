"use client";
/** FunnelChart: estágios do pipeline Vendas com taxa de conversão entre eles. */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Cell } from "recharts";
import { ChartContainer, DarkTooltip, fmtPct, COLORS } from "./ChartContainer";

type Stage = { name: string; count: number; rate: number };

export function VendasFunnelChart({ stages }: { stages: Stage[] }) {
  if (!stages.length) return null;
  return (
    <ChartContainer height={280}>
      <BarChart
        data={stages}
        layout="vertical"
        margin={{ top: 8, right: 60, left: 0, bottom: 0 }}
      >
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fill: "var(--ink)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={140}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {stages.map((s, i) => (
            <Cell
              key={i}
              fill={
                s.rate >= 0.9
                  ? COLORS.green
                  : s.rate >= 0.5
                  ? COLORS.yellow
                  : COLORS.red
              }
            />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            fill="var(--ink)"
            style={{ fontSize: 12, fontWeight: 600 }}
          />
        </Bar>
        <DarkTooltip
          valueFormatter={(v) => `${v} oportunidades`}
        />
      </BarChart>
    </ChartContainer>
  );
}
