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
  attributionSource: z
    .object({
      session: z
        .object({
          medium: z.string().optional().nullable(),
          url: z.string().optional().nullable(),
          adId: z.string().optional().nullable(),
        })
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
});
export type GhlContact = z.infer<typeof GhlContactSchema>;

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
  closersNoMes: z.number(),
});
export type Totals = z.infer<typeof TotalsSchema>;

export const CountRowSchema = z.object({
  label: z.string(),
  count: z.number(),
  percent: z.number(),
});
export type CountRow = z.infer<typeof CountRowSchema>;

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

export const ReportSchema = z.object({
  generatedAt: z.string(),
  period: z.object({ start: z.string(), end: z.string() }),
  totals: TotalsSchema,
  contactsByDay: z.array(CountRowSchema),
  contactsBySourceSession: z.array(CountRowSchema),
  contactsByChannel: z.array(CountRowSchema),
  sessionXChannel: z.array(CountRowSchema),
  topLandingPages: z.array(CountRowSchema),
  topAdIds: z.array(CountRowSchema),
  topLegacySources: z.array(CountRowSchema),
  topTags: z.array(CountRowSchema),
  pipelineBreakdown: z.array(PipelineRowSchema),
  byArtist: z.array(PerformanceRowSchema),
  byCloser: z.array(PerformanceRowSchema),
  byOrigin: z.array(PerformanceRowSchema),
  // Novas seções — métricas de ads e visitas por macro-origem (hero)
  adsMetrics: AdsMetricsSchema.optional(),
  visitsByOrigin: OriginBreakdownSchema.optional(),
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
