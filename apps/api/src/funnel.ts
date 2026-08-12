/**
 * Funil de Vendas por origem/canal — 5 estágios canônicos de RevOps.
 * Agrega os pipelines Vendas + Pós-vendas (Pré-vendas, Prospecção e Barbearia
 * ficam de fora). Pós-vendas entra como "won sempre" nos estágios finais.
 *
 *   1. novos       contatos únicos no período atribuídos ao canal
 *   2. agendaram   appointments no período (status new/confirmed/showed)
 *   3. visita      opps em Vendas OU Pós-vendas com createdAt no período
 *   4. tatAgend    opps com stage "Tatuagem agendada" (3cabe36c-...) e
 *                  lastStageChangeAt no período (só Vendas — Pós não tem esse stage)
 *   5. converteram Vendas com stage ∈ VENDAS_STAGE_WON OU qualquer opp de
 *                  Pós-vendas (won sempre), lastStageChangeAt no período.
 *                  Soma monetaryValue dos dois lados.
 *
 * Cada canal vira uma linha. Taxa step (entre stages consecutivos) e taxa
 * absoluta (sobre o topo do funil) ficam em campos separados — RevOps olha
 * os dois, são métricas diferentes:
 *
 *   step rate    "qual estágio vaza mais"     (micro, identifica gargalo)
 *   abs rate     "quanto do original virou venda" (macro, comunica resultado)
 *
 * Ver skill `revenue-ops-funnel` (especialista em funil + RevOps) pra
 * detalhamento da metodologia, edge cases de cada estágio e o que cada
 * alerta significa operacionalmente.
 */
import type {
  GhlAppointment,
  GhlContact,
  GhlOpportunity,
  FunnelByOrigin,
  FunnelOriginRow,
  Alert,
} from "@capone/shared";
import { env } from "./env.js";

// Stage ID do "Tatuagem agendada" no pipeline Vendas (jul/2026, validado via API).
// Espelha VENDAS_STAGE_WON do report.ts — duplicado aqui pra esse módulo não
// importar report.ts (ciclos). Se mudar, mudar nos 2 lugares.
const TATUAGEM_AGENDADA_STAGE_ID = "3cabe36c-eb9b-4313-9147-d79a3122a28f";

// Stages won do Vendas (mesma definição do report.ts).
const VENDAS_STAGE_WON = new Set<string>([
  "1a75ea4a-7d0e-4559-9288-fb09d5826653", // Sinal Pago
  "3cabe36c-eb9b-4313-9147-d79a3122a28f", // Tatuagem agendada
  "2d790d25-30f6-4480-8e90-dcac1b007599", // Ganho
]);

/** Funil agrega Vendas + Pós-vendas. Pré-vendas, Prospecção e Barbearia ficam fora. */
function isTargetPipeline(id: string | null | undefined): boolean {
  return id === env.GHL_PIPELINE_VENDAS || id === env.GHL_PIPELINE_POS_VENDAS;
}

const APPT_COUNTABLE_STATUSES = new Set(["new", "confirmed", "showed"]);

const FUNNEL_STAGES = ["novos", "agendaram", "visita", "tatAgend", "converteram"] as const;
type StageName = (typeof FUNNEL_STAGES)[number];

const STAGE_LABEL: Record<StageName, string> = {
  novos: "Novos contatos",
  agendaram: "Agendaram",
  visita: "Virou oportunidade",
  tatAgend: "Agendaram tatuagem",
  converteram: "Converteram",
};

/** YYYY-MM-DD no fuso local. Usado pra comparar com dateAdded/createdAt do GHL. */
function inRange(iso: string | null | undefined, start: string, end: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
}

type AggRow = Record<StageName, number> & { receita: number };

function emptyAgg(): AggRow {
  return { novos: 0, agendaram: 0, visita: 0, tatAgend: 0, converteram: 0, receita: 0 };
}

/** Calcula o funil por origem.
 *  @param resolveOrigin helper do report.ts: contactId → label de canal
 *         (com fallback sessionSource → "Fonte do negócio").
 *  @returns FunnelByOrigin com rows por canal + totals agregados + alerts. */
export function buildFunnelByOrigin(
  start: string,
  end: string,
  contacts: GhlContact[],
  opps: GhlOpportunity[],
  appointments: GhlAppointment[],
  resolveOrigin: (contactId: string | null | undefined) => string,
): FunnelByOrigin {
  // Mapa por canal. Mantém ordem de inserção (volume desc depois).
  const byOrigin = new Map<string, AggRow>();

  const touch = (origin: string): AggRow => {
    let row = byOrigin.get(origin);
    if (!row) {
      row = emptyAgg();
      byOrigin.set(origin, row);
    }
    return row;
  };

  // 1) Novos contatos por canal (dedupe por contactId já é natural — o contact
  //    só aparece 1x no array; o GHL retorna 1 linha por id no /contacts/search).
  for (const c of contacts) {
    if (!inRange(c.dateAdded, start, end)) continue;
    const origin = resolveOrigin(c.id);
    touch(origin).novos++;
  }

  // 2) Agendaram: 1 contagem por appointment (NÃO dedupe por contato —
  //    2 marcações = no-show + re-agendamento, é métrica válida RevOps).
  for (const a of appointments) {
    const status = (a.appointmentStatus ?? "").toLowerCase();
    if (!APPT_COUNTABLE_STATUSES.has(status)) continue;
    // Período: usamos dateAdded do appt (quando o lead marcou). startTime é
    // quando a visita vai acontecer, fora do "agendaram no período".
    if (!inRange(a.dateAdded, start, end) && !inRange(a.startTime, start, end)) continue;
    const origin = resolveOrigin(a.contactId);
    touch(origin).agendaram++;
  }

  // 3) Visita: opp em Vendas OU Pós-vendas com createdAt no período.
  //    Não filtrar por stage — visita = "entrou no funil", mesmo que depois
  //    tenha caído em Perdido (a perda foi num estágio posterior). Inclui
  //    pós-vendas porque é onde a "conversão" do funil se materializa.
  for (const o of opps) {
    if (!isTargetPipeline(o.pipelineId)) continue;
    if (!inRange(o.createdAt, start, end)) continue;
    const origin = resolveOrigin(o.contactId);
    touch(origin).visita++;
  }

  // 4) Agendaram tatuagem: stage = "Tatuagem agendada" (só Vendas), lastStageChangeAt no período.
  //    ⚠️ NÃO usar createdAt — a opp pode ter sido criada em jan e mudado de
  //    stage em mar. O evento é "passou pelo stage", não "nasceu".
  //    Pós-vendas não tem esse stage — fica fora desse estágio.
  for (const o of opps) {
    if (o.pipelineId !== env.GHL_PIPELINE_VENDAS) continue;
    if (o.pipelineStageId !== TATUAGEM_AGENDADA_STAGE_ID) continue;
    if (!inRange(o.lastStageChangeAt, start, end)) continue;
    const origin = resolveOrigin(o.contactId);
    touch(origin).tatAgend++;
  }

  // 5) Converteram: Vendas com stage ∈ VENDAS_STAGE_WON OU Pós-vendas (sempre won),
  //    ambos com lastStageChangeAt no período. Soma receita dos dois.
  for (const o of opps) {
    if (!isTargetPipeline(o.pipelineId)) continue;
    if (o.pipelineId === env.GHL_PIPELINE_VENDAS) {
      if (!o.pipelineStageId || !VENDAS_STAGE_WON.has(o.pipelineStageId)) continue;
    }
    // Pós-vendas: qualquer stage conta como won (espelha a regra do report.ts).
    if (!inRange(o.lastStageChangeAt, start, end)) continue;
    const origin = resolveOrigin(o.contactId);
    const row = touch(origin);
    row.converteram++;
    row.receita += o.monetaryValue ?? 0;
  }

  // Calcula taxas + ordena rows por volume desc no topo do funil.
  const rows: FunnelOriginRow[] = Array.from(byOrigin.entries())
    .map(([origin, agg]): FunnelOriginRow => {
      const steps: Record<string, number> = { ...agg };
      const stepRates: Record<string, number> = {};
      const absoluteRates: Record<string, number> = {};
      const top = agg.novos;
      for (let i = 0; i < FUNNEL_STAGES.length; i++) {
        const name = FUNNEL_STAGES[i];
        const cur = agg[name];
        const prev = i === 0 ? cur : agg[FUNNEL_STAGES[i - 1]];
        // step rate: % do stage anterior. Se anterior = 0, usa 0 (sem sinal).
        stepRates[name] = prev > 0 ? cur / prev : 0;
        // absolute rate: % do topo do funil (novos). Se top = 0, 0.
        absoluteRates[name] = top > 0 ? cur / top : 0;
      }
      return { origin, steps, stepRates, absoluteRates, receita: agg.receita };
    })
    .sort((a, b) => (b.steps.novos ?? 0) - (a.steps.novos ?? 0))
    .filter((r) => (r.steps.novos ?? 0) > 0 || (r.steps.agendaram ?? 0) > 0 || (r.steps.visita ?? 0) > 0);

  // Totais agregados (1 linha) — soma das rows.
  const totalsAgg = emptyAgg();
  for (const r of rows) {
    totalsAgg.novos += r.steps.novos ?? 0;
    totalsAgg.agendaram += r.steps.agendaram ?? 0;
    totalsAgg.visita += r.steps.visita ?? 0;
    totalsAgg.tatAgend += r.steps.tatAgend ?? 0;
    totalsAgg.converteram += r.steps.converteram ?? 0;
    totalsAgg.receita += r.receita;
  }
  const totalTop = totalsAgg.novos;
  const totalSteps: Record<string, number> = { ...totalsAgg };
  const totalStepRates: Record<string, number> = {};
  const totalAbsRates: Record<string, number> = {};
  for (let i = 0; i < FUNNEL_STAGES.length; i++) {
    const name = FUNNEL_STAGES[i];
    const cur = totalsAgg[name];
    const prev = i === 0 ? cur : totalsAgg[FUNNEL_STAGES[i - 1]];
    totalStepRates[name] = prev > 0 ? cur / prev : 0;
    totalAbsRates[name] = totalTop > 0 ? cur / totalTop : 0;
  }
  const totals: FunnelOriginRow = {
    origin: "Total",
    steps: totalSteps,
    stepRates: totalStepRates,
    absoluteRates: totalAbsRates,
    receita: totalsAgg.receita,
  };

  // Alertas RevOps (ver skill `revenue-ops-funnel` §5)
  const alerts: Alert[] = [];
  const safe = (rate: number, denom: number) => (denom > 0 ? rate : 0);

  // Show rate (agendaram → visita) abaixo de 50% num canal com volume relevante
  for (const r of rows) {
    const showRate = safe(r.stepRates.agendaram ?? 0, r.steps.agendaram ?? 0);
    if ((r.steps.agendaram ?? 0) >= 10 && showRate < 0.5) {
      alerts.push({
        severity: "warn",
        title: `Show rate baixo em "${r.origin}"`,
        message: `Apenas ${(showRate * 100).toFixed(0)}% dos agendamentos viraram oportunidade (${r.steps.visita}/${r.steps.agendaram}). Investigar reminder 24h e follow-up.`,
      });
    }
    // Qualificação ruim (visita → tat. agendada) < 20%
    const qualRate = safe(r.stepRates.visita ?? 0, r.steps.visita ?? 0);
    if ((r.steps.visita ?? 0) >= 10 && qualRate < 0.2) {
      alerts.push({
        severity: "warn",
        title: `Qualificação baixa em "${r.origin}"`,
        message: `${(qualRate * 100).toFixed(0)}% das oportunidades viraram tatuagem agendada (${r.steps.tatAgend}/${r.steps.visita}). Closer pode precisar de treinamento.`,
      });
    }
    // Drop grande do agendado pra conversão (< 70% em volume relevante)
    const closeRate = safe(r.stepRates.tatAgend ?? 0, r.steps.tatAgend ?? 0);
    if ((r.steps.tatAgend ?? 0) >= 10 && closeRate < 0.7) {
      alerts.push({
        severity: "bad",
        title: `Drop pós-agendamento em "${r.origin}"`,
        message: `${(closeRate * 100).toFixed(0)}% dos que agendaram tatuagem converteram (${r.steps.converteram}/${r.steps.tatAgend}). Possível cancelamento ou follow-up falhando.`,
      });
    }
  }

  // Concentração de risco: 1 canal > 80% do volume
  if (totalTop > 0 && rows.length > 1) {
    const top = rows[0];
    const share = (top.steps.novos ?? 0) / totalTop;
    if (share > 0.8) {
      alerts.push({
        severity: "info",
        title: `Concentração em "${top.origin}"`,
        message: `${(share * 100).toFixed(0)}% dos novos contatos vieram desse canal. Diversificar reduz risco.`,
      });
    }
  }

  return {
    stages: [...FUNNEL_STAGES],
    rows,
    totals,
    alerts,
  };
}

export { FUNNEL_STAGES, STAGE_LABEL };
