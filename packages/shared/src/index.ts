/**
 * Tipos e schemas compartilhados entre web e api.
 * Representam o shape do relatório mensal Capone Club (Junho 2026).
 */
import { z } from "zod";

// ---------- Query params (entrada) ----------
export const ReportQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  forceRefresh: z.coerce.boolean().optional().default(false),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

// ---------- Estruturas brutas que voltam do GHL ----------
export const GhlContactSchema = z.object({
  id: z.string(),
  dateAdded: z.string(),
  source: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  customFields: z
    .array(
      z
        .object({ id: z.string() })
        .passthrough(),
    )
    .optional()
    .default([]),
  // ⚠️ No /contacts/search o attributionSource é FLAT (validado jul/2026):
  // { sessionSource: "Paid Social" | "Social media" | "CRM UI" | ...,
  //   medium, url, adId, adName, gclid, campaign, ... } — NÃO existe "session" aninhado.
  attributionSource: z
    .object({
      sessionSource: z.string().optional().nullable(),
      medium: z.string().optional().nullable(),
      url: z.string().optional().nullable(),
      adId: z.string().optional().nullable(),
      adName: z.string().optional().nullable(),
      gclid: z.string().optional().nullable(),
    })
    .passthrough()
    .optional()
    .nullable(),
});
export type GhlContact = z.infer<typeof GhlContactSchema>;

export const GhlAppointmentSchema = z.object({
  id: z.string(),
  calendarId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  // "confirmed" | "showed" | "noshow" | "cancelled" | "new" | "invalid"
  appointmentStatus: z.string().optional().nullable(),
  // "yyyy-MM-dd HH:mm:ss" (sem timezone) no /calendars/events
  startTime: z.string().optional().nullable(),
  dateAdded: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  // origem do agendamento: "calendar_page" | "conversations_ai" | "manual" | ...
  createdBy: z.object({ source: z.string().optional().nullable() }).passthrough().optional().nullable(),
});
export type GhlAppointment = z.infer<typeof GhlAppointmentSchema>;

export const GhlOpportunitySchema = z.object({
  id: z.string(),
  pipelineId: z.string(),
  pipelineStageId: z.string().optional().nullable(),
  // ⚠️ GHL retorna `createdAt` (ISO), NÃO `dateAdded` (esse era do contacts).
  // O `sort` field também tem timestamp, mas createdAt é mais legível.
  createdAt: z.string().optional().nullable(),
  updatedAt: z.string().optional().nullable(),
  lastStageChangeAt: z.string().optional().nullable(),
  lastStatusChangeAt: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  customFields: z.array(z.object({ id: z.string() }).passthrough()).optional().default([]),
  assignedTo: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  monetaryValue: z.number().optional().nullable(),
  name: z.string().optional().nullable(),
});
export type GhlOpportunity = z.infer<typeof GhlOpportunitySchema>;

// ---------- Seções do relatório ----------
export const TotalsSchema = z.object({
  novosContatos: z.number(),
  oportunidades: z.number(),
  convertidas: z.number(),
  naoConvertidas: z.number(),
  taxaConversao: z.number(), // 0..1
  receitaConvertida: z.number(),
  ticketMedio: z.number(),
  cycleTimeMedianaDias: z.number(),
  artistasNoMes: z.number(),
  sdrsNoMes: z.number(),
});
export type Totals = z.infer<typeof TotalsSchema>;

export const CountRowSchema = z.object({
  label: z.string(),
  count: z.number(),
  percent: z.number(),
});
export type CountRow = z.infer<typeof CountRowSchema>;

// Contatos por dia segregados por sessionSource ("UTM Session Source" na UI do GHL)
export const DaySourceRowSchema = z.object({
  date: z.string(),                       // YYYY-MM-DD
  total: z.number(),
  bySource: z.record(z.string(), z.number()),
});
export type DaySourceRow = z.infer<typeof DaySourceRowSchema>;

export const ContactsByDaySourceSchema = z.object({
  sources: z.array(z.string()),           // ordenadas por volume total desc
  rows: z.array(DaySourceRowSchema),      // ordenadas por data asc
});
export type ContactsByDaySource = z.infer<typeof ContactsByDaySourceSchema>;

export const PipelineRowSchema = z.object({
  pipeline: z.string(),
  total: z.number(),
  convertidos: z.number(),
  naoConvertidos: z.number(),
  taxaConversao: z.number(),
  receitaConvertida: z.number(),
});
export type PipelineRow = z.infer<typeof PipelineRowSchema>;

export const PerformanceRowSchema = z.object({
  label: z.string(),
  total: z.number(),
  convertidos: z.number(),
  naoConvertidos: z.number(),
  taxaConversao: z.number(),
  ticketMedio: z.number(),
  receitaConvertida: z.number(),
});
export type PerformanceRow = z.infer<typeof PerformanceRowSchema>;

export const AlertSchema = z.object({
  severity: z.enum(["info", "warn", "bad"]),
  title: z.string(),
  message: z.string(),
});
export type Alert = z.infer<typeof AlertSchema>;

// ---------- Métricas de Ads (Meta, Google, TikTok, Orgânico) ----------
// `custo/roas/cpa` ficam null porque o GHL não armazena custo de anúncio.
// Pra ter esses números, é preciso conectar Meta Ads API / Google Ads API
// ou subir CSVs mensais — fora do escopo atual.
export const AdsPlatformMetricsSchema = z.object({
  visitas: z.number(),            // contatos únicos
  oportunidades: z.number(),      // opps criadas
  convertidas: z.number(),        // opps ganhas
  receita: z.number(),            // receita convertida (R$)
  custo: z.number().nullable(),   // investimento em ads (R$) — null = sem dado
  roas: z.number().nullable(),    // receita / custo — null se custo ausente
  cpa: z.number().nullable(),     // custo / convertidas — null se custo ausente
});
export type AdsPlatformMetrics = z.infer<typeof AdsPlatformMetricsSchema>;

export const AdsMetricsSchema = z.object({
  facebook: AdsPlatformMetricsSchema,
  google: AdsPlatformMetricsSchema,
  tiktok: AdsPlatformMetricsSchema,
  organico: AdsPlatformMetricsSchema,
  outros: AdsPlatformMetricsSchema,
});
export type AdsMetrics = z.infer<typeof AdsMetricsSchema>;

// ---------- Visita por origem (4 macro + outros) ----------
export const OriginBucketSchema = z.object({
  visitas: z.number(),
  convertidas: z.number(),
  receita: z.number(),
  taxaConversao: z.number(),  // 0..1
  participacao: z.number(),   // 0..1 (participação no total de opps do período)
});
export type OriginBucket = z.infer<typeof OriginBucketSchema>;

export const OriginBreakdownSchema = z.object({
  artista: OriginBucketSchema,
  social_pago: OriginBucketSchema,
  social_organico: OriginBucketSchema,
  passante: OriginBucketSchema,
  outros: OriginBucketSchema,
});
export type OriginBreakdown = z.infer<typeof OriginBreakdownSchema>;

// ---------- Artista × origem da sessão (cruzamento) ----------
export const ArtistSourceCellSchema = z.object({
  total: z.number(),
  convertidos: z.number(),
  naoConvertidos: z.number(),
  taxaConversao: z.number(), // 0..1 sobre o total da célula
});
export type ArtistSourceCell = z.infer<typeof ArtistSourceCellSchema>;

export const ArtistBySourceSchema = z.object({
  sources: z.array(z.string()), // grupos: ["Clientes Capone", "Clientes dos Artistas"]
  rows: z.array(
    z.object({
      artist: z.string(),
      bySource: z.record(z.string(), ArtistSourceCellSchema),
    }),
  ),
  // Leads sem sessionSource E sem "Fonte do negócio" — caíram no default (Capone)
  naoClassificados: z.number().optional(),
});
export type ArtistBySource = z.infer<typeof ArtistBySourceSchema>;

// ---------- Agendamentos (calendários GHL) ----------
export const AppointmentsBreakdownSchema = z.object({
  total: z.number(),
  byStatus: z.array(CountRowSchema),  // label = status cru do GHL (confirmed, noshow, ...)
  byOrigin: z.array(CountRowSchema),  // label = sessionSource do CONTATO (Paid Social, CRM UI, ...)
});
export type AppointmentsBreakdown = z.infer<typeof AppointmentsBreakdownSchema>;

// ---------- Funil de Vendas por origem/canal ----------
// 5 estágios (RevOps canônico pra serviço agendado):
//   novos      = contatos únicos no período (atribuídos ao canal)
//   agendaram  = appointments no período com status new/confirmed/showed
//                (≠ cancelled, ≠ invalid; 1 appt = 1 contagem)
//   visita     = opps no pipeline Vendas com createdAt no período
//                (visita = entrou no funil, independente de ter perdido depois)
//   tatAgend   = opps com pipelineStageId = "Tatuagem agendada" E
//                lastStageChangeAt no período (não createdAt — stage muda depois)
//   converteram = opps em VENDAS_STAGE_WON com lastStageChangeAt no período
//
// Cada linha é um canal (sessionSource do contato, com fallback em
// "Fonte do negócio" via resolveOrigin). O schema é flexível:
// `steps` e `derived` ficam com nomes semânticos em vez de campos fixos,
// pra não quebrar se um briefing futuro pedir 4 ou 6 estágios.
export const FunnelOriginRowSchema = z.object({
  origin: z.string(),                  // label do canal (Paid Social, CRM UI, ...)
  steps: z.record(z.string(), z.number()),  // {"novos":N, "agendaram":N, ...}
  stepRates: z.record(z.string(), z.number()), // 0..1, rate entre stages consecutivos
  // 0..1, taxa sobre o topo do funil (1ª coluna) — o que CEO/marketing olham
  absoluteRates: z.record(z.string(), z.number()),
  // receita (R$) das convertidas NESSA linha do funil
  receita: z.number(),
});
export type FunnelOriginRow = z.infer<typeof FunnelOriginRowSchema>;

export const FunnelByOriginSchema = z.object({
  // Ordem dos estágios no relatório (imutável, derivada do briefing)
  stages: z.array(z.string()),  // ["novos","agendaram","visita","tatAgend","converteram"]
  rows: z.array(FunnelOriginRowSchema),
  // Totais (1ª coluna = volume, última = convertidos) — pra plotar o funil agregado
  totals: FunnelOriginRowSchema,
  // Alertas RevOps gerados a partir da estrutura do funil (ver
  // skill `revenue-ops-funnel` §5). Severidade já mapeada pro pill do front.
  alerts: z.array(AlertSchema),
});
export type FunnelByOrigin = z.infer<typeof FunnelByOriginSchema>;

export const ReportSchema = z.object({
  generatedAt: z.string(),
  period: z.object({ start: z.string(), end: z.string() }),
  totals: TotalsSchema,
  contactsByDay: z.array(CountRowSchema),
  contactsByDaySource: ContactsByDaySourceSchema.optional(),
  contactsBySourceSession: z.array(CountRowSchema),
  contactsByChannel: z.array(CountRowSchema),
  sessionXChannel: z.array(CountRowSchema),
  topLandingPages: z.array(CountRowSchema),
  topAdIds: z.array(CountRowSchema),
  topLegacySources: z.array(CountRowSchema),
  topTags: z.array(CountRowSchema),
  pipelineBreakdown: z.array(PipelineRowSchema),
  byArtist: z.array(PerformanceRowSchema),
  // SDRs não são usuários do GHL — o nome vem do custom field "Dono do negócio".
  bySdr: z.array(PerformanceRowSchema),
  // Cruzamento artista × origem da sessão do contato
  byArtistSource: ArtistBySourceSchema.optional(),
  byOrigin: z.array(PerformanceRowSchema),
  // Novas seções — métricas de ads e visitas por macro-origem (hero)
  adsMetrics: AdsMetricsSchema.optional(),
  visitsByOrigin: OriginBreakdownSchema.optional(),
  // Agendamentos do período (status + origem) — widget do hero
  appointments: AppointmentsBreakdownSchema.optional(),
  // Funil de Vendas por origem/canal — 5 estágios (RevOps canônico)
  funnelByOrigin: FunnelByOriginSchema.optional(),
  // Novos campos para gráficos
  vendasFunnel: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      rate: z.number(),       // 0..1 — taxa sobre o stage anterior
    })
  ).optional(),
  revenueByDay: z.array(
    z.object({
      date: z.string(),       // YYYY-MM-DD
      receita: z.number(),     // receita fechada nesse dia
      acumulado: z.number(),   // receita acumulada
    })
  ).optional(),
  alerts: z.array(AlertSchema),
  cacheHit: z.boolean(),
  cacheAgeSeconds: z.number().optional(),
});
export type Report = z.infer<typeof ReportSchema>;
