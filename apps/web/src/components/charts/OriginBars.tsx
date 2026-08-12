"use client";
/**
 * Barras horizontais para o destaque da origem no hero do dashboard.
 * Mostra os 4 buckets canônicos (Artistas / Social Pago / Social Orgânico /
 * Passante) + "Outros", com:
 *   - contagem de oportunidades
 *   - barra proporcional ao total
 *   - badge de conversão e receita
 * Tema dark via CSS vars.
 */
import type { OriginBreakdown } from "@capone/shared";
import { fmtBRL, fmtPct } from "@/lib/format";

const CORES = {
  artista: "var(--accent-2)",      // roxo
  social_pago: "var(--accent)",    // azul
  social_organico: "var(--green)", // verde
  passante: "var(--yellow)",       // amarelo
  outros: "var(--muted)",          // cinza
};

const LABELS = {
  artista: "Artistas (Art)",
  social_pago: "Social Pago (Inb)",
  social_organico: "Social Orgânico (Inb)",
  passante: "Passante (Pas)",
  outros: "Outros",
};

interface Row { key: keyof typeof LABELS; visitas: number; convertidas: number; receita: number; taxaConversao: number }

export function OriginBars({ data }: { data: OriginBreakdown | undefined }) {
  if (!data) {
    return <div className="note">Sem dados de origem para o período.</div>;
  }
  const order: (keyof typeof LABELS)[] = ["artista", "social_pago", "social_organico", "passante", "outros"];
  const rows: Row[] = order.map((k) => ({
    key: k,
    visitas: data[k].visitas,
    convertidas: data[k].convertidas,
    receita: data[k].receita,
    taxaConversao: data[k].taxaConversao,
  }));
  const max = Math.max(1, ...rows.map((r) => r.visitas));

  return (
    <div className="origin-bars">
      {rows.map((r) => {
        const w = (r.visitas / max) * 100;
        const convClass = r.taxaConversao >= 0.6 ? "green" : r.taxaConversao >= 0.3 ? "yellow" : "red";
        return (
          <div key={r.key} className="ob-row">
            <div className="ob-head">
              <span className="ob-label">{LABELS[r.key]}</span>
              <span className="ob-meta">
                <strong>{r.visitas.toLocaleString("pt-BR")}</strong>
                <span style={{ color: "var(--muted)" }}> oportunidades</span>
                {r.convertidas > 0 && (
                  <>
                    <span style={{ color: "var(--muted)", margin: "0 6px" }}>•</span>
                    <span className={convClass} style={{ fontWeight: 600 }}>{fmtPct(r.taxaConversao)}</span>
                    <span style={{ color: "var(--muted)" }}> conv</span>
                  </>
                )}
              </span>
            </div>
            <div className="ob-track">
              <div
                className="ob-fill"
                style={{ width: `${w}%`, background: CORES[r.key] }}
              />
            </div>
            <div className="ob-foot">
              <span style={{ color: "var(--muted)" }}>{r.convertidas} convertidos</span>
              {r.receita > 0 && (
                <strong style={{ color: "var(--green)" }}>{fmtBRL(r.receita)}</strong>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
