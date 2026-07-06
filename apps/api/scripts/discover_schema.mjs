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
const tokenLine = lines.find(l => l.startsWith("GHL_API") && l.indexOf("TOKEN=") > 0);
const token = tokenLine.substring(tokenLine.indexOf("=") + 1);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// Tenta vários schemas pra /opportunities/search
const schemas = [
  { name: "so locationId + page", body: { locationId: loc, page: 1, pageSize: 5 } },
  { name: "locationId + limit", body: { locationId: loc, limit: 5 } },
  { name: "locationId + q", body: { locationId: loc, q: "" } },
  { name: "locationId sem mais nada", body: { locationId: loc } },
];

console.log("=== schemas aceitos em /opportunities/search ===");
for (const s of schemas) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(s.body),
  });
  const body = await res.text();
  console.log("\n", s.name, "→", res.status);
  if (res.ok) {
    const j = JSON.parse(body);
    console.log("  count:", j.opportunities?.length ?? j.data?.length, "| total:", j.meta?.total);
    if (j.opportunities?.[0] || j.data?.[0]) {
      const o = j.opportunities?.[0] ?? j.data[0];
      console.log("  exemplo:", o.id, o.name ?? o.pipelineStage);
    }
  } else {
    console.log("  ", body.slice(0, 200));
  }
}
