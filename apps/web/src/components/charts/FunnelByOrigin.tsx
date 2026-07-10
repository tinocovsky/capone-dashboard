"use client";
/**
 * Funil de Vendas por origem/canal — 5 estágios RevOps:
 *   novos       contatos únicos no período
 *   agendaram   appointments com status new/confirmed/showed
 *   visita      opps no pipeline Vendas com createdAt no período
 *   tatAgend    opps no stage "Tatuagem agendada" (lastStageChangeAt)
 *   converteram opps em VENDAS_STAGE_WON (lastStageChangeAt)
 *
 * Visualização: tabela com 1 linha por canal + linha "Total" no fim.
 *   - Coluna de cada estágio: contagem absoluta + step rate (entre stages) + abs rate (sobre o topo)
 *   - Step rate em cor semafórica: verde ≥50%, amarelo 25-50%, vermelho <25%
 *   - Abs rate discreto (cinza), sem cor — é contexto, não gargalo
 *   - Receita no fim pra fechar a decisão (qual canal converte E traz receita)
 *
 * Ver skill `revenue-ops-funnel` pra metodologia e alertas RevOps.
 */
import type { FunnelByOrigin as FunnelByOriginType } from "@capone/shared";
import { fmtBRL, fmtPct } from "@/lib/format";

const STAGE_LABEL: Record<string, string> = {
  novos: "Novos",
  agendaram: "Agendaram",
  visita: "Visita",
  tatAgend: "Tat. agend.",
  converteram: "Converteram",
};

// Limiar da cor semafórica do STEP rate (entre stages consecutivos).
// Funil composto saudável: lead→agend ~25%, agend→visita ~65%, visita→tat.agend ~30%,
// tat.agend→conv ~70%. Composição ~3.4%. Limiar verde ≥50% cai no "show/qualifica
// bem", amarelo 25-50% no "normal com leak", vermelho <25% no "vazando".
function stepClass(rate: number, denom: number): string {
  if (denom === 0) return "";
  if (rate >= 0.5) return "green";
  if (rate >= 0.25) return "yellow";
  return "red";
}

function Cell({ value, rate, absRate, denom }: { value: number; rate: number; absRate: number; denom: number }) {
  if (value === 0) {
    return (
      <td className="num" style={{ color: "var(--muted)" }}>
        <span style={{ display: "block" }}>0</span>
        <span style={{ display: "block", fontSize: 10, color: "var(--muted)" }}>—</span>
      </td>
    );
  }
  const cls = stepClass(rate, denom);
  return (
    <td className="num">
      <strong>{value.toLocaleString("pt-BR")}</strong>
      {denom > 0 && (
        <div style={{ fontSize: 10, lineHeight: 1.3, marginTop: 2 }}>
          <span className={cls} style={{ fontWeight: 600 }}>{fmtPct(rate)}</span>
          {absRate > 0 && (
            <span style={{ color: "var(--muted)", marginLeft: 4 }} title="% sobre o topo do funil">
              ({fmtPct(absRate)} abs)
            </span>
          )}
        </div>
      )}
    </td>
  );
}

export function FunnelByOrigin({ data }: { data: FunnelByOriginType }) {
  if (!data.rows.length) {
    return <div className="note">Sem dados de funil no período.</div>;
  }

  const stages = data.stages; // ["novos","agendaram","visita","tatAgend","converteram"]

  return (
    <div className="scroll-x">
      <table className="funnel-by-origin">
        <thead>
          <tr>
            <th style={{ verticalAlign: "bottom" }}>Canal</th>
            {stages.map((s, i) => (
              <th key={s} className="num" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>Estágio {i + 1}</div>
                <div>{STAGE_LABEL[s] ?? s}</div>
              </th>
            ))}
            <th className="num" style={{ textAlign: "right" }}>Receita</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const step = (k: string) => r.stepRates[k] ?? 0;
            const abs = (k: string) => r.absoluteRates[k] ?? 0;
            const cnt = (k: string) => r.steps[k] ?? 0;
            return (
              <tr key={r.origin}>
                <td>
                  <strong>{r.origin}</strong>
                </td>
                {stages.map((s, i) => {
                  const denom = i === 0 ? cnt(s) : cnt(stages[i - 1]);
                  return (
                    <Cell
                      key={s}
                      value={cnt(s)}
                      rate={step(s)}
                      absRate={abs(s)}
                      denom={denom}
                    />
                  );
                })}
                <td className="num" style={{ textAlign: "right", color: r.receita > 0 ? "var(--green)" : "var(--muted)" }}>
                  <strong>{r.receita > 0 ? fmtBRL(r.receita) : "—"}</strong>
                </td>
              </tr>
            );
          })}
          {/* Linha Total agregada */}
          {data.totals && data.totals.steps.novos !== undefined && (
            <tr style={{ borderTop: "2px solid var(--line)", background: "var(--panel-2)" }}>
              <td>
                <strong>{data.totals.origin}</strong>
              </td>
              {stages.map((s, i) => {
                const denom = i === 0 ? data.totals.steps[s] ?? 0 : data.totals.steps[stages[i - 1]] ?? 0;
                return (
                  <Cell
                    key={s}
                    value={data.totals.steps[s] ?? 0}
                    rate={data.totals.stepRates[s] ?? 0}
                    absRate={data.totals.absoluteRates[s] ?? 0}
                    denom={denom}
                  />
                );
              })}
              <td className="num" style={{ textAlign: "right", color: data.totals.receita > 0 ? "var(--green)" : "var(--muted)" }}>
                <strong>{data.totals.receita > 0 ? fmtBRL(data.totals.receita) : "—"}</strong>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
