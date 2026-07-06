import { Router } from "express";
import { ReportQuerySchema } from "@capone/shared";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { fetchContactsInRange, fetchOppsInRange } from "../ghl.js";
import { getCachedReport, setCachedReport, saveSnapshot, writeAudit } from "../db.js";
import { buildReport } from "../report.js";

export const reports = Router();

reports.use(requireAuth());

/** GET /api/reports?start=YYYY-MM-DD&end=YYYY-MM-DD&forceRefresh=0|1
 *  Retorna o relatório completo. Cache 5 min. */
reports.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = ReportQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "bad_query", details: parsed.error.flatten() });
    const { start, end, forceRefresh } = parsed.data;

    if (!forceRefresh) {
      const cached = await getCachedReport(start, end);
      if (cached) {
        await writeAudit(req.user!.id, "report.served.cache", { start, end, age: cached.cacheAgeSeconds });
        return res.json(cached);
      }
    }

    const [contacts, opps] = await Promise.all([fetchContactsInRange(start, end), fetchOppsInRange(start, end)]);
    const report = buildReport(start, end, contacts, opps);
    await setCachedReport(start, end, report);
    await writeAudit(req.user!.id, "report.computed", { start, end, contacts: contacts.length, opps: opps.length });
    res.json(report);
  } catch (e) {
    next(e);
  }
});

/** POST /api/reports/snapshot  — salva um snapshot histórico (user-clicou-em-salvar). */
reports.post("/snapshot", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = ReportQuerySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad_body" });
    const { start, end } = parsed.data;
    const [contacts, opps] = await Promise.all([fetchContactsInRange(start, end), fetchOppsInRange(start, end)]);
    const report = buildReport(start, end, contacts, opps);
    const id = await saveSnapshot(req.user!.id, start, end, report);
    await writeAudit(req.user!.id, "report.snapshot", { id, start, end });
    res.json({ id });
  } catch (e) {
    next(e);
  }
});

/** GET /api/reports/snapshots — lista snapshots do user logado. */
reports.get("/snapshots", async (req: AuthedRequest, res, next) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { env } = await import("../env.js");
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await sb
      .from("report_snapshots")
      .select("id, period_start, period_end, created_at, note")
      .eq("user_id", req.user!.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ snapshots: data });
  } catch (e) {
    next(e);
  }
});
