import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiEnv = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const token = apiEnv.split("\n").filter(l => l.startsWith("GHL_API_TOKEN="))[0].split("=").slice(1).join("=");
const loc = apiEnv.split("\n").filter(l => l.startsWith("GHL_LOCATION_ID="))[0].split("=").slice(1).join("=");

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// Testa 4 variações
const tests = [
  { name: "snake_case location_id", body: { location_id: loc, pipeline_id: "x", startAfter: 0, limit: 5 } },
  { name: "camelCase locationId", body: { locationId: loc, pipelineId: "x", startAfter: 0, limit: 5 } },
  { name: "AMBOS (id + Id)", body: { location_id: loc, locationId: loc, pipeline_id: "x", pipelineId: "x", startAfter: 0, limit: 5 } },
  { name: "sem location", body: { pipeline_id: "x", startAfter: 0, limit: 5 } },
];

for (const t of tests) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(t.body),
  });
  const body = await res.text();
  console.log("---", t.name, "---");
  console.log("HTTP", res.status);
  console.log("body:", body.slice(0, 200));
}
