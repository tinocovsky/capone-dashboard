/**
 * Cliente da Google Ads API — busca cliques/custo/CPC/CTR reais do período.
 * O GHL não guarda gasto de anúncio; esse dado só existe aqui (ou no Meta, ver metaAds.ts).
 *
 * Auth: OAuth2 refresh_token (não expira sozinho) trocado por um access_token
 * de ~1h a cada uso — cacheado em memória com margem de segurança de 60s.
 * O refresh_token precisa ter sido gerado com o escopo:
 *   https://www.googleapis.com/auth/adwords
 *
 * Se as env vars GOOGLE_ADS_* não estiverem todas configuradas, ou se a
 * chamada falhar por qualquer motivo, retorna `null` — o card de Google Ads
 * simplesmente não mostra custo/cliques (mesmo comportamento de antes),
 * o relatório inteiro nunca quebra por causa disso.
 */
import { env } from "./env.js";

// Google costuma depreciar versões da API ~1x/ano — se passar a dar 404/410
// em massa, é hora de bumpar essa constante (ver aviso de breaking change no
// changelog oficial do Google Ads API antes de trocar).
const GOOGLE_ADS_API_VERSION = "v18";

export interface AdSpend {
  cliques: number;
  custo: number; // na moeda da conta (R$, presumindo conta em BRL)
  cpc: number | null;
  ctr: number | null; // 0..1
}

function isConfigured(): boolean {
  return !!(
    env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    env.GOOGLE_ADS_CLIENT_ID &&
    env.GOOGLE_ADS_CLIENT_SECRET &&
    env.GOOGLE_ADS_REFRESH_TOKEN &&
    env.GOOGLE_ADS_CUSTOMER_ID
  );
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google OAuth token exchange falhou (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.accessToken;
}

/** Busca cliques/custo/CPC/CTR agregados do período (soma de todas as campanhas da conta). */
export async function fetchGoogleAdsSpend(start: string, end: string): Promise<AdSpend | null> {
  if (!isConfigured()) return null;
  try {
    const accessToken = await getAccessToken();
    const customerId = env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, "");
    // Query no nível "customer" (conta inteira) — segments.date no WHERE sem
    // estar no SELECT agrega tudo do período numa linha só.
    const query = `
      SELECT metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc
      FROM customer
      WHERE segments.date BETWEEN '${start}' AND '${end}'
    `.trim();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      "Content-Type": "application/json",
    };
    // Só necessário se a conta for acessada via MCC (conta gerenciadora).
    if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
      headers["login-customer-id"] = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "");
    }
    const res = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      { method: "POST", headers, body: JSON.stringify({ query }) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[googleAds] busca de gasto falhou (${res.status}): ${body.slice(0, 500)}`);
      return null;
    }
    const json = (await res.json()) as { results?: Array<{ metrics?: Record<string, string | number> }> };
    const row = json.results?.[0]?.metrics;
    if (!row) return { cliques: 0, custo: 0, cpc: null, ctr: null };
    const cliques = Number(row.clicks ?? 0);
    const custo = Number(row.costMicros ?? 0) / 1_000_000;
    const ctr = row.ctr != null ? Number(row.ctr) : null;
    const cpc = row.averageCpc != null ? Number(row.averageCpc) / 1_000_000 : cliques ? custo / cliques : null;
    return { cliques, custo, cpc, ctr };
  } catch (e) {
    console.warn(`[googleAds] erro ao buscar gasto: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
