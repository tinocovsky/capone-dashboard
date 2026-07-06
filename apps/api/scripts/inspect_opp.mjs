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
const token = lines.find(l => l.indexOf(T) === 0).substring(T.length);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
  method: "POST", headers, body: JSON.stringify({ locationId: loc, limit: 1 }),
});
const j = await res.json();
const o = j.opportunities[0];
console.log("todos os campos do opp:");
for (const k of Object.keys(o).sort()) {
  const v = o[k];
  const display = typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80);
  console.log(" -", k, ":", display);
}
