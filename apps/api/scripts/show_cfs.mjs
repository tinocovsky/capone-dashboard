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

const ARTIST = "9XPhm85vxOYEyZ6yRB9N";
const DONO = "c345zUnE33gH96uyEJI6";

// Pega 3 opps de Vendas de jun com custom fields preenchidos
let count = 0;
for (let page = 1; page <= 5; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    if (o.pipelineId !== vendas) continue;
    const cfs = o.customFields ?? [];
    if (cfs.length === 0) continue;
    console.log("--- opp " + o.id + " (" + o.name + ") ---");
    for (const cf of cfs) {
      const isArtist = cf.id === ARTIST;
      const isDono = cf.id === DONO;
      const tag = isArtist ? "  ← ATUAL 'ARTIST'" : isDono ? "  ← NOVO 'DONO DO NEGÓCIO'" : "";
      console.log("  " + cf.id + " = " + JSON.stringify(cf.value ?? cf.fieldValue) + tag);
    }
    count++;
    if (count >= 3) break;
  }
  if (count >= 3) break;
}
