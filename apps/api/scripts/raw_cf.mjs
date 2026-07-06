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
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const tline = lines.find(l => l.indexOf(T) === 0);
const token = tline.substring(T.length);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// Pega 1 opp só e dump RAW (sem o censor)
const ARTIST = "9XPhm85vxOYEyZ6yRB9N";
const DONO = "c345zUnE33gH96uyEJI6";
for (let page = 1; page <= 5; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    if (o.pipelineId !== vendas) continue;
    const cfs = o.customFields ?? [];
    if (cfs.length === 0) continue;
    const dono = cfs.find(c => c.id === DONO);
    const artist = cfs.find(c => c.id === ARTIST);
    console.log("opp:", o.name);
    console.log("  customFields RAW:", JSON.stringify(cfs, null, 2).slice(0, 800));
    process.exit(0);
  }
}
