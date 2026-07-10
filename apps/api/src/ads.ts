/**
 * Classificação e agregação de métricas de Ads a partir dos dados do GHL.
 *
 * O GHL NÃO armazena custo de anúncios, CPC, CPL ou impressões — esses
 * dados só existem nas APIs do Meta Ads / Google Ads. Aqui, o que dá
 * pra extrair do GHL é **quais leads vieram de qual plataforma**, via:
 *
 *   - `contact.customFields[].fbclid`       → Meta Ads (Facebook/Instagram)
 *   - `contact.customFields[].gclid_id`     → Google Ads
 *   - `contact.customFields[].ctwclid`      → Chatwoot (não é ads — exclui)
 *   - `opportunity.customFields["Fonte do negócio"]` → macro-origem
 *   - `opportunity.customFields["Canal do negócio"]`  → canal específico
 *
 * As IDs de custom field vêm do env. Se a conta não tiver o custom
 * field configurado, o valor é simplesmente `null` e a classificação
 * cai pra "Orgânico/Desconhecido" — o relatório nunca quebra.
 *
 * Custom fields relevantes (location C8d1LN8IL9XdN9kDkaF9, jul/2026):
 *   contact:    WvVVNoh5idpONGkpIkZz  utm_source
 *               ahvyuExWKo4Ac10Z2fOD  fbclid
 *               TUqduknRcAkcQkHKUsc3  gclid_id
 *               eSbZ5ECMEwOOUN3dnxHJ  ctwclid
 *               QaxePevXsJEQRGLe5tOl  Ad Id
 *   opportunity: Z9V5sduzueNFxPbqtqGh  Fonte do negócio (macro)
 *                nLruNd6tbsG0lE16LDzI  Canal do negócio
 *                9XPhm85vxOYEyZ6yRB9N  Artista escolhido
 */
import type { GhlContact, GhlOpportunity, AdsMetrics, OriginBreakdown, PerformanceRow } from "@capone/shared";
import { env } from "./env.js";

// ---------- Tipos internos ----------

type CField = {
  id?: string;
  fieldValueString?: string | null;
  fieldValueNumber?: number | null;
  fieldValueArray?: string[] | null;
  fieldValueDate?: number | null;
  value?: unknown;
};

function pickCF(customFields: readonly CField[] | undefined, id: string): string | null {
  if (!customFields) return null;
  const f = customFields.find((x) => x.id === id);
  if (!f) return null;
  if (f.fieldValueString != null && f.fieldValueString !== "") return f.fieldValueString;
  if (typeof f.fieldValueNumber === "number") return String(f.fieldValueNumber);
  if (f.fieldValueArray && f.fieldValueArray.length > 0) return f.fieldValueArray.join(", ");
  if (typeof f.fieldValueDate === "number") return new Date(f.fieldValueDate).toISOString().slice(0, 10);
  if (f.value != null) return String(f.value);
  return null;
}

// ---------- Classificação por plataforma ----------

export type AdsPlatform = "facebook" | "google" | "tiktok" | "organico" | "outros";

/** Classifica um contato de acordo com os custom fields de tracking de ads.
 *  Prioridade: fbclid > gclid > ctwclid > utm_source > attributionSource. */
export function classifyPlatform(contact: GhlContact): AdsPlatform {
  const cf = contact.customFields;
  if (pickCF(cf, env.GHL_FIELD_FBCLID)) return "facebook";
  if (pickCF(cf, env.GHL_FIELD_GCLID)) return "google";
  // Chatwoot não é ads — conta como "outros" / "indefinido"
  if (pickCF(cf, env.GHL_FIELD_CTWCLID)) return "outros";
  // Fallback por utm_source (e utm_medium como secundário) — abrange casos em que
  // o click ID não foi gravado mas o utm_source sim.
  const utmSrc = (pickCF(cf, env.GHL_FIELD_UTM_SOURCE) || "").toLowerCase().trim();
  const utmMed = (pickCF(cf, env.GHL_FIELD_UTM_MEDIUM) || "").toLowerCase().trim();
  const combined = `${utmSrc} ${utmMed}`;
  // Facebook / Instagram (Meta Ads) — qualquer combinação com fb/ig/meta/instagram/facebook
  if (/\b(?:fb|ig|meta|facebook|instagram)\b/.test(combined)) return "facebook";
  // Google Ads / Google Click Identifier
  if (/\b(?:google|google_ads|adwords|googleads|google-ads)\b/.test(combined)) return "google";
  // TikTok Ads
  if (/\b(?:tiktok|tt)\b/.test(combined)) return "tiktok";

  // Último fallback: attributionSource nativo do GHL — shape FLAT no /contacts/search
  // (sessionSource: "Paid Social" | "Paid Search" | "Social media" | "CRM UI" | ...).
  const att = contact.attributionSource;
  if (att?.gclid) return "google";
  const attrCombined = `${att?.sessionSource ?? ""} ${att?.medium ?? ""}`.toLowerCase().trim();
  if (attrCombined) {
    if (/(paid social|paid_social|social_paid|paid-social|\bfb\b|\big\b|meta|facebook|instagram)/.test(attrCombined)) return "facebook";
    if (/(paid search|paid_search|search_paid|cpc|google|adwords)/.test(attrCombined)) return "google";
    if (/(tiktok|\btt\b)/.test(attrCombined)) return "tiktok";
    // orgânico / direto / referral / CRM UI — não-ads
    return "organico";
  }

  // Tem utm_source mas não-ads (ex: "newsletter", "email", "WhatsApp", etc.) → outros
  if (utmSrc) return "outros";
  return "organico"; // sem rastreamento nenhum → orgânico
}

// ---------- Classificação por macro-origem (do opp) ----------

export type MacroOrigin = "artista" | "social_pago" | "social_organico" | "passante" | "outros";

/** Bucket canônico a partir do valor salvo no custom field "Fonte do negócio"
 *  (Z9V5sduzueNFxPbqtqGh). Mapeia os 19 valores possíveis em 5 grupos
 *  para o destaque do hero. */
export function classifyMacroOrigin(opp: GhlOpportunity): MacroOrigin {
  const fonte = (pickCF(opp.customFields, env.GHL_FIELD_FONTE_NEGOCIO) || "").trim();

  // Mapeamento literal — exatos como aparecem no picklist
  if (/^artistas\s*\(art\)$/i.test(fonte)) return "artista";
  if (/^passante\s*\(pas\)$/i.test(fonte)) return "passante";
  if (/^social\s*pago\s*\(inb\)$/i.test(fonte)) return "social_pago";
  if (/^pesquisa\s*paga\s*\(inb\)$/i.test(fonte)) return "social_pago"; // Google Ads pago
  if (/^social\s*org[âa]nico\s*\(inb\)$/i.test(fonte)) return "social_organico";
  if (/^pesquisa\s*org[âa]nica\s*\(inb\)$/i.test(fonte)) return "social_organico";

  // Fallback heurístico se o usuário salvou texto livre
  const lower = fonte.toLowerCase();
  if (lower.includes("artista") || lower.includes("art ")) return "artista";
  if (lower.includes("passante") || lower.includes("pas")) return "passante";
  if (lower.includes("pago") || lower.includes(" pp ") || lower.endsWith("(pp")) return "social_pago";
  if (lower.includes("inb") || lower.includes("orgânico") || lower.includes("organico")) return "social_organico";
  return "outros";
}

// ---------- Agregação ----------

type AggRow = {
  visitas: number;     // contatos únicos
  oportunidades: number; // opps criadas
  convertidas: number;  // opps ganhas
  receita: number;      // receita convertida
};

const emptyAgg = (): AggRow => ({ visitas: 0, oportunidades: 0, convertidas: 0, receita: 0 });

/** Agrega métricas de ads por plataforma.
 *  Cruza contactId (do opp) com o contact (pra achar fbclid/gclid). */
export function aggregateAdsMetrics(
  contacts: GhlContact[],
  classifiedOpps: Array<{ o: GhlOpportunity; won: boolean; lost: boolean }>,
): AdsMetrics {
  const byPlatform: Record<AdsPlatform, AggRow> = {
    facebook: emptyAgg(),
    google: emptyAgg(),
    tiktok: emptyAgg(),
    organico: emptyAgg(),
    outros: emptyAgg(),
  };

  // Indexa contatos por id pra lookup O(1)
  const contactById = new Map<string, GhlContact>();
  for (const c of contacts) contactById.set(c.id, c);

  // Visitas = contatos únicos (no nível de contato, não opp)
  for (const c of contacts) {
    const p = classifyPlatform(c);
    byPlatform[p].visitas++;
  }

  // Oportunidades / convertidas / receita — classifica pela plataforma do CONTATO
  // associado. Se o opp não tem contactId, cai em "outros".
  for (const { o, won } of classifiedOpps) {
    const contact = o.contactId ? contactById.get(o.contactId) : undefined;
    const p: AdsPlatform = contact ? classifyPlatform(contact) : "outros";
    byPlatform[p].oportunidades++;
    if (won) {
      byPlatform[p].convertidas++;
      byPlatform[p].receita += o.monetaryValue ?? 0;
    }
  }

  // Sem custo de ads disponível no GHL — campos ficam null
  const buildOne = (p: AggRow) => ({
    visitas: p.visitas,
    oportunidades: p.oportunidades,
    convertidas: p.convertidas,
    receita: p.receita,
    custo: null as number | null,
    roas: null as number | null,
    cpa: null as number | null,
  });

  return {
    facebook: buildOne(byPlatform.facebook),
    google: buildOne(byPlatform.google),
    tiktok: buildOne(byPlatform.tiktok),
    organico: buildOne(byPlatform.organico),
    outros: buildOne(byPlatform.outros),
  };
}

/** Soma visitas/oportunidades das 3 plataformas de ads (Meta+Google+TikTok).
 *  Usado pra detectar sub-cobertura de tracking e gerar alerta no report. */
export function adsTrackingCoverage(ads: AdsMetrics): {
  adsVisitas: number;
  totalVisitas: number;
  coberturaPct: number;
} {
  const adsVisitas = ads.facebook.visitas + ads.google.visitas + ads.tiktok.visitas;
  const totalVisitas = adsVisitas + ads.organico.visitas + ads.outros.visitas;
  return {
    adsVisitas,
    totalVisitas,
    coberturaPct: totalVisitas ? adsVisitas / totalVisitas : 0,
  };
}

/** Visitas (oportunidades) segregadas pelas 4 macro-origens do briefing:
 *    Artistas | Social Pago | Social Orgânico | Passante
 *  Retorna também a receita convertida por origem (macro) pra dar contexto
 *  no card do hero. */
export function aggregateVisitsByOrigin(
  classifiedOpps: Array<{ o: GhlOpportunity; won: boolean; lost: boolean }>,
): OriginBreakdown {
  const buckets: Record<MacroOrigin, AggRow> = {
    artista: emptyAgg(),
    social_pago: emptyAgg(),
    social_organico: emptyAgg(),
    passante: emptyAgg(),
    outros: emptyAgg(),
  };

  for (const { o, won } of classifiedOpps) {
    const k = classifyMacroOrigin(o);
    buckets[k].oportunidades++;
    if (won) {
      buckets[k].convertidas++;
      buckets[k].receita += o.monetaryValue ?? 0;
    }
  }

  const total = classifiedOpps.length || 1;
  const build = (k: MacroOrigin) => ({
    visitas: buckets[k].oportunidades,
    convertidas: buckets[k].convertidas,
    receita: buckets[k].receita,
    taxaConversao: buckets[k].oportunidades ? buckets[k].convertidas / buckets[k].oportunidades : 0,
    participacao: buckets[k].oportunidades / total,
  });

  return {
    artista: build("artista"),
    social_pago: build("social_pago"),
    social_organico: build("social_organico"),
    passante: build("passante"),
    outros: build("outros"),
  };
}

/** Performance rows (formato padrão do dashboard) a partir das origens macro
 *  — usado pra exibir a tabela "Performance por Origem" (seção 8) com os
 *  4 grupos canônicos do briefing. */
export function originRowsFromBreakdown(b: OriginBreakdown): PerformanceRow[] {
  const label = {
    artista: "Artistas (Art)",
    social_pago: "Social Pago (Inb)",
    social_organico: "Social Orgânico (Inb)",
    passante: "Passante (Pas)",
    outros: "Outros",
  } as const;
  const order: MacroOrigin[] = ["artista", "social_pago", "social_organico", "passante", "outros"];
  return order.map((k) => {
    const x = b[k];
    return {
      label: label[k],
      total: x.visitas,
      convertidos: x.convertidas,
      naoConvertidos: x.visitas - x.convertidas,
      taxaConversao: x.taxaConversao,
      ticketMedio: x.convertidas ? x.receita / x.convertidas : 0,
      receitaConvertida: x.receita,
    };
  });
}
