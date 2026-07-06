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
const ARTIST = "9XPhm85vxOYEyZ6yRB9N";
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const token = lines.find(l => l.indexOf(T) === 0).substring(T.length);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

const startMs = Date.parse("2026-06-01");
const endMs = Date.parse("2026-06-30") + 86400000;

let withArtist = 0, withArtistField = 0, sampleFields = null;
let sampleArtist = null;
for (let page = 1; page <= 10; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  for (const o of j.opportunities ?? []) {
    if (o.pipelineId !== vendas) continue;
    const dMs = Date.parse(o.createdAt ?? "");
    if (dMs < startMs || dMs > endMs) continue;
    if (o.customFields && o.customFields.length > 0) withArtistField++;
    for (const cf of o.customFields ?? []) {
      if (cf.id === ARTIST) {
        withArtist++;
        if (!sampleArtist) sampleArtist = { opp: o.name, fieldValue: cf.value, fieldType: cf.fieldValueType, fieldKey: cf.fieldKey };
      }
      if (!sampleFields && cf.id === ARTIST) sampleFields = cf;
    }
  }
}
console.log("opps de jun/2026 em vendas com qualquer custom field:", withArtistField);
console.log("opps com custom field ARTIST:", withArtist);
console.log("\nsample do campo artista:");
console.log(JSON.stringify(sampleArtist, null, 2));
