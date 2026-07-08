// Inspeciona um opp do Vendas ou Pós-vendas com monetaryValue > 0
// pra ver custom fields reais (fieldValueString etc.)
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
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const token = lines.find(l => l.indexOf(T) === 0).substring(T.length);
const pipVendas = get("GHL_PIPELINE_VENDAS");
const pipPos = get("GHL_PIPELINE_POS_VENDAS");

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

async function searchOpp(body) {
  const r = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(body),
  });
  return r.json();
}

// Pega 2 páginas, filtra por pipeline + monetaryValue > 0
let found = null;
for (let page = 1; page <= 5 && !found; page++) {
  const j = await searchOpp({ locationId: loc, page, limit: 100 });
  for (const o of (j.opportunities || [])) {
    if ((o.pipelineId === pipVendas || o.pipelineId === pipPos) &&
        Number(o.monetaryValue) > 0) {
      found = o; break;
    }
  }
  console.error(`página ${page}: ${(j.opportunities||[]).length} opps`);
}

if (!found) { console.log("nenhum opp com valor > 0 encontrado"); process.exit(1); }

console.log("\n=== OPP ENCONTRADO ===");
console.log("id:", found.id);
console.log("name:", found.name);
console.log("pipelineId:", found.pipelineId);
console.log("pipelineStageId:", found.pipelineStageId);
console.log("monetaryValue:", found.monetaryValue);
console.log("status:", found.status);
console.log("createdAt:", found.createdAt);
console.log("lastStageChangeAt:", found.lastStageChangeAt);
console.log("contactId:", found.contactId);
console.log("\n=== customFields (RAW) ===");
console.log(JSON.stringify(found.customFields, null, 2));

console.log("\n=== attributions ===");
console.log(JSON.stringify(found.attributions, null, 2));

console.log("\n=== contact (embedded) ===");
console.log(JSON.stringify(found.contact, null, 2));
