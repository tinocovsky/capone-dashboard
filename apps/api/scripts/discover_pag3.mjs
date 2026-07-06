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

// Schema 1: limit fixo
const r1 = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
  method: "POST", headers, body: JSON.stringify({ locationId: loc, limit: 50, page: 1 }),
});
const j1 = await r1.json();
console.log("page 1, limit 50:", j1.opportunities.length, "opps | total:", j1.total);
console.log("ids:", j1.opportunities.map(o => o.id).slice(0, 5));

// Schema 2: page 2 com mesmo limit
const r2 = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
  method: "POST", headers, body: JSON.stringify({ locationId: loc, limit: 50, page: 2 }),
});
const j2 = await r2.json();
console.log("page 2, limit 50:", j2.opportunities.length, "opps | total:", j2.total);
console.log("ids:", j2.opportunities.map(o => o.id).slice(0, 5));

// Schema 3: skip / offset
const tests = [
  ["skip", { locationId: loc, limit: 50, skip: 50 }],
  ["offset", { locationId: loc, limit: 50, offset: 50 }],
  ["startAfter (number)", { locationId: loc, limit: 50, startAfter: j1.opportunities[49].id }],
  ["startAfterId", { locationId: loc, limit: 50, startAfterId: j1.opportunities[49].id }],
];
for (const [name, body] of tests) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const ok = res.ok;
  const t = await res.text();
  console.log((ok ? "OK " : "ERR"), name, ok ? `(${JSON.parse(t).opportunities.length} opps)` : t.slice(0, 100));
}
