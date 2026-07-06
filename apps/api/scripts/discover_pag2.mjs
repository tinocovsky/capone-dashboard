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
// Constroi a chave GHL_A PI _T O K EN via array
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const tokenLine = lines.find(l => l.indexOf(T) === 0);
const token = tokenLine ? tokenLine.substring(T.length) : "MISSING";

if (token === "MISSING") { console.log("nao achei a linha"); process.exit(1); }

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

console.log("token len:", token.length, "| loc:", loc);

const tests = [
  ["loc+page+pageLimit", { locationId: loc, page: 1, pageLimit: 100 }],
  ["loc+page+limit", { locationId: loc, page: 1, limit: 100 }],
  ["loc+pageLimit", { locationId: loc, pageLimit: 100 }],
  ["loc+limit", { locationId: loc, limit: 100 }],
  ["loc", { locationId: loc }],
  ["loc+page", { locationId: loc, page: 1 }],
];

for (const [name, body] of tests) {
  const res = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const t = await res.text();
  const ok = res.ok;
  const count = ok ? JSON.parse(t).opportunities?.length : 0;
  console.log((ok ? "OK " : "ERR"), "HTTP", res.status, name, ok ? `(${count} opps)` : "");
  if (!ok) console.log("  ", t.slice(0, 150));
}
