"use client";
/**
 * Barras horizontais empilhadas: mix de origens (sessionSource) dos leads de
 * cada artista. Cada segmento = total de oportunidades vindas daquela origem,
 * com as mesmas cores das demais seções.
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import type { ArtistBySource } from "@capone/shared";
import { ChartContainer, DarkTooltip, sourceColor } from "./ChartContainer";

export function ArtistSourceChart({ data }: { data: ArtistBySource }) {
  const rows = data.rows
    .filter((r) => r.artist !== "(não preenchido)")
    .map((r) => ({
      artist: r.artist,
      ...Object.fromEntries(data.sources.map((s) => [s, r.bySource[s]?.total ?? 0])),
    }));
  if (!rows.length) return null;
  return (
    <ChartContainer height={Math.max(220, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 32, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="artist"
          type="category"
          tick={{ fill: "var(--ink)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
        {data.sources.map((s, i) => (
          <Bar key={s} name={s} dataKey={s} stackId="src" fill={sourceColor(s, i)} maxBarSize={26} />
        ))}
        <DarkTooltip valueFormatter={(v) => `${v} leads`} />
      </BarChart>
    </ChartContainer>
  );
}
