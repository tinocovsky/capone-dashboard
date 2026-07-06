/**
 * Camada de persistência: cache do relatório no Supabase + audit log.
 * Tabelas: dashboard_cache (1 linha por período), report_snapshots (histórico), audit_logs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import type { Report } from "@capone/shared";

let _client: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

const CACHE_TTL_SECONDS = 5 * 60; // 5 min

export async function getCachedReport(start: string, end: string): Promise<Report | null> {
  const { data, error } = await supabaseAdmin()
    .from("dashboard_cache")
    .select("report, generated_at")
    .eq("period_start", start)
    .eq("period_end", end)
    .maybeSingle();
  if (error || !data) return null;
  const ageSec = (Date.now() - new Date(data.generated_at).getTime()) / 1000;
  if (ageSec > CACHE_TTL_SECONDS) return null;
  return { ...(data.report as Report), cacheHit: true, cacheAgeSeconds: Math.round(ageSec) };
}

export async function setCachedReport(start: string, end: string, report: Report): Promise<void> {
  await supabaseAdmin()
    .from("dashboard_cache")
    .upsert(
      { period_start: start, period_end: end, report, generated_at: new Date().toISOString() },
      { onConflict: "period_start,period_end" },
    );
}

export async function saveSnapshot(userId: string, start: string, end: string, report: Report): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("report_snapshots")
    .insert({
      user_id: userId,
      period_start: start,
      period_end: end,
      report,
      note: `Snapshot ${start}..${end}`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao salvar snapshot: ${error.message}`);
  return data!.id;
}

export async function writeAudit(userId: string, action: string, meta: object): Promise<void> {
  await supabaseAdmin()
    .from("audit_logs")
    .insert({ user_id: userId, action, meta, at: new Date().toISOString() });
}
