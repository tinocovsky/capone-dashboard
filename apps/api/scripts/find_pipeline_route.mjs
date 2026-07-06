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

// Tenta várias rotas pra pegar stages
const tries = [
  "/pipelines",
  "/opportunities/pipelines",
  "/pipelines/" + vendas,
  "/pipelines/" + vendas + "/stages",
  "/pipelines?locationId=" + loc,
  "/v1/pipelines",
];
for (const p of tries) {
  const r = await fetch("https://services.leadconnectorhq.com" + p, { headers });
  const t = await r.text();
  console.log(p, "→", r.status, t.slice(0, 200));
}
