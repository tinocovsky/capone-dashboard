/**
 * LeadConnector (GHL) HTTP client.
 *
 * Schema real do API (validado contra api real em jul/2026):
 *   POST /opportunities/search
 *     body: { locationId: string, limit?: number, page?: number }
 *     NÃO aceita: pipeline_id, pipelineId, startAfter, startAfterId, cursor, after, q,
 *                 startDate, endDate, pageSize, pageLimit, skip, offset
 *     retorna: { opportunities: [...], total: number, traceId: string }
 *     paginação: por `page` (1-based) + `limit` (max testado: 100)
 *   POST /contacts/search
 *     body: { locationId, page?, pageLimit? }  (aqui aceita pageLimit, diferente de opps)
 *     NÃO aceita: limit, startDate, endDate
 *     filtros date_added quebram — filtra local por dateAdded
 *
 * Headers: User-Agent de browser é obrigatório (Cloudflare 1010 bloqueia UA genéricos).
 */
import { env } from "./env.js";
import type { GhlContact, GhlOpportunity } from "@capone/shared";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_PAGES = 100; // GHL limita page*pageLimit ≤ 10000; com 100 por página, máx 100 páginas = 10k
const PAGE_SIZE = 100; // máximo aceito pelo API
const FETCH_TIMEOUT_MS = 60_000; // 60s por request; GHL pode demorar muito em páginas altas

// Detecta se o GHL retornou o erro de "result window exceeded" para parar a paginação
class ResultWindowExceeded extends Error {}
async function ghlFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${env.GHL_API_BASE}${path}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        Authorization: `Bearer ${env.GHL_API_TOKEN}`,
        "User-Agent": BROWSER_UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Version: "2021-07-28",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (body.includes("result window")) throw new ResultWindowExceeded(body.slice(0, 200));
      throw new Error(`GHL ${res.status} ${res.statusText} em ${path} — ${body.slice(0, 300)}`);
    }
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Paginação por `page` (1-based). Tamanho varia por endpoint:
 *   /opportunities/search → `limit`
 *   /contacts/search      → `pageLimit`
 * Limite GHL: page * size ≤ 10000. Se exceder, para a paginação e retorna o que tem.
 * NOTA: dados com mais de 10k registros (em janela página*tamanho) ficam truncados. */
async function fetchByPage<T>(
  path: string,
  baseBody: object,
  arrayKey: "opportunities" | "contacts",
  sizeParam: "limit" | "pageLimit",
): Promise<T[]> {
  const out: T[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await ghlFetch(path, {
        method: "POST",
        body: JSON.stringify({ ...baseBody, page, [sizeParam]: PAGE_SIZE }),
      });
    } catch (e) {
      if (e instanceof ResultWindowExceeded) { truncated = true; break; }
      throw e;
    }
    const json = (await res.json()) as Record<string, unknown>;
    const arr = Array.isArray(json[arrayKey]) ? (json[arrayKey] as T[]) : [];
    out.push(...arr);
    if (arr.length < PAGE_SIZE) break;
    const total = typeof json.total === "number" ? json.total : null;
    if (total && out.length >= total) break;
  }
  if (truncated) {
    console.warn(`[ghl] ${path}: paginação truncada em ${out.length} registros (limite GHL: 10k por janela).`);
  }
  return out;
}

export async function fetchContactsInRange(start: string, end: string): Promise<GhlContact[]> {
  // /contacts/search: locationId + page + pageLimit; filtros de data quebram → filtra local.
  const rows = await fetchByPage<GhlContact>(
    `/contacts/search`,
    { locationId: env.GHL_LOCATION_ID },
    "contacts",
    "pageLimit",
  );
  return rows.filter((c) => {
    const d = c.dateAdded?.slice(0, 10);
    return d && d >= start && d <= end;
  });
}
export async function fetchOppsInRange(start: string, end: string): Promise<GhlOpportunity[]> {
  // /opportunities/search: aceita locationId + page + limit. NÃO filtra por pipeline.
  // Filtramos local por pipelineId (e por período).
  // O pipeline de prospecção (reativação) tem opps vazias — separamos em bucket.
  const allPipelines = new Set([env.GHL_PIPELINE_VENDAS, env.GHL_PIPELINE_POS_VENDAS]);
  const all = await fetchByPage<GhlOpportunity>(
    `/opportunities/search`,
    { locationId: env.GHL_LOCATION_ID },
    "opportunities",
    "limit",
  );
  return all.filter((o) => {
    if (!allPipelines.has(o.pipelineId)) return false;
    // GHL retorna createdAt (ISO string), não dateAdded.
    const d = o.createdAt?.slice(0, 10);
    return d && d >= start && d <= end;
  });
}

/** Retorna contagem de opps vazias no pipeline de prospecção (reativação). */
export async function countProspeccaoVazias(start: string, end: string): Promise<number> {
  if (!env.GHL_PIPELINE_PROSPECCAO) return 0;
  const all = await fetchByPage<GhlOpportunity>(
    `/opportunities/search`,
    { locationId: env.GHL_LOCATION_ID },
    "opportunities",
    "limit",
  );
  return all.filter((o) => {
    if (o.pipelineId !== env.GHL_PIPELINE_PROSPECCAO) return false;
    const d = o.createdAt?.slice(0, 10);
    return d && d >= start && d <= end;
  }).length;
}
