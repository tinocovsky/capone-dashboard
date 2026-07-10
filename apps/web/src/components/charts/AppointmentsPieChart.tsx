"use client";
/**
 * Widget de agendamentos do hero: total + duas rosquinhas (por status do
 * agendamento e por origem do CONTATO agendado — sessionSource do GHL:
 * Paid Social, Paid Search, Social media, CRM UI, ...), com legenda.
 */
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { AppointmentsBreakdown } from "@capone/shared";
import { DarkTooltip } from "./ChartContainer";

interface Row { label: string; count: number; percent: number }

// Labels e cores pt-BR para os valores crus do GHL
const STATUS_META: Record<string, { label: string; color: string }> = {
  confirmed: { label: "Confirmado", color: "var(--accent)" },
  showed: { label: "Compareceu", color: "var(--green)" },
  noshow: { label: "Não compareceu", color: "var(--red)" },
  cancelled: { label: "Cancelado", color: "var(--muted)" },
  new: { label: "Novo", color: "var(--yellow)" },
  invalid: { label: "Inválido", color: "var(--line)" },
};
// Valores de attributionSource.sessionSource do GHL (mantidos como aparecem lá)
const ORIGIN_META: Record<string, { label: string; color: string }> = {
  "Paid Social": { label: "Paid Social", color: "var(--accent)" },
  "Paid Search": { label: "Paid Search", color: "var(--yellow)" },
  "Social media": { label: "Social media", color: "var(--green)" },
  "Organic Search": { label: "Organic Search", color: "var(--accent-2)" },
  "CRM UI": { label: "CRM UI", color: "var(--red)" },
  "Direct traffic": { label: "Direct traffic", color: "var(--muted)" },
};
const FALLBACK_COLORS = ["var(--accent)", "var(--accent-2)", "var(--green)", "var(--yellow)", "var(--red)", "var(--muted)"];

function decorate(rows: Row[], meta: Record<string, { label: string; color: string }>) {
  return rows.map((r, i) => ({
    ...r,
    name: meta[r.label]?.label ?? r.label,
    color: meta[r.label]?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));
}

function Donut({ title, rows }: { title: string; rows: ReturnType<typeof decorate> }) {
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div className="label" style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {rows.length === 0 ? (
        <div className="sub" style={{ marginTop: 8 }}>Sem dados.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 110, height: 110, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="count"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="95%"
                  paddingAngle={2}
                  stroke="var(--panel)"
                  strokeWidth={2}
                >
                  {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
                </Pie>
                <DarkTooltip valueFormatter={(v) => `${v} agendamentos`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gap: 3, fontSize: 11 }}>
            {rows.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                <span style={{ color: "var(--ink)" }}>{r.name}</span>
                <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                  {r.count} ({r.percent.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppointmentsPieChart({ data }: { data: AppointmentsBreakdown }) {
  const byStatus = decorate(data.byStatus, STATUS_META);
  const byOrigin = decorate(data.byOrigin, ORIGIN_META);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <Donut title="Por status" rows={byStatus} />
      <Donut title="Por origem" rows={byOrigin} />
    </div>
  );
}
