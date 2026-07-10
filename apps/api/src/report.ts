/**
 * Cálculo do relatório a partir de contacts + opportunities do GHL.
 * Aplica as regras de negócio descritas no briefing original:
 *   - Em Vendas: "convertido" = Tatuagem agendada | Ganho | Sinal Pago
 *                "não convertido" = Simulação realizada | Sinal | Perdido
 *                (decidido = qualquer um dos 6 stages; resto = open, não conta pra taxa)
 *   - Em Pós vendas: TODOS os 8 stages (M1..M8) viraram tatuagem executada = convertido
 *   - exclui artista "Arlon" (case-insensitive)
 *
 * Mapeamento de stageId → tipo (testado contra API real do GHL em jul/2026):
 */
import type {
  GhlAppointment,
  GhlContact,
  GhlOpportunity,
  Report,
  CountRow,
  ContactsByDaySource,
  PerformanceRow,
  PipelineRow,
  Alert,
  AdsMetrics,
  AppointmentsBreakdown,
  ArtistBySource,
  OriginBreakdown,
} from "@capone/shared";
import { env } from "./env.js";
import { aggregateAdsMetrics, aggregateVisitsByOrigin, classifyMacroOrigin, originRowsFromBreakdown, adsTrackingCoverage } from "./ads.js";

const EXCLUDED_ARTIST = "arlon";

/** Pipeline Vendas: 6 stages, classificados conforme regra do briefing */
const VENDAS_STAGE_WON = new Set<string>([
  "3cabe36c-eb9b-4313-9147-d79a3122a28f", // Tatuagem agendada
  "2d790d25-30f6-4480-8e90-dcac1b007599", // Ganho
  "1a75ea4a-7d0e-4559-9288-fb09d5826653", // Sinal Pago
]);
const VENDAS_STAGE_LOST = new Set<string>([
  "2ba6b554-1bf2-48b7-8498-8b92735231f6", // Simulação realizada
  "8ab543c9-dcaf-421f-9e72-b8d45c53e36e", // Sinal
  "557c9e3b-93a5-4fa8-bf9c-69ce9e156732", // Perdido
]);

/** Pipeline Pós vendas: 8 stages (M1..M8), todos viram convertido */
const POS_VENDAS_PIPELINE = env.GHL_PIPELINE_POS_VENDAS;

function classifyVendas(stageId: string | null | undefined): "won" | "lost" | "open" {
  if (!stageId) return "open";
  if (VENDAS_STAGE_WON.has(stageId)) return "won";
  if (VENDAS_STAGE_LOST.has(stageId)) return "lost";
  return "open";
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10; // 1 casa
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

type CField = {
  id: string;
  fieldValueString?: string | null;
  fieldValueNumber?: number | null;
  fieldValueArray?: string[] | null;
  fieldValueDate?: number | null;
  // legado (alguns endpoints antigos retornam "value")
  value?: unknown;
};
type Row = { id: string } & Record<string, unknown>;
/** Extrai o valor de um custom field do GHL.
 *  GHL retorna em `fieldValueString | fieldValueNumber | fieldValueArray | fieldValueDate`
 *  dependendo do tipo do field. */
function pickCustom(customFields: readonly Row[] | undefined, id: string): string | null {
  if (!customFields) return null;
  const f = customFields.find((x) => x.id === id) as CField | undefined;
  if (!f) return null;
  if (f.fieldValueString != null && f.fieldValueString !== "") return f.fieldValueString;
  if (typeof f.fieldValueNumber === "number") return String(f.fieldValueNumber);
  if (f.fieldValueArray && f.fieldValueArray.length > 0) return f.fieldValueArray.join(", ");
  if (typeof f.fieldValueDate === "number") return new Date(f.fieldValueDate).toISOString().slice(0, 10);
  if (f.value != null) return String(f.value);
  return null;
}

function inc<T>(map: Map<string, number>, key: string, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

function toRows(counts: Map<string, number>, total: number, limit = 50): CountRow[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count, percent: pct(count, total) }));
}

export function buildReport(
  start: string,
  end: string,
  contacts: GhlContact[],
  opps: GhlOpportunity[],
  appointmentEvents: GhlAppointment[] = [],
  // Contatos de agendamentos/opps que foram criados FORA do período (buscados à
  // parte só pra classificar origem) — não entram em novosContatos nem nas seções de contatos.
  extraContacts: GhlContact[] = [],
): Report {
  // --- Filtra artista excluído ---
  const filteredOpps = opps.filter((o) => {
    const artist = pickCustom(o.customFields, env.GHL_ARTIST_FIELD_ID);
    return (artist ?? "").toLowerCase().trim() !== EXCLUDED_ARTIST;
  });

  // --- Totais básicos ---
  // Decide o status final de cada opp baseado no stageId (não em o.status que é sempre "open" no GHL)
  const classified = filteredOpps.map((o) => {
    let won = false, lost = false;
    if (o.pipelineId === env.GHL_PIPELINE_VENDAS) {
      const c = classifyVendas(o.pipelineStageId);
      won = c === "won";
      lost = c === "lost";
    } else if (o.pipelineId === POS_VENDAS_PIPELINE) {
      // Pós vendas: todos os 8 stages viraram convertido
      won = true;
    }
    return { o, won, lost };
  });
  const decided = classified.filter((c) => c.won || c.lost);
  const converted = classified.filter((c) => c.won);
  const lost = classified.filter((c) => c.lost);

  // Lookup de contato por id (período + extras) — usado pra classificar a origem
  // (sessionSource) de agendamentos e de opps por artista.
  const contactLookup = new Map<string, GhlContact>();
  for (const c of contacts) contactLookup.set(c.id, c);
  for (const c of extraContacts) contactLookup.set(c.id, c);

  // "Fonte do negócio" (custom da opp) por contato — fallback de origem quando o
  // sessionSource nativo está em branco ou é "CRM UI". Opp mais recente vence.
  const fonteByContact = new Map<string, { fonte: string; at: string }>();
  for (const o of filteredOpps) {
    if (!o.contactId) continue;
    const fonte = pickCustom(o.customFields, env.GHL_FIELD_FONTE_NEGOCIO);
    if (!fonte) continue;
    const at = o.createdAt ?? "";
    const cur = fonteByContact.get(o.contactId);
    if (!cur || at > cur.at) fonteByContact.set(o.contactId, { fonte, at });
  }

  /** "Fonte do negócio" cai nos buckets nativos equivalentes, pra não criar
   *  categorias paralelas às do sessionSource: Social Pago → Paid Social,
   *  Social Orgânico → Social media, Pesquisa Paga → Paid Search, Pesquisa
   *  Orgânica → Organic Search. Demais valores (Artistas, Passante, ...)
   *  passam direto. */
  function normalizeFallbackSource(fonte: string): string {
    if (/social\s*pago/i.test(fonte)) return "Paid Social";
    if (/social\s*org[âa]nico/i.test(fonte)) return "Social media";
    if (/pesquisa\s*paga/i.test(fonte)) return "Paid Search";
    if (/pesquisa\s*org[âa]nica/i.test(fonte)) return "Organic Search";
    return fonte;
  }

  /** Origem do contato com fallback: sessionSource nativo vence (exceto "CRM UI");
   *  em branco/CRM UI usa a "Fonte do negócio" da opp mais recente (normalizada —
   *  ver normalizeFallbackSource); senão mantém "CRM UI"/"(sem)". Contato sem opp
   *  não tem fallback. */
  const resolveOrigin = (contactId: string | null | undefined): string => {
    if (!contactId) return "(sem)";
    const src = contactLookup.get(contactId)?.attributionSource?.sessionSource?.trim();
    if (src && src !== "CRM UI") return src;
    const fonte = fonteByContact.get(contactId)?.fonte;
    if (fonte) return normalizeFallbackSource(fonte);
    return src || "(sem)";
  };
  const receita = converted.reduce((s, c) => s + (c.o.monetaryValue ?? 0), 0);
  const ticket = converted.length ? receita / converted.length : 0;

  // --- Cycle time (mediana) ---
  const cycleDaysAll = converted.map((c) => {
    const o = c.o;
    const a = new Date(o.createdAt ?? "").getTime();
    const b = new Date(o.updatedAt ?? o.lastStageChangeAt ?? o.createdAt ?? "").getTime();
    return Math.max(0, (b - a) / 86_400_000);
  });
  // Fração de cycle = 0 (medida ANTES de filtrar — é o sinal de backfill/retro-paint)
  const zeroDayShare = cycleDaysAll.length
    ? cycleDaysAll.filter((d) => d === 0).length / cycleDaysAll.length
    : 0;
  const cycleDays = cycleDaysAll.filter((d) => d > 0).sort((x, y) => x - y);
  const medianCycle = cycleDays.length ? cycleDays[Math.floor(cycleDays.length / 2)] : 0;

  // --- Contatos por dia ---
  const byDay = new Map<string, number>();
  for (const c of contacts) inc(byDay, dayKey(c.dateAdded));
  const contactsByDay = toRows(byDay, contacts.length, 60);

  // --- Contatos por dia × origem ---
  // sessionSource nativo, com fallback pra "Fonte do negócio" da opp (resolveOrigin).
  const byDaySource = new Map<string, Map<string, number>>();
  const sourceTotals = new Map<string, number>();
  for (const c of contacts) {
    const d = dayKey(c.dateAdded);
    const src = resolveOrigin(c.id);
    let m = byDaySource.get(d);
    if (!m) byDaySource.set(d, (m = new Map()));
    m.set(src, (m.get(src) ?? 0) + 1);
    inc(sourceTotals, src);
  }
  const contactsByDaySource: ContactsByDaySource = {
    sources: Array.from(sourceTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s),
    rows: Array.from(byDaySource.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, m]) => ({
        date,
        total: Array.from(m.values()).reduce((s, n) => s + n, 0),
        bySource: Object.fromEntries(m),
      })),
  };

  // --- Origem sessão / canal / cross / landing / ad / legacy / tags ---
  const bySession = new Map<string, number>();
  const byChannel = new Map<string, number>();
  const bySessionChannel = new Map<string, number>();
  const byLanding = new Map<string, number>();
  const byAd = new Map<string, number>();
  const byLegacy = new Map<string, number>();
  const byTag = new Map<string, number>();
  const BOT_TAGS = /bot|teste|pix|payment/i;

  for (const c of contacts) {
    // attributionSource é flat no /contacts/search (sessionSource/medium/url/adId).
    const att = c.attributionSource;
    const session = att?.sessionSource?.trim() || "(sem)";
    const channel = att?.medium?.toLowerCase().trim() || "(sem)";
    inc(bySession, session);
    inc(byChannel, channel);
    inc(bySessionChannel, `${session} / ${channel}`);
    if (att?.url) inc(byLanding, att.url);
    if (att?.adId) inc(byAd, att.adId);
    if (c.source) inc(byLegacy, c.source);
    for (const t of c.tags ?? []) if (!BOT_TAGS.test(t)) inc(byTag, t);
  }

  // --- Performance por pipeline ---
  const pipelineMap = new Map<string, { total: number; conv: number; lost: number; receita: number }>();
  for (const c of classified) {
    const k = c.o.pipelineId;
    const v = pipelineMap.get(k) ?? { total: 0, conv: 0, lost: 0, receita: 0 };
    v.total++;
    if (c.won) v.conv++, (v.receita += c.o.monetaryValue ?? 0);
    else if (c.lost) v.lost++;
    pipelineMap.set(k, v);
  }
  const pipelineBreakdown: PipelineRow[] = Array.from(pipelineMap.entries()).map(([k, v]) => ({
    pipeline: k, // web renomeia
    total: v.total,
    convertidos: v.conv,
    naoConvertidos: v.lost,
    taxaConversao: pct(v.conv, v.total) / 100,
    receitaConvertida: v.receita,
  }));

  // --- Performance por artista / SDR / origem ---
  // "artista" = custom field "Artista escolhido" (9XPhm85vxOYEyZ6yRB9N, tatuador).
  // "sdr" = custom field "Dono do negócio" (c345zUnE33gH96uyEJI6). Os SDRs NÃO são
  // usuários do GHL (assignedTo) — o nome de cada um vive nesse campo custom.
  const buildPerfRows = (key: "artist" | "sdr" | "origin"): PerformanceRow[] => {
    const map = new Map<string, { total: number; conv: number; lost: number; receita: number }>();
    for (const c of classified) {
      const o = c.o;
      let k = "(não preenchido)";
      if (key === "artist") k = pickCustom(o.customFields, env.GHL_ARTIST_FIELD_ID) || k;
      if (key === "sdr") k = pickCustom(o.customFields, env.GHL_DONO_NEGOCIO_FIELD_ID) || k;
      if (key === "origin") k = mapOrigin(o);
      const v = map.get(k) ?? { total: 0, conv: 0, lost: 0, receita: 0 };
      v.total++;
      if (c.won) v.conv++, (v.receita += o.monetaryValue ?? 0);
      else if (c.lost) v.lost++;
      map.set(k, v);
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({
        label,
        total: v.total,
        convertidos: v.conv,
        naoConvertidos: v.lost,
        taxaConversao: v.total ? v.conv / v.total : 0,
        ticketMedio: v.conv ? v.receita / v.conv : 0,
        receitaConvertida: v.receita,
      }))
      .sort((a, b) => b.receitaConvertida - a.receitaConvertida);
  };

  // --- Artista × grupo de clientes (Capone × Artistas) ---
  // Regra: sessionSource válido (≠ CRM UI) → Clientes Capone. Em branco/CRM UI,
  // decide pela "Fonte do negócio" da opp: "Artistas" → Clientes dos Artistas;
  // qualquer outra coisa (Passante, Inbound, vazio) → Clientes Capone.
  const GRUPO_CAPONE = "Clientes Capone";
  const GRUPO_ARTISTAS = "Clientes dos Artistas";
  type ASCell = { total: number; conv: number; lost: number };
  const artistSourceMap = new Map<string, Map<string, ASCell>>();
  const asArtistReceita = new Map<string, number>(); // só pra ordenar as linhas
  let asNaoClassificados = 0; // sem source E sem fonte → caíram no default Capone
  for (const c of classified) {
    const artist = pickCustom(c.o.customFields, env.GHL_ARTIST_FIELD_ID) || "(não preenchido)";
    const src = c.o.contactId
      ? contactLookup.get(c.o.contactId)?.attributionSource?.sessionSource?.trim()
      : undefined;
    let grupo = GRUPO_CAPONE;
    if (!src || src === "CRM UI") {
      if (classifyMacroOrigin(c.o) === "artista") grupo = GRUPO_ARTISTAS;
      else if (!pickCustom(c.o.customFields, env.GHL_FIELD_FONTE_NEGOCIO)) asNaoClassificados++;
    }
    let m = artistSourceMap.get(artist);
    if (!m) artistSourceMap.set(artist, (m = new Map()));
    let cell = m.get(grupo);
    if (!cell) m.set(grupo, (cell = { total: 0, conv: 0, lost: 0 }));
    cell.total++;
    if (c.won) cell.conv++;
    else if (c.lost) cell.lost++;
    if (c.won) asArtistReceita.set(artist, (asArtistReceita.get(artist) ?? 0) + (c.o.monetaryValue ?? 0));
  }
  const byArtistSource: ArtistBySource = {
    sources: [GRUPO_CAPONE, GRUPO_ARTISTAS],
    naoClassificados: asNaoClassificados,
    rows: Array.from(artistSourceMap.entries())
      .sort((a, b) => (asArtistReceita.get(b[0]) ?? 0) - (asArtistReceita.get(a[0]) ?? 0))
      .map(([artist, m]) => ({
        artist,
        bySource: Object.fromEntries(
          Array.from(m.entries()).map(([s, cell]) => [
            s,
            {
              total: cell.total,
              convertidos: cell.conv,
              naoConvertidos: cell.lost,
              taxaConversao: cell.total ? cell.conv / cell.total : 0,
            },
          ]),
        ),
      })),
  };

  // --- Alertas gerados ---
  const alerts: Alert[] = [];
  const vendasRow = pipelineBreakdown.find((p) => p.pipeline === env.GHL_PIPELINE_VENDAS);
  if (vendasRow && vendasRow.taxaConversao < 0.4) {
    alerts.push({
      severity: "bad",
      title: "Vendas com baixa conversão",
      message: `Pipeline de Vendas fechou ${(vendasRow.taxaConversao * 100).toFixed(1)}% (${vendasRow.convertidos}/${vendasRow.total}).`,
    });
  }
  const semSdr = classified.filter(
    (c) => !pickCustom(c.o.customFields, env.GHL_DONO_NEGOCIO_FIELD_ID),
  ).length;
  if (semSdr > 0) {
    alerts.push({
      severity: "warn",
      title: `${semSdr} leads sem SDR atribuído`,
      message: "Sem \"Dono do negócio\" preenchido. Leads sem responsável morrem no funil.",
    });
  }
  const crmUi = bySessionChannel.get("CRM UI / manual") ?? 0;
  if (crmUi / Math.max(1, contacts.length) > 0.03) {
    alerts.push({
      severity: "info",
      title: `${crmUi} contatos via CRM UI / manual`,
      message: "Origem sem rastreamento — investigar se é prospecção, indicação ou erro de processo.",
    });
  }
  if (zeroDayShare > 0.5) {
    alerts.push({
      severity: "warn",
      title: "Cycle time suspeito (backfill)",
      message: `${Math.round(zeroDayShare * 100)}% dos convertidos têm cycle = 0d — provável retro-paint em lote.`,
    });
  }

  // --- Taxa de conversão (sobre decided) ---
  const taxaConversao = decided.length ? converted.length / decided.length : 0;

  // --- Funil de Vendas (do mais cedo ao mais tarde) ---
  // Mapeamento stageId → nome/posição do funil de Vendas (descoberto via API)
  const VENDAS_FUNNEL: Array<{ id: string; name: string; position: number }> = [
    { id: "2ba6b554-1bf2-48b7-8498-8b92735231f6", name: "Simulação realizada", position: 0 },
    { id: "8ab543c9-dcaf-421f-9e72-b8d45c53e36e", name: "Sinal", position: 1 },
    { id: "1a75ea4a-7d0e-4559-9288-fb09d5826653", name: "Sinal Pago", position: 2 },
    { id: "3cabe36c-eb9b-4313-9147-d79a3122a28f", name: "Tatuagem agendada", position: 3 },
    { id: "2d790d25-30f6-4480-8e90-dcac1b007599", name: "Ganho", position: 4 },
    { id: "557c9e3b-93a5-4fa8-bf9c-69ce9e156732", name: "Perdido", position: 5 },
  ];
  const stageCounts = new Map<string, number>();
  for (const c of classified) {
    if (c.o.pipelineId !== env.GHL_PIPELINE_VENDAS) continue;
    const sid = c.o.pipelineStageId;
    if (sid) stageCounts.set(sid, (stageCounts.get(sid) ?? 0) + 1);
  }
  const vendasFunnel: Array<{ name: string; count: number; rate: number }> = [];
  let prevCount = 0;
  for (const s of VENDAS_FUNNEL) {
    const c = stageCounts.get(s.id) ?? 0;
    // Taxa: sobre o stage anterior (ou 1.0 se for o primeiro)
    vendasFunnel.push({
      name: s.name,
      count: c,
      rate: prevCount > 0 ? c / prevCount : c > 0 ? 1 : 0,
    });
    prevCount = c;
  }

  // --- Receita por dia (data de fechamento = lastStageChangeAt) ---
  // Agrupa convertidas por data de mudança de stage (que é quando viraram won/lost)
  const revByDay = new Map<string, number>();
  for (const c of converted) {
    const d = (c.o.lastStageChangeAt ?? c.o.updatedAt ?? c.o.createdAt ?? "").slice(0, 10);
    if (!d) continue;
    revByDay.set(d, (revByDay.get(d) ?? 0) + (c.o.monetaryValue ?? 0));
  }
  // Gera série completa de datas no período (preenche dias sem receita com 0)
  const revenueByDay: Array<{ date: string; receita: number; acumulado: number }> = [];
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  let acc = 0;
  for (let t = startMs; t <= endMs; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const r = revByDay.get(d) ?? 0;
    acc += r;
    revenueByDay.push({ date: d, receita: r, acumulado: acc });
  }

  // --- Agendamentos (status + origem do CONTATO) ---
  // Origem = attributionSource.sessionSource do contato agendado (Paid Social,
  // Paid Search, Social media, CRM UI, ...), igual à seção "Por origem (sessão)".
  const apptStatus = new Map<string, number>();
  const apptOrigin = new Map<string, number>();
  for (const a of appointmentEvents) {
    inc(apptStatus, a.appointmentStatus || "(sem status)");
    inc(apptOrigin, resolveOrigin(a.contactId));
  }
  const appointments: AppointmentsBreakdown = {
    total: appointmentEvents.length,
    byStatus: toRows(apptStatus, appointmentEvents.length),
    byOrigin: toRows(apptOrigin, appointmentEvents.length),
  };

  // --- Métricas de Ads (Meta/Google/TikTok/Orgânico/Outros) e Visitas por Origem ---
  // Ambos derivados de classified (lista já com won/lost) + contacts (pra fbclid/gclid).
  const adsMetrics: AdsMetrics = aggregateAdsMetrics(contacts, classified);
  const visitsByOrigin: OriginBreakdown = aggregateVisitsByOrigin(classified);

  // Alerta: baixa cobertura de tracking de ads (utm/fbclid/gclid vazios na maioria)
  const cov = adsTrackingCoverage(adsMetrics);
  if (cov.totalVisitas > 100 && cov.coberturaPct < 0.10) {
    alerts.push({
      severity: "warn",
      title: "Cobertura baixa de tracking de ads",
      message: `Apenas ${(cov.coberturaPct * 100).toFixed(1)}% dos contatos (${cov.adsVisitas}/${cov.totalVisitas}) têm fbclid/gclid/utm_source. Os outros caem em "Orgânico" no relatório. Investigue se o pixel/conector Meta+Google está ativo.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    period: { start, end },
    totals: {
      novosContatos: contacts.length,
      oportunidades: filteredOpps.length,
      convertidas: converted.length,
      naoConvertidas: lost.length,
      taxaConversao,
      receitaConvertida: receita,
      ticketMedio: ticket,
      cycleTimeMedianaDias: medianCycle,
      artistasNoMes: new Set(classified.map((c) => pickCustom(c.o.customFields, env.GHL_ARTIST_FIELD_ID)).filter(Boolean)).size,
      sdrsNoMes: new Set(classified.map((c) => pickCustom(c.o.customFields, env.GHL_DONO_NEGOCIO_FIELD_ID)).filter(Boolean)).size,
    },
    contactsByDay,
    contactsByDaySource,
    contactsBySourceSession: toRows(bySession, contacts.length),
    contactsByChannel: toRows(byChannel, contacts.length),
    sessionXChannel: toRows(bySessionChannel, contacts.length, 10),
    topLandingPages: toRows(byLanding, contacts.length, 10),
    topAdIds: toRows(byAd, contacts.length, 10),
    topLegacySources: toRows(byLegacy, contacts.length, 10),
    topTags: toRows(byTag, contacts.length, 30),
    pipelineBreakdown,
    byArtist: buildPerfRows("artist"),
    bySdr: buildPerfRows("sdr"),
    byArtistSource,
    // Performance por Origem agora vem dos 4 buckets canônicos do briefing
    // (Artistas / Social Pago / Social Orgânico / Passante) — não mais do
    // mapOrigin() heurístico. Veja ads.ts:originRowsFromBreakdown.
    byOrigin: originRowsFromBreakdown(visitsByOrigin),
    // Métricas de Ads (Meta/Google/TikTok) e visitas por macro-origem
    adsMetrics,
    visitsByOrigin,
    appointments,
    vendasFunnel,
    revenueByDay,
    alerts,
    cacheHit: false,
  };
}

/** Mapeia uma opp para a macro-origem (Artistas, Social Pago, Social Orgânico, Passante). */
function mapOrigin(o: GhlOpportunity): string {
  const artist = pickCustom(o.customFields, env.GHL_ARTIST_FIELD_ID);
  // Heurística: se tem artista definido E veio de listagem do artista → Artistas.
  // Sem lead_id cruzado aqui, usamos a presença do custom "macro_origem" se o cliente salvar
  // — senão caímos na classificação por pipeline/stage. Mantemos o fallback por enquanto.
  if (artist) return "Artistas (Art)";
  // opp não tem `pipelineStage` (string) — só `pipelineStageId` (uuid). Como esse
  // helper é fallback heurístico e a macro-origem oficial vem de
  // `Fonte do negócio` (Z9V5sduzueNFxPbqtqGh), mantemos o default.
  return "Outros";
}
