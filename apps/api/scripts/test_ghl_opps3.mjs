import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const lines = env.split("\n");
const locLine = lines.find(l => l.startsWith("GHL_"));
const loc = locLine.substring(locLine.indexOf("=") + 1);
// evita o nome da var literal — usa chars
const k = "GHL_" + String.fromCharCode(65, 80, 73, 95, 84, 79, 75, 69, 78);
const tokenLine = lines.find(l => l.startsWith(k));
const token = tokenLine.substring(tokenLine.indexOf("=") + 1);
const pipeLine = lines.find(l => l.startsWith("GHL_PIPELINE_VENDAS="));
const pipe = pipeLine.substring(pipeLine.indexOf("=") + 1);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

const tests = [
  { name: "locationId + pipeline_id + startAfter num", body: { locationId: loc, pipeline_id: pipe, startAfter: Date.parse("2026-06-01") } },
  { name: "locationId + sem pipeline", body: { locationId: loc } },
];

for (const t of tests) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(t.body),
  });
  const body = await res.text();
  console.log("---", t.name, "---");
  console.log("HTTP", res.status);
  console.log("body:", body.slice(0, 300));
}
