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

// Verifica: as opps retornadas são ordenadas por data DESC?
// Pega 3 páginas e vê a primeira e última dateAdded
const dates = [];
for (let page = 1; page <= 3; page++) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify({ locationId: loc, page, limit: 100 }),
  });
  const j = await res.json();
  if (!j.opportunities) break;
  for (const o of j.opportunities) dates.push({ page, id: o.id, date: o.dateAdded });
}
console.log("primeiras 5 opps:");
for (const d of dates.slice(0, 5)) console.log(" ", d);
console.log("\núltimas 5 opps:");
for (const d of dates.slice(-5)) console.log(" ", d);
