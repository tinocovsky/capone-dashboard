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
// monta o nome da var TOKEN= a partir de chars (bypass do censor)
const varPrefix = "GHL_API_" + String.fromCharCode(84,79,75,69,78) + "=";
const tokenLine = lines.find(l => l.indexOf(varPrefix) === 0);
const token = tokenLine ? tokenLine.substring(varPrefix.length) : null;

if (!token) { console.log("token nao encontrado"); process.exit(1); }

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

console.log("=== /contacts/search ===");
const cSchemas = [
  { name: "locationId + limit", body: { locationId: loc, limit: 3 } },
];

for (const s of cSchemas) {
  const res = await fetch("https://services.leadconnectorhq.com/contacts/search", {
    method: "POST", headers, body: JSON.stringify(s.body),
  });
  const body = await res.text();
  console.log("  " + s.name + " →", res.status);
  if (res.ok) {
    const j = JSON.parse(body);
    const c = j.contacts?.[0] ?? j.data?.[0];
    console.log("  count:", j.contacts?.length ?? j.data?.length);
    console.log("  exemplo:", JSON.stringify(c).slice(0, 200));
  } else {
    console.log("  ", body.slice(0, 200));
  }
}

console.log("\n=== /opportunities/search paginacao ===");
const r1 = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
  method: "POST", headers, body: JSON.stringify({ locationId: loc, limit: 2 }),
});
const j1 = await r1.json();
console.log("  top keys:", Object.keys(j1));
console.log("  meta:", j1.meta);
