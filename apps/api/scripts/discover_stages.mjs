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
  "Content-Type": "application/json",
};

// Tenta várias rotas pra listar stages
const candidates = [
  "/pipelines/" + vendas,
  "/pipelines/" + vendas + "/stages",
  "/locations/" + loc + "/pipelines/" + vendas + "/stages",
  "/locations/" + loc + "/pipelines",
];
for (const p of candidates) {
  const res = await fetch("https://services.leadconnectorhq.com" + p, { headers });
  const t = await res.text();
  console.log("---", p, "→", res.status);
  if (res.ok) {
    const j = JSON.parse(t);
    console.log("  keys:", Object.keys(j));
    if (j.stages) {
      for (const s of j.stages) console.log("  stage:", s.id, "|", s.name, "| type:", s.statusType ?? s.type);
    } else if (j.pipeline?.stages) {
      for (const s of j.pipeline.stages) console.log("  stage:", s.id, "|", s.name);
    } else {
      console.log("  body:", t.slice(0, 300));
    }
  } else {
    console.log("  ", t.slice(0, 150));
  }
}
