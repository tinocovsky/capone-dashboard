/**
 * LeadConnector (GHL) HTTP client.
 *
 * Schema real do API (validado contra api real em jul/2026):
 *   POST /opportunities/search
 *     body: { locationId: string, limit?: number, page?: number, filters?: [...] }
 *     paginação: por `page` (1-based) + `limit` (max testado: 100)
 *     filtro de data: filters:[{ field:"date_added", operator:"range",
 *                     value:{ gte, lte } }]  (ISO com Z). ⚠️ o campo é "date_added"
 *                     (snake_case); "createdAt"/"dateAdded" retornam 422.
 *     retorna: { opportunities: [...], total: number, traceId: string }
 *   POST /contacts/search
 *     body: { locationId, page?, pageLimit?, filters?: [...] }  (aqui é pageLimit, não limit)
 *     filtro de data: filters:[{ field:"dateAdded", operator:"range",
 *                     value:{ gte, lte } }]  (ISO com Z). Aqui o campo é "dateAdded"
 *                     (camelCase), diferente das opps.
 *
 * IMPORTANTE: sempre filtre por data no servidor. O GHL impõe page*size ≤ 10000;
 * sem filtro, esta location tem ~25k contatos e ~21k opps, então a paginação
 * truncava >50% dos dados silenciosamente. Com o filtro de período o conjunto
 * cai pra centenas e nunca encosta no teto.
 *
 * Headers: User-Agent de browser é obrigatório (Cloudflare 1010 bloqueia UA genéricos).
 */
import { env } from "./env.js";
import type { GhlAppointment, GhlContact, GhlOpportunity } from "@capone/shared";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_PAGES = 100; // GHL limita page*pageLimit ≤ 10000; com 100 por página, máx 100 páginas = 10k
const PAGE_SIZE = 100; // máximo aceito pelo API
const PAGE_CONCURRENCY = 5; // páginas buscadas em paralelo por lote
const FETCH_TIMEOUT_MS = 60_000; // 60s por request; GHL pode demorar muito em páginas altas
const MAX_RETRIES = 3; // GHL falha ~5% das chamadas de forma intermitente; retry resolve
const RETRY_BASE_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 400 "Error occurred while searching for contact" é instabilidade do GHL, não erro de payload:
// a mesma página funciona no retry (medido jul/2026: ~5 falhas a cada 100 chamadas).
function isRetryable(status: number, body: string): boolean {
  if (status === 429 || status >= 500) return true;
  return status === 400 && body.includes("Error occurred while searching");
}

/** Filtro de intervalo de datas no formato aceito pelo /search do GHL.
 *  O nome do campo difere por endpoint (ver comentário no topo do arquivo). */
function dateRangeFilter(field: "dateAdded" | "date_added", start: string, end: string) {
  return [
    {
      field,
      operator: "range",
      value: { gte: `${start}T00:00:00.000Z`, lte: `${end}T23:59:59.999Z` },
    },
  ];
}

// Detecta se o GHL retornou o erro de "result window exceeded" para parar a paginação
class ResultWindowExceeded extends Error {}
async function ghlFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${env.GHL_API_BASE}${path}`;
  for (let attempt = 0; ; attempt++) {
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
      if (res.ok) return res;
      const body = await res.text().catch(() => "");
      if (body.includes("result window")) throw new ResultWindowExceeded(body.slice(0, 200));
      if (attempt < MAX_RETRIES && isRetryable(res.status, body)) {
        const wait = RETRY_BASE_MS * 2 ** attempt;
        console.warn(`[ghl] ${res.status} em ${path} (tentativa ${attempt + 1}/${MAX_RETRIES + 1}), retry em ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw new Error(`GHL ${res.status} ${res.statusText} em ${path} — ${body.slice(0, 300)}`);
    } finally {
      clearTimeout(t);
    }
  }
}

type PageResult<T> = { rows: T[]; total: number | null; stop: boolean };

/** Busca uma única página. `stop` = true quando bateu na janela de 10k do GHL. */
async function fetchOnePage<T>(
  path: string,
  baseBody: object,
  arrayKey: "opportunities" | "contacts",
  sizeParam: "limit" | "pageLimit",
  page: number,
): Promise<PageResult<T>> {
  let res: Response;
  try {
    res = await ghlFetch(path, {
      method: "POST",
      body: JSON.stringify({ ...baseBody, page, [sizeParam]: PAGE_SIZE }),
    });
  } catch (e) {
    if (e instanceof ResultWindowExceeded) return { rows: [], total: null, stop: true };
    throw e;
  }
  const json = (await res.json()) as Record<string, unknown>;
  const rows = Array.isArray(json[arrayKey]) ? (json[arrayKey] as T[]) : [];
  const total = typeof json.total === "number" ? json.total : null;
  return { rows, total, stop: false };
}

/** Paginação por `page` (1-based). Busca a página 1 pra descobrir o `total`,
 * calcula quantas páginas faltam e busca o resto em lotes paralelos.
 * Limite GHL: page * size ≤ 10000 (100 páginas). Se o total exceder, trunca e avisa —
 * mas com filtro de período isso praticamente nunca acontece. */
async function fetchByPage<T>(
  path: string,
  baseBody: object,
  arrayKey: "opportunities" | "contacts",
  sizeParam: "limit" | "pageLimit",
): Promise<T[]> {
  const first = await fetchOnePage<T>(path, baseBody, arrayKey, sizeParam, 1);
  const out: T[] = [...first.rows];
  if (first.stop || first.rows.length < PAGE_SIZE) return out;

  const totalPages = first.total ? Math.ceil(first.total / PAGE_SIZE) : MAX_PAGES;
  const lastPage = Math.min(totalPages, MAX_PAGES);
  if (first.total && first.total > MAX_PAGES * PAGE_SIZE) {
    console.warn(
      `[ghl] ${path}: ${first.total} registros excedem a janela de ${MAX_PAGES * PAGE_SIZE} do GHL — ` +
        `resultado truncado. Reduza o intervalo de datas.`,
    );
  }

  for (let p = 2; p <= lastPage; p += PAGE_CONCURRENCY) {
    const batch: Array<Promise<PageResult<T>>> = [];
    for (let i = 0; i < PAGE_CONCURRENCY && p + i <= lastPage; i++) {
      batch.push(fetchOnePage<T>(path, baseBody, arrayKey, sizeParam, p + i));
    }
    const pages = await Promise.all(batch);
    let stop = false;
    for (const pg of pages) {
      out.push(...pg.rows);
      if (pg.stop || pg.rows.length < PAGE_SIZE) stop = true; // fim dos dados
    }
    if (stop) break;
  }
  return out;
}

export async function fetchContactsInRange(start: string, end: string): Promise<GhlContact[]> {
  // Filtro de data no servidor (campo "dateAdded"). O filtro local abaixo é
  // defesa em profundidade — se o filtro server-side regredir, ainda entregamos
  // só o período pedido (em vez de todos os contatos rotulados como "no período").
  const rows = await fetchByPage<GhlContact>(
    `/contacts/search`,
    { locationId: env.GHL_LOCATION_ID, filters: dateRangeFilter("dateAdded", start, end) },
    "contacts",
    "pageLimit",
  );
  return rows.filter((c) => {
    const d = c.dateAdded?.slice(0, 10);
    return d && d >= start && d <= end;
  });
}

export async function fetchOppsInRange(start: string, end: string): Promise<GhlOpportunity[]> {
  // Filtro de data no servidor (campo "date_added", que corresponde ao createdAt do response).
  // Continuamos filtrando local por pipeline (Vendas/Pós-vendas) — o GHL não filtra por isso.
  const allPipelines = new Set([env.GHL_PIPELINE_VENDAS, env.GHL_PIPELINE_POS_VENDAS]);
  const all = await fetchByPage<GhlOpportunity>(
    `/opportunities/search`,
    { locationId: env.GHL_LOCATION_ID, filters: dateRangeFilter("date_added", start, end) },
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

/** Agendamentos dos calendários configurados cujo startTime cai no período.
 *  GET /calendars/events exige calendarId (ou userId/groupId) — a listagem de
 *  calendários está fora do escopo do token (401), por isso os IDs vêm de
 *  env.GHL_CALENDAR_IDS. Sem paginação: o endpoint retorna tudo do intervalo. */
export async function fetchAppointmentsInRange(start: string, end: string): Promise<GhlAppointment[]> {
  const calendarIds = env.GHL_CALENDAR_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  if (!calendarIds.length) return [];
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T23:59:59.999Z`);
  const perCalendar = await Promise.all(
    calendarIds.map(async (calendarId) => {
      const res = await ghlFetch(
        `/calendars/events?locationId=${env.GHL_LOCATION_ID}&calendarId=${calendarId}&startTime=${startMs}&endTime=${endMs}`,
        { headers: { Version: "2021-04-15" } },
      );
      const json = (await res.json()) as { events?: GhlAppointment[] };
      return Array.isArray(json.events) ? json.events : [];
    }),
  );
  return perCalendar.flat();
}

/** Busca contatos individuais por id (GET /contacts/:id), em lotes paralelos.
 *  Usado pra classificar a origem de agendamentos cujo contato foi criado fora
 *  do período do relatório. Contato deletado/inacessível é simplesmente pulado. */
export async function fetchContactsByIds(ids: string[]): Promise<GhlContact[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: GhlContact[] = [];
  for (let i = 0; i < unique.length; i += PAGE_CONCURRENCY) {
    const batch = unique.slice(i, i + PAGE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await ghlFetch(`/contacts/${id}`);
          const json = (await res.json()) as { contact?: GhlContact };
          return json.contact ?? null;
        } catch {
          return null;
        }
      }),
    );
    for (const c of results) if (c) out.push(c);
  }
  return out;
}

/** Retorna contagem de opps vazias no pipeline de prospecção (reativação). */
export async function countProspeccaoVazias(start: string, end: string): Promise<number> {
  if (!env.GHL_PIPELINE_PROSPECCAO) return 0;
  const all = await fetchByPage<GhlOpportunity>(
    `/opportunities/search`,
    { locationId: env.GHL_LOCATION_ID, filters: dateRangeFilter("date_added", start, end) },
    "opportunities",
    "limit",
  );
  return all.filter((o) => {
    if (o.pipelineId !== env.GHL_PIPELINE_PROSPECCAO) return false;
    const d = o.createdAt?.slice(0, 10);
    return d && d >= start && d <= end;
  }).length;
}
