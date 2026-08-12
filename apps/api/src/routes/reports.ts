import { Router } from "express";
import { z } from "zod";
import { ReportQuerySchema } from "@capone/shared";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { fetchAppointmentsInRange, fetchContactsByIds, fetchContactsInRange, fetchOppsInRange } from "../ghl.js";
import type { GhlContact } from "@capone/shared";
import { getCachedReport, setCachedReport, saveSnapshot, getSnapshot, listSnapshots, writeAudit } from "../db.js";
import { buildReport } from "../report.js";
import { fetchGoogleAdsSpend } from "../googleAds.js";
import { fetchMetaAdsSpend } from "../metaAds.js";

export const reports = Router();

reports.use(requireAuth());

/** Contatos de agendamentos/opps criados fora do período — buscados só pra
 *  classificar a origem (sessionSource). */
async function fetchMissingContacts(
  contacts: GhlContact[],
  ids: Array<string | null | undefined>,
): Promise<GhlContact[]> {
  const known = new Set(contacts.map((c) => c.id));
  const missing = ids.filter((id): id is string => !!id && !known.has(id));
  return fetchContactsByIds(missing);
}

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

    const [contacts, opps, appts, googleSpend, facebookSpend] = await Promise.all([
      fetchContactsInRange(start, end),
      fetchOppsInRange(start, end),
      fetchAppointmentsInRange(start, end),
      fetchGoogleAdsSpend(start, end),
      fetchMetaAdsSpend(start, end),
    ]);
    const extraContacts = await fetchMissingContacts(contacts, [
      ...appts.map((a) => a.contactId),
      ...opps.map((o) => o.contactId),
    ]);
    const report = buildReport(start, end, contacts, opps, appts, extraContacts, {
      google: googleSpend,
      facebook: facebookSpend,
    });
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
    const [contacts, opps, appts, googleSpend, facebookSpend] = await Promise.all([
      fetchContactsInRange(start, end),
      fetchOppsInRange(start, end),
      fetchAppointmentsInRange(start, end),
      fetchGoogleAdsSpend(start, end),
      fetchMetaAdsSpend(start, end),
    ]);
    const extraContacts = await fetchMissingContacts(contacts, [
      ...appts.map((a) => a.contactId),
      ...opps.map((o) => o.contactId),
    ]);
    const report = buildReport(start, end, contacts, opps, appts, extraContacts, {
      google: googleSpend,
      facebook: facebookSpend,
    });
    const id = await saveSnapshot(req.user!.id, start, end, report);
    await writeAudit(req.user!.id, "report.snapshot", { id, start, end });
    res.json({ id });
  } catch (e) {
    next(e);
  }
});

/** GET /api/reports/snapshot/:id — retorna um snapshot salvo do user logado. */
reports.get("/snapshot/:id", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: "bad_id" });
    const snap = await getSnapshot(req.user!.id, parsed.data);
    if (!snap) return res.status(404).json({ error: "not_found" });
    await writeAudit(req.user!.id, "report.snapshot.viewed", { id: parsed.data });
    res.json({ snapshot: snap });
  } catch (e) {
    next(e);
  }
});

/** GET /api/reports/snapshots — lista snapshots do user logado. */
reports.get("/snapshots", async (req: AuthedRequest, res, next) => {
  try {
    const snapshots = await listSnapshots(req.user!.id);
    res.json({ snapshots });
  } catch (e) {
    next(e);
  }
});
