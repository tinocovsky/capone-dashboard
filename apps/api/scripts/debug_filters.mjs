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

console.log("pipelines configurados:");
console.log("  VENDAS:", vendas);
console.log("  POS:", pos);

// Pega 5 páginas de 100 = 500 opps, filtra por dateAdded dentro de jun/2026
const startMs = Date.parse("2026-06-01");
const endMs = Date.parse("2026-06-30") + 86400000;
const matches = { vendas: 0, pos: 0, outros: 0 };
const sample = [];
for (let page = 1; page <= 5; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  if (!j.opportunities) break;
  for (const o of j.opportunities) {
    const dMs = Date.parse(o.dateAdded);
    if (dMs < startMs || dMs > endMs) continue;
    if (o.pipelineId === vendas) matches.vendas++;
    else if (o.pipelineId === pos) matches.pos++;
    else { matches.outros++; if (sample.length < 5) sample.push({id: o.id, pipe: o.pipelineId, date: o.dateAdded}); }
  }
  if (j.opportunities.length < 100) break;
}
console.log("\nopps de jun/2026:");
console.log("  matches vendas:", matches.vendas);
console.log("  matches pos:", matches.pos);
console.log("  outros (não bateu com nenhum dos 2):", matches.outros);
if (sample.length) {
  console.log("\nsample de outros:");
  for (const s of sample) console.log(" -", s);
}
