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
 *   - Coluna de cada estágio: contagem absoluta + % absoluto (sobre o topo do funil)
 *   - % absoluto é SEMPRE o único percentual visível — o briefing pediu que
 *     o percentual seja "com base no número total de contatos" do canal
 *   - Cor semafórica calibrada POR ESTÁGIO (ver ABS_THRESHOLDS abaixo) — os
 *     limiares mudam estágio a estágio porque a taxa saudável encolhe
 *     conforme desce no funil
 *   - Step rate (% entre stages consecutivos) NÃO aparece na UI, mas continua
 *     sendo calculado e exposto no schema (r.stepRates) — alimenta os
 *     alertas RevOps em report.ts. Ver skill `revenue-ops-funnel`.
 *   - Receita no fim pra fechar a decisão (qual canal converte E traz receita)
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

// Limiares da cor semafórica do % ABSOLUTO, calibrados POR ESTÁGIO.
// O % absoluto encolhe conforme o funil desce (saudável: lead→agend ~25%,
// agend→visita ~65% [mostrado em step], visita→tat.agend ~30%, tat.agend→conv ~70%).
// O % absoluto esperado cai junto: ~25% → ~16% → ~5% → ~3% do topo.
// Limiar "verde" = nessa faixa ou acima; "amarelo" = perdeu algum furo;
// "vermelho" = o canal não chega no fundo do funil em volume relevante.
// (O 1º estágio "novos" é sempre 100% — sem cor, é a referência do funil.)
const ABS_THRESHOLDS: Record<string, { green: number; yellow: number }> = {
  //           verde   amarelo (entre = yellow, abaixo = red)
  agendaram:    { green: 0.20, yellow: 0.10 },
  visita:       { green: 0.15, yellow: 0.05 },
  tatAgend:     { green: 0.05, yellow: 0.02 },
  converteram:  { green: 0.03, yellow: 0.01 },
};

function absClass(stage: string, rate: number): string {
  const t = ABS_THRESHOLDS[stage];
  if (!t) return ""; // "novos" ou stage desconhecido — sem cor
  if (rate >= t.green) return "green";
  if (rate >= t.yellow) return "yellow";
  return "red";
}

function Cell({ value, absRate, stage }: { value: number; absRate: number; stage: string }) {
  if (value === 0) {
    return (
      <td className="num" style={{ color: "var(--muted)" }}>
        <span style={{ display: "block" }}>0</span>
        <span style={{ display: "block", fontSize: 10, color: "var(--muted)" }}>—</span>
      </td>
    );
  }
  // "novos" não tem cor (é a referência 100% do funil)
  const cls = stage === "novos" ? "" : absClass(stage, absRate);
  const title = stage === "novos"
    ? "Topo do funil (referência)"
    : `% sobre o topo do funil (novos) — limiar: ≥${fmtPct(ABS_THRESHOLDS[stage].green)} verde, ≥${fmtPct(ABS_THRESHOLDS[stage].yellow)} amarelo`;
  return (
    <td className="num">
      <strong>{value.toLocaleString("pt-BR")}</strong>
      {absRate > 0 && (
        <div style={{ fontSize: 10, lineHeight: 1.3, marginTop: 2 }}>
          <span className={cls} style={{ fontWeight: 600 }} title={title}>
            {fmtPct(absRate)}
          </span>
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
            const abs = (k: string) => r.absoluteRates[k] ?? 0;
            const cnt = (k: string) => r.steps[k] ?? 0;
            return (
              <tr key={r.origin}>
                <td>
                  <strong>{r.origin}</strong>
                </td>
                {stages.map((s) => (
                  <Cell
                    key={s}
                    stage={s}
                    value={cnt(s)}
                    absRate={abs(s)}
                  />
                ))}
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
              {stages.map((s) => (
                <Cell
                  key={s}
                  stage={s}
                  value={data.totals.steps[s] ?? 0}
                  absRate={data.totals.absoluteRates[s] ?? 0}
                />
              ))}
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
