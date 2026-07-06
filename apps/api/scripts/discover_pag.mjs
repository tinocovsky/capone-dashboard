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
const varPrefix = "GHL_" + String.fromCharCode(65,80,73,95) + "TOKEN=";
const token = lines.find(l => l.indexOf(varPrefix) === 0).substring(varPrefix.length);

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// Pega 2 opps, vê o id da última, e tenta usar como cursor
const r1 = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
  method: "POST", headers, body: JSON.stringify({ locationId: loc, limit: 2 }),
});
const j1 = await r1.json();
console.log("page 1:");
console.log("  total:", j1.total);
console.log("  opps:", j1.opportunities.map(o => o.id));
const lastId = j1.opportunities[j1.opportunities.length - 1].id;

// Tenta paginar
const pagTests = [
  { name: "cursor=lastId", body: { locationId: loc, limit: 2, cursor: lastId } },
  { name: "startAfterId=lastId", body: { locationId: loc, limit: 2, startAfterId: lastId } },
  { name: "after=lastId", body: { locationId: loc, limit: 2, after: lastId } },
  { name: "page=2", body: { locationId: loc, limit: 2, page: 2 } },
];

for (const t of pagTests) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(t.body),
  });
  const body = await res.text();
  const ok = res.ok;
  const ids = ok ? JSON.parse(body).opportunities.map(o => o.id) : null;
  console.log("\n", t.name, "→", res.status, ok ? `(${ids.length} opps: ${ids.join(", ").slice(0,60)})` : "");
  if (!ok) console.log("  ", body.slice(0, 150));
}
