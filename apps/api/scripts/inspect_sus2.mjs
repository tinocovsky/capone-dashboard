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
const SUS = "2klGunmn00zBG6RmuMly";
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const tline = lines.find(l => l.indexOf(T) === 0);
const token = tline.substring(T.length);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// SEM filtro de data — só assignedTo
const sus = [];
for (let page = 1; page <= 10; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    if (o.pipelineId !== vendas) continue;
    if (o.assignedTo !== SUS) continue;
    sus.push({ id: o.id, name: o.name?.slice(0, 30), stage: o.pipelineStageId, status: o.status, date: o.createdAt?.slice(0, 10) });
  }
  if (j.opportunities.length < 100) break;
}
console.log("total opps (sem filtro data):", sus.length);
console.log("por mês:");
const byMonth = {};
for (const o of sus) {
  const m = o.date?.slice(0, 7);
  byMonth[m] = (byMonth[m] ?? 0) + 1;
}
for (const [m, c] of Object.entries(byMonth).sort()) console.log(" ", m, ":", c);
console.log("\nexemplo:");
for (const o of sus.slice(0, 3)) console.log(" ", o);
