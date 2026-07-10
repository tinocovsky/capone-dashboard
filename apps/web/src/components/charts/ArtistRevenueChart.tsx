"use client";
/**
 * Performance por artista em DOIS painéis alinhados (mesmas linhas, mesma ordem,
 * ordenado por total vendido desc):
 *   1. Total vendido — barra ciano, escala R$ própria e visível.
 *   2. Leads decididos — barra empilhada (verde convertidos + vermelho não
 *      convertidos) com % de conversão na ponta.
 * Substitui o gráfico antigo de eixo duplo (R$ e contagens no mesmo plano),
 * que tornava as barras incomparáveis entre si.
 */
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, Legend, ResponsiveContainer } from "recharts";
import { DarkTooltip, COLORS, fmtBRL } from "./ChartContainer";

interface Row {
  label: string;
  total: number;
  convertidos: number;
  naoConvertidos: number;
  taxaConversao: number;
  ticketMedio: number;
  receitaConvertida: number;
}

const ROW_H = 40; // px por artista (barra de 22px + respiro)

function rateColor(rate: number) {
  return rate >= 0.6 ? "var(--green)" : rate >= 0.3 ? "var(--yellow)" : "var(--red)";
}

/** Rótulo de % de conversão na ponta da barra empilhada, colorido pela régua.
 *  x/y/width/height/index são injetados pelo Recharts (LabelList content). */
interface PctLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  data?: Row[];
}
function PctLabel({ x = 0, y = 0, width = 0, height = 0, index = -1, data = [] }: PctLabelProps) {
  const d = data[index];
  if (!d) return null;
  const decided = d.convertidos + d.naoConvertidos;
  const text = decided ? `${(d.taxaConversao * 100).toFixed(0)}%` : "—";
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      dominantBaseline="central"
      fill={decided ? rateColor(d.taxaConversao) : "var(--muted)"}
      style={{ fontSize: 11, fontWeight: 600 }}
    >
      {text}
    </text>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
      {children}
    </div>
  );
}

export function ArtistPerformanceChart({ rows }: { rows: Row[] }) {
  const data = rows
    .filter((r) => r.label !== "(não preenchido)" && r.total > 0)
    .sort((a, b) => b.receitaConvertida - a.receitaConvertida || b.convertidos - a.convertidos);
  if (!data.length) return null;
  const height = Math.max(240, data.length * ROW_H) + 30; // +30 pro eixo X
  const margin = { top: 8, right: 64, bottom: 0, left: 0 };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
      {/* Painel 1 — Total vendido (escala R$) */}
      <div style={{ flex: "1 1 380px", minWidth: 340 }}>
        <PanelTitle>Total vendido</PanelTitle>
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={margin} barCategoryGap="30%">
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
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
              <Bar name="Total vendido" dataKey="receitaConvertida" fill={COLORS.cyan} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList
                  dataKey="receitaConvertida"
                  position="right"
                  fill="var(--ink)"
                  style={{ fontSize: 11, fontWeight: 600 }}
                  formatter={(v: unknown) => (Number(v) > 0 ? fmtBRL(Number(v)) : "")}
                />
              </Bar>
              <DarkTooltip valueFormatter={fmtBRL} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Painel 2 — Leads decididos (mesmas linhas, escala de contagem) */}
      <div style={{ flex: "1 1 340px", minWidth: 300 }}>
        <PanelTitle>Leads decididos — convertidos × não convertidos</PanelTitle>
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={margin} barCategoryGap="30%">
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              {/* Eixo Y oculto — as linhas alinham com o painel esquerdo */}
              <YAxis dataKey="label" type="category" hide />
              <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />
              <Bar name="Convertidos" dataKey="convertidos" stackId="dec" fill={COLORS.green} stroke="var(--bg)" strokeWidth={1} maxBarSize={22} />
              <Bar name="Não convertidos" dataKey="naoConvertidos" stackId="dec" fill={COLORS.red} stroke="var(--bg)" strokeWidth={1} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList content={<PctLabel data={data} />} />
              </Bar>
              <DarkTooltip valueFormatter={(v) => `${v} leads`} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
