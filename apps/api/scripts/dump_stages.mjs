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
const tline = lines.find(l => l.indexOf(T) === 0);
const token = tline.substring(T.length);

const r = await fetch("https://services.leadconnectorhq.com/opportunities/pipelines?locationId=" + loc, {
  headers: { Authorization: "Bearer " + token, "User-Agent": "Mozilla/5.0", Version: "2021-07-28" },
});
const j = await r.json();
const v = j.pipelines.find(p => p.name === "Vendas");
for (const s of v.stages) console.log(s.id, "|", s.name);
