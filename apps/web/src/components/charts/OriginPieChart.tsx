"use client";
/** PieChart: origem dos contatos (sessão de attribution). */
import { PieChart, Pie, Cell } from "recharts";
import { ChartContainer, DarkTooltip, fmtPct, COLORS } from "./ChartContainer";

interface Row { label: string; count: number; percent: number }

const PIE_COLORS = [
  COLORS.accent,
  COLORS.accent2,
  COLORS.green,
  COLORS.yellow,
  COLORS.red,
];

export function OriginPieChart({ rows, limit = 6 }: { rows: Row[]; limit?: number }) {
  if (!rows.length) return null;
  const data = rows
    .filter((r) => r.label !== "(sem)")
    .slice(0, limit);
  if (!data.length) return null;
  return (
    <ChartContainer height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius={50}
          outerRadius={85}
          paddingAngle={2}
          stroke="var(--panel)"
          strokeWidth={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <DarkTooltip
          valueFormatter={(v) => `${v} contatos`}
        />
      </PieChart>
    </ChartContainer>
  );
}

export function OriginLegend({ rows, limit = 6 }: { rows: Row[]; limit?: number }) {
  const data = rows.filter((r) => r.label !== "(sem)").slice(0, limit);
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
      {data.map((r, i) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: PIE_COLORS[i % PIE_COLORS.length],
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, color: "var(--ink)" }}>{r.label}</span>
          <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {r.count.toLocaleString("pt-BR")} <span style={{ opacity: 0.6 }}>({fmtPct(r.percent / 100)})</span>
          </span>
        </div>
      ))}
    </div>
  );
}
