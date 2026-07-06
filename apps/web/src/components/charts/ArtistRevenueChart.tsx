"use client";
/** Horizontal BarChart: artistas ordenados por receita convertida. */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Cell } from "recharts";
import { ChartContainer, DarkTooltip, fmtBRL, COLORS } from "./ChartContainer";

type Row = {
  label: string;
  total: number;
  convertidos: number;
  naoConvertidos: number;
  taxaConversao: number;
  ticketMedio: number;
  receitaConvertida: number;
};

export function ArtistRevenueChart({ rows, limit = 12 }: { rows: Row[]; limit?: number }) {
  if (!rows.length) return null;
  const data = rows
    .filter((r) => r.label !== "(nao preenchido)" && r.receitaConvertida > 0)
    .sort((a, b) => b.receitaConvertida - a.receitaConvertida)
    .slice(0, limit);
  if (!data.length) return null;
  return (
    <ChartContainer height={Math.max(220, data.length * 28)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 80, left: 0, bottom: 0 }}
      >
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          tickFormatter={(v: number) => "R$" + (v / 1000).toFixed(0) + "k"}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="label"
          type="category"
          tick={{ fill: "var(--ink)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <Bar dataKey="receitaConvertida" radius={[0, 4, 4, 0]}>
          {data.map((r, i) => (
            <Cell
              key={i}
              fill={
                r.taxaConversao >= 0.6
                  ? COLORS.green
                  : r.taxaConversao >= 0.3
                  ? COLORS.yellow
                  : COLORS.red
              }
            />
          ))}
          <LabelList
            dataKey="receitaConvertida"
            position="right"
            fill="var(--ink)"
            style={{ fontSize: 11, fontWeight: 600 }}
            formatter={(v: unknown) => fmtBRL(Number(v))}
          />
        </Bar>
        <DarkTooltip valueFormatter={fmtBRL} />
      </BarChart>
    </ChartContainer>
  );
}
