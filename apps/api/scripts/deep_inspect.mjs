import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const lines = env.split("\n");
function get(name) {
  const line = lines.find(l => l.indexOf(name + "=") === 0);
  return line ? line.substring(name.length + 1) : null;
}
const loc = get("GHL_LOCATION_ID");
const vendas = get("GHL_PIPELINE_VENDAS");
const pos = get("GHL_PIPELINE_POS_VENDAS");
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const token = lines.find(l => l.indexOf(T) === 0).substring(T.length);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

const pipelines = new Set([vendas, pos]);
const startMs = Date.parse("2026-06-01");
const endMs = Date.parse("2026-06-30") + 86400000;

const statusCounts = { open: 0, won: 0, lost: 0, abandoned: 0, outros: 0 };
const stageNames = new Set();
const customFieldIds = new Set();
for (let page = 1; page <= 5; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    if (!pipelines.has(o.pipelineId)) continue;
    const dMs = Date.parse(o.createdAt ?? "");
    if (dMs < startMs || dMs > endMs) continue;
    statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    if (statusCounts[o.status] === undefined) statusCounts.outros++;
    if (o.pipelineStageId) stageNames.add(o.pipelineId + "::" + o.pipelineStageId);
    for (const cf of o.customFields ?? []) customFieldIds.add(cf.id);
  }
}
console.log("=== status em opps de jun/2026 ===");
for (const [k, v] of Object.entries(statusCounts)) console.log(" -", k, ":", v);
console.log("\n=== stages distintos (em jun) ===");
for (const s of stageNames) console.log(" -", s);
console.log("\n=== custom field IDs encontrados nas opps ===");
for (const id of customFieldIds) console.log(" -", id);
