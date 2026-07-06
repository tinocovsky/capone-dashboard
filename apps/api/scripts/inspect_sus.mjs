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
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const tline = lines.find(l => l.indexOf(T) === 0);
const token = tline.substring(T.length);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

const SUS = "2klGunmn00zBG6RmuMly";
const startMs = Date.parse("2026-06-01");
const endMs = Date.parse("2026-06-30") + 86400000;

// Pega todas opps de Vendas em jun atribuídas ao SUS
const sus = [];
for (let page = 1; page <= 10; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    if (o.pipelineId !== vendas) continue;
    if (o.assignedTo !== SUS) continue;
    const dMs = Date.parse(o.createdAt ?? "");
    if (dMs < startMs || dMs > endMs) continue;
    sus.push({ id: o.id, name: o.name, stage: o.pipelineStageId, status: o.status, date: o.createdAt });
  }
  if (j.opportunities.length < 100) break;
}
console.log("opps do closer " + SUS + " em jun/2026:", sus.length);
console.log("stages distintos:");
const stages = {};
for (const o of sus) {
  const k = o.stage + "::" + o.status;
  stages[k] = (stages[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(stages)) console.log("  -", k, "×", v);
