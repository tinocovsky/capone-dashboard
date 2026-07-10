"use client";
/**
 * Contatos por origem no período — card de destaque do hero.
 * Soma report.contactsByDaySource (já com o fallback "Fonte do negócio"
 * aplicado — ver resolveOrigin em apps/api/src/report.ts) por origem,
 * ordenado por volume. Mesmas cores de origem usadas no 3.1 e nos agendamentos.
 */
import type { ContactsByDaySource } from "@capone/shared";
import { sourceColor } from "./ChartContainer";

interface Row { source: string; count: number }

export function ContactsByOriginCard({ data, total }: { data: ContactsByDaySource; total: number }) {
  const rows: Row[] = data.sources
    .map((s) => ({
      source: s,
      count: data.rows.reduce((sum, r) => sum + (r.bySource[s] ?? 0), 0),
    }))
    .sort((a, b) => b.count - a.count);
  if (!rows.length) return <div className="note">Sem dados de origem para o período.</div>;
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="origin-bars">
      {rows.map((r, i) => {
        const pct = total ? (r.count / total) * 100 : 0;
        const w = (r.count / max) * 100;
        return (
          <div key={r.source} className="ob-row">
            <div className="ob-head">
              <span className="ob-label">{r.source}</span>
              <span className="ob-meta">
                <strong>{r.count.toLocaleString("pt-BR")}</strong>
                <span style={{ color: "var(--muted)" }}> ({pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="ob-track">
              <div className="ob-fill" style={{ width: `${w}%`, background: sourceColor(r.source, i) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
