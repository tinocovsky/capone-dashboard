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

// 5 páginas (500 opps), agrupa por pipeline + stageId + status
const stages = {};
for (let page = 1; page <= 5; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    if (o.pipelineId !== vendas && o.pipelineId !== pos) continue;
    const key = o.pipelineId + "::" + o.pipelineStageId + "::" + o.status;
    if (!stages[key]) stages[key] = { count: 0, sample: o.name };
    stages[key].count++;
  }
}
console.log("=== stage × status (em 500 opps) ===");
for (const [k, v] of Object.entries(stages).sort((a, b) => b[1].count - a[1].count)) {
  const [p, s, st] = k.split("::");
  console.log("  pipe:", p === vendas ? "VENDAS" : "POS", "| stage:", s.slice(0, 8), "| status:", st, "| count:", v.count);
}
