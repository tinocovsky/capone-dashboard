/**
 * Formatadores pt-BR compartilhados (dashboard, charts, export).
 * Fonte única — não duplique fmtBRL/fmtPct em componentes.
 */

export const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Cycle time legível: < 1h em minutos, < 1 dia em horas, senão em dias. */
export function fmtCycle(days: number): string {
  if (days <= 0) return "0d";
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}min`;
  if (days < 1) return `${(days * 24).toFixed(1).replace(".", ",")}h`;
  return `${days.toFixed(1).replace(".", ",")}d`;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "YYYY-MM-DD" → "dd/mm/aaaa" (padrão brasileiro). */
export const fmtDateBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const toBR = fmtDateBR;

/** Rótulo do período: mês fechado vira "Julho de 2026"; senão "01/07/2026 – 15/07/2026". */
export function fmtPeriod(start: string, end: string): string {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const lastDay = new Date(ye, me, 0).getDate(); // dia final do mês de `end`
  if (ys === ye && ms === me && ds === 1 && de === lastDay) {
    return `${MESES[ms - 1]} de ${ys}`;
  }
  return `${toBR(start)} – ${toBR(end)}`;
}
