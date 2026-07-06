import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiEnv = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const token = apiEnv.split("\n").filter(l => l.startsWith("GHL_API_TOKEN="))[0].split("=").slice(1).join("=");
const loc = apiEnv.split("\n").filter(l => l.startsWith("GHL_LOCATION_ID="))[0].split("=").slice(1).join("=");
const pipeVendas = apiEnv.split("\n").filter(l => l.startsWith("GHL_PIPELINE_VENDAS="))[0].split("=").slice(1).join("=");

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

console.log("testando payloads camelCase corretos...");

const tests = [
  { name: "camelCase + pipelineId + getAllEnabled", body: { locationId: loc, pipelineId: pipeVendas, getAllTasks: false, limit: 5 } },
  { name: "camelCase + status", body: { locationId: loc, pipelineId: pipeVendas, status: "open", limit: 5 } },
  { name: "camelCase + startDate/endDate ISO", body: { locationId: loc, pipelineId: pipeVendas, startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-30T23:59:59.000Z", limit: 5 } },
  { name: "camelCase + page+pageLimit", body: { locationId: loc, pipelineId: pipeVendas, page: 1, pageLimit: 5 } },
];

for (const t of tests) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(t.body),
  });
  const body = await res.text();
  console.log("---", t.name, "---");
  console.log("HTTP", res.status);
  console.log("body:", body.slice(0, 250));
}
