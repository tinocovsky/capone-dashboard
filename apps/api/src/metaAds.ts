/**
 * Cliente da Meta Marketing API (Facebook + Instagram Ads) — busca
 * cliques/gasto/CPC/CTR reais do período via Graph API Insights.
 *
 * Auth: system user token de longa duração (não expira, não precisa refresh) —
 * gerado no Business Manager. Token vai no header Authorization (não na URL,
 * pra não vazar em logs de acesso).
 *
 * Se META_AD_ACCOUNT_ID/META_ACCESS_TOKEN não estiverem configurados, ou a
 * chamada falhar, retorna `null` — o card de Meta Ads simplesmente não mostra
 * custo/cliques, o relatório nunca quebra por causa disso.
 */
import { env } from "./env.js";
import type { AdSpend } from "./googleAds.js";

// Graph API costuma manter versões válidas por ~2 anos — sem pressa pra bumpar.
const META_API_VERSION = "v21.0";

function isConfigured(): boolean {
  return !!(env.META_AD_ACCOUNT_ID && env.META_ACCESS_TOKEN);
}

/** Busca cliques/gasto/CPC/CTR agregados do período (soma de todas as campanhas da conta). */
export async function fetchMetaAdsSpend(start: string, end: string): Promise<AdSpend | null> {
  if (!isConfigured()) return null;
  try {
    const accountId = env.META_AD_ACCOUNT_ID!.replace(/^act_/, "");
    const timeRange = JSON.stringify({ since: start, until: end });
    const url =
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights` +
      `?fields=spend,clicks,cpc,ctr&time_range=${encodeURIComponent(timeRange)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[metaAds] busca de gasto falhou (${res.status}): ${body.slice(0, 500)}`);
      return null;
    }
    const json = (await res.json()) as { data?: Array<Record<string, string>> };
    const row = json.data?.[0];
    if (!row) return { cliques: 0, custo: 0, cpc: null, ctr: null };
    const cliques = Number(row.clicks ?? 0);
    const custo = Number(row.spend ?? 0);
    // Meta retorna ctr em pontos percentuais (ex: "1.05" = 1.05%) — normaliza
    // pra fração 0..1 como o resto do dashboard (fmtPct espera 0..1).
    const ctr = row.ctr != null ? Number(row.ctr) / 100 : null;
    const cpc = row.cpc != null ? Number(row.cpc) : cliques ? custo / cliques : null;
    return { cliques, custo, cpc, ctr };
  } catch (e) {
    console.warn(`[metaAds] erro ao buscar gasto: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
