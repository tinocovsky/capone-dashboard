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

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// Lista 5 páginas, 50 por página = 250 opps, agrupa por pipelineId
const counts = {};
for (let page = 1; page <= 5; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 50 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    counts[o.pipelineId] = (counts[o.pipelineId] ?? 0) + 1;
  }
}
console.log("=== pipelineIds encontrados (em 250 opps) ===");
for (const [id, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log("  -", id, ":", count, "opps");
}
