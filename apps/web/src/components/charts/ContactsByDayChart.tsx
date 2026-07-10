"use client";
/**
 * Barras empilhadas: contatos por dia, segregados por sessionSource
 * ("UTM Session Source" do GHL: Paid Social, Social media, CRM UI, ...).
 * Datas no padrão brasileiro (dd/mm no eixo, dd/mm/aaaa no tooltip).
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import type { ContactsByDaySource } from "@capone/shared";
import { ChartContainer, DarkTooltip, sourceColor } from "./ChartContainer";
import { fmtDateBR } from "@/lib/format";

export function ContactsByDayChart({ data }: { data: ContactsByDaySource }) {
  if (!data.rows.length) return null;
  const chartRows = data.rows.map((r) => ({
    date: fmtDateBR(r.date),
    ...r.bySource,
  }));
  return (
    <ChartContainer height={200}>
      <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          tickFormatter={(v: string) => v.slice(0, 5)} // "dd/mm"
          interval={1}
          axisLine={{ stroke: "var(--line)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
        {data.sources.map((s, i) => (
          <Bar key={s} name={s} dataKey={s} stackId="dia" fill={sourceColor(s, i)} maxBarSize={45} />
        ))}
        <DarkTooltip valueFormatter={(v) => `${v} contatos`} />
      </BarChart>
    </ChartContainer>
  );
}
