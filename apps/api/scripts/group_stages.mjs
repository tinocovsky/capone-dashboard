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

// Pega 2 páginas de 100 opps, agrupa por pipelineStageId e vê o status
const stageInfo = {};
for (let page = 1; page <= 2; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    const key = o.pipelineId + "::" + o.pipelineStageId;
    if (!stageInfo[key]) stageInfo[key] = { count: 0, status: o.status, sample: o };
    stageInfo[key].count++;
  }
}
console.log("=== Stages distintos ===");
for (const [key, info] of Object.entries(stageInfo).sort((a, b) => b[1].count - a[1].count)) {
  const o = info.sample;
  console.log(" -", key, "| count:", info.count, "| status:", info.status, "| name:", o.name?.slice(0, 30));
}
