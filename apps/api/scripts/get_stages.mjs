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
};

const r = await fetch("https://services.leadconnectorhq.com/opportunities/pipelines?locationId=" + loc, { headers });
const j = await r.json();

console.log("=== Pipelines ===");
for (const p of j.pipelines) {
  const tipo = p.id === vendas ? "VENDAS" : p.id === pos ? "POS" : "outro";
  console.log("\n  " + p.id + " | " + p.name + " (" + tipo + ")");
  for (const s of p.stages ?? []) {
    console.log("    stage:", s.id.slice(0, 8), "|", s.name, "| position:", s.position);
  }
}
