"use client";
/**
 * Widget de agendamentos do hero: total + matriz origem × status.
 * Cada linha = uma origem (sessionSource do contato: Paid Social, CRM UI, ...).
 * Cada coluna = um status (showed, noshow, cancelled, confirmed, new, invalid).
 * Dentro de cada célula, count e % do total da linha (show rate da origem).
 *
 * Mantém os 2 agregados (byStatus, byOrigin) no schema, mas não renderiza —
 * a matriz é a visão operacional (qual canal perde mais em no-show, etc.).
 */
import type { AppointmentsBreakdown } from "@capone/shared";

// Labels e cores pt-BR para os valores crus do GHL
const STATUS_META: Record<string, { label: string; color: string }> = {
  showed: { label: "Compareceu", color: "var(--green)" },
  confirmed: { label: "Confirmado", color: "var(--accent)" },
  new: { label: "Novo", color: "var(--yellow)" },
  noshow: { label: "Não compareceu", color: "var(--red)" },
  cancelled: { label: "Cancelado", color: "var(--muted)" },
  invalid: { label: "Inválido", color: "var(--line)" },
  "(sem status)": { label: "Sem status", color: "var(--line)" },
};
// Valores de attributionSource.sessionSource do GHL
const ORIGIN_META: Record<string, { label: string; color: string }> = {
  "Paid Social": { label: "Paid Social", color: "var(--accent)" },
  "Paid Search": { label: "Paid Search", color: "var(--yellow)" },
  "Social media": { label: "Social media", color: "var(--green)" },
  "Organic Search": { label: "Organic Search", color: "var(--accent-2)" },
  "CRM UI": { label: "CRM UI", color: "var(--red)" },
  "Direct traffic": { label: "Direct traffic", color: "var(--muted)" },
};
const FALLBACK_ORIGIN_COLORS = ["var(--accent)", "var(--accent-2)", "var(--green)", "var(--yellow)", "var(--red)", "var(--muted)", "var(--cyan)"];

function metaLabel(meta: Record<string, { label: string }>, key: string, fallback: string): string {
  return meta[key]?.label ?? (fallback || key);
}

export function AppointmentsPieChart({ data }: { data: AppointmentsBreakdown }) {
  const { origins, statuses, matrix, rowTotals, colTotals } = data.byOriginStatus;

  if (origins.length === 0 || statuses.length === 0) {
    return <div className="sub" style={{ marginTop: 8 }}>Sem agendamentos no período.</div>;
  }

  // Show rate por origem (showed / total origem) — KPI por linha
  function showRate(origin: string): number | null {
    const t = rowTotals[origin] ?? 0;
    if (t === 0) return null;
    return (matrix[origin]?.showed ?? 0) / t;
  }

  return (
    <div className="scroll-x" style={{ marginTop: 4 }}>
      <table style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ borderLeft: "none" }}>Origem</th>
            {statuses.map((s) => {
              const m = STATUS_META[s];
              return (
                <th key={s} className="num" style={{ borderLeft: "1px solid var(--line)", color: m?.color }}>
                  {metaLabel(STATUS_META, s, s)}
                </th>
              );
            })}
            <th className="num" style={{ borderLeft: "1px solid var(--line)" }}>Total</th>
            <th className="num" style={{ borderLeft: "1px solid var(--line)" }}>Show rate</th>
          </tr>
        </thead>
        <tbody>
          {origins.map((origin, i) => {
            const total = rowTotals[origin] ?? 0;
            const rate = showRate(origin);
            const rateColor = rate == null ? "var(--muted)" : rate >= 0.7 ? "var(--green)" : rate >= 0.4 ? "var(--yellow)" : "var(--red)";
            return (
              <tr key={origin}>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: ORIGIN_META[origin]?.color ?? FALLBACK_ORIGIN_COLORS[i % FALLBACK_ORIGIN_COLORS.length],
                      marginRight: 6,
                      verticalAlign: "middle",
                    }}
                  />
                  <strong>{metaLabel(ORIGIN_META, origin, origin)}</strong>
                </td>
                {statuses.map((s) => {
                  const c = matrix[origin]?.[s] ?? 0;
                  const pct = total > 0 ? (c / total) * 100 : 0;
                  const m = STATUS_META[s];
                  return (
                    <td
                      key={s}
                      className="num"
                      title={`${metaLabel(STATUS_META, s, s)} • ${pct.toFixed(1)}% da origem`}
                      style={{
                        borderLeft: "1px solid var(--line)",
                        color: c === 0 ? "var(--muted)" : m?.color,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontWeight: c > 0 ? 600 : 400 }}>{c}</span>
                        {c > 0 && (
                          <span style={{ width: `${Math.max(8, pct)}%`, maxWidth: 60, height: 3, background: m?.color, borderRadius: 2, alignSelf: "flex-end" }} />
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="num" style={{ borderLeft: "1px solid var(--line)", fontWeight: 600 }}>{total}</td>
                <td className="num" style={{ borderLeft: "1px solid var(--line)", color: rateColor, fontWeight: 600 }}>
                  {rate == null ? "—" : `${Math.round(rate * 100)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ borderTop: "2px solid var(--line)", color: "var(--muted)" }}>Total</td>
            {statuses.map((s) => {
              const c = colTotals[s] ?? 0;
              const m = STATUS_META[s];
              return (
                <td key={s} className="num" style={{ borderLeft: "1px solid var(--line)", borderTop: "2px solid var(--line)", color: c === 0 ? "var(--muted)" : m?.color, fontWeight: 600 }}>
                  {c}
                </td>
              );
            })}
            <td className="num" style={{ borderLeft: "1px solid var(--line)", borderTop: "2px solid var(--line)", fontWeight: 700 }}>{data.total}</td>
            <td className="num" style={{ borderLeft: "1px solid var(--line)", borderTop: "2px solid var(--line)", color: "var(--muted)" }}>—</td>
          </tr>
        </tfoot>
      </table>
      <div className="sub" style={{ marginTop: 6, fontSize: 11 }}>
        Cada célula = <strong>contagem</strong> + barra fina com % da origem. Coluna &quot;Show rate&quot; = compareceu ÷ total da origem (verde ≥70%, amarelo 40–70%, vermelho &lt;40%).
      </div>
    </div>
  );
}
