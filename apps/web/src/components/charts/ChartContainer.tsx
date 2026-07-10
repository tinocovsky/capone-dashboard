"use client";
/**
 * Wrapper dos charts Recharts que:
 *  - usa as CSS vars do tema dark (--accent, --green, --yellow, --red, --ink, --muted)
 *  - responde ao container (ResponsiveContainer)
 *  - mostra tooltip formatado em pt-BR (BRL, %)
 *  - hover highlight
 */
import {
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { fmtBRL, fmtPct } from "@/lib/format";

export const COLORS = {
  accent: "var(--accent)",
  accent2: "var(--accent-2)",
  green: "var(--green)",
  cyan: "var(--cyan)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  ink: "var(--ink)",
  muted: "var(--muted)",
  line: "var(--line)",
  panel: "var(--panel)",
  panel2: "var(--panel-2)",
};

// Cores fixas por sessionSource ("UTM Session Source" do GHL) — consistentes
// entre o gráfico de contatos por dia e o widget de agendamentos.
export const SESSION_SOURCE_COLORS: Record<string, string> = {
  "Paid Social": COLORS.accent,
  "Paid Search": COLORS.yellow,
  "Social media": COLORS.green,
  "Organic Search": COLORS.accent2,
  "CRM UI": COLORS.red,
  "Direct traffic": COLORS.muted,
  // Grupos da seção 2.1 (Capone × Artistas)
  "Clientes Capone": COLORS.accent,
  "Clientes dos Artistas": COLORS.cyan,
  // Labels de fallback via "Fonte do negócio" (aparecem quando o source nativo está em branco/CRM UI)
  "Artistas (Art)": COLORS.cyan,
  "Passante (Pas)": COLORS.accent2,
  "Social Pago (Inb)": COLORS.accent,
};
const FALLBACK_PALETTE = [COLORS.accent, COLORS.accent2, COLORS.green, COLORS.yellow, COLORS.red, COLORS.muted];
export function sourceColor(label: string, i: number): string {
  return SESSION_SOURCE_COLORS[label] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

export function ChartContainer({ children, height = 240 }: { children: React.ReactNode; height?: number }) {
  return (
    <div style={{ width: "100%", height, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

// Tipo mínimo do payload (Recharts exporta um tipo mas é genérico)
interface TooltipEntry { name?: string; value?: number; color?: string }

/** Tooltip dark com formatação automática (BRL se valor >= 1000, % se 0..1).
 *  `valueFormatter` recebe também o nome da série, p/ formatar séries mistas
 *  (ex.: contagens + receita no mesmo gráfico). */
export function DarkTooltip(props: TooltipProps<number, string> & {
  valueFormatter?: (v: number, name?: string) => string;
}) {
  // Recharts v3 mudou a tipagem; recebemos via any para acessar payload/label sem dor.
  const p = props as unknown as {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string | number;
  };
  const { active, payload, label } = p;
  const valueFormatter = (props as { valueFormatter?: (v: number, name?: string) => string }).valueFormatter;
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--ink)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      {label !== undefined && (
        <div style={{ color: "var(--muted)", marginBottom: 4, fontSize: 11 }}>{label}</div>
      )}
      {payload.map((entry, i) => {
        const v = entry.value ?? 0;
        const display = valueFormatter
          ? valueFormatter(v, entry.name)
          : Math.abs(v) >= 1000
          ? fmtBRL(v)
          : v <= 1 && v >= 0
          ? fmtPct(v)
          : v.toLocaleString("pt-BR");
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: entry.color,
                display: "inline-block",
              }}
            />
            <span style={{ color: "var(--muted)" }}>{entry.name}:</span>
            <strong>{display}</strong>
          </div>
        );
      })}
    </div>
  );
}

export { fmtBRL, fmtPct };
