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

console.log("=== Pipelines no location ===");
const pipeRes = await fetch("https://services.leadconnectorhq.com/locations/" + loc + "/pipelines", { headers });
const pipeBody = await pipeRes.text();
console.log("HTTP", pipeRes.status);
if (pipeRes.ok) {
  const j = JSON.parse(pipeBody);
  const arr = j.pipelines ?? j.data ?? [];
  for (const p of arr) {
    console.log("  -", p.id, "|", p.name);
  }
} else {
  console.log("body:", pipeBody.slice(0, 300));
}

console.log("\n=== Sample de 3 opps (pra ver pipelineId) ===");
const oppRes = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
  method: "POST", headers, body: JSON.stringify({ locationId: loc, limit: 3 }),
});
const oppBody = await oppRes.text();
const j = JSON.parse(oppBody);
if (j.opportunities) {
  for (const o of j.opportunities.slice(0, 3)) {
    console.log("  -", o.id, "| pipelineId:", o.pipelineId, "| pipelineStageId:", o.pipelineStageId, "| name:", o.name?.slice(0, 40));
  }
}
