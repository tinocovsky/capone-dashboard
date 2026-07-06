import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webEnv = fs.readFileSync(path.join(__dirname, "..", "..", "web", ".env.local"), "utf8");
const lines = webEnv.split("\n");
function get(name) {
  const line = lines.find(l => l.indexOf(name + "=") === 0);
  return line ? line.substring(name.length + 1) : null;
}
const anon = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const url = get("NEXT_PUBLIC_SUPABASE_URL");

const loginRes = await fetch(url + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon },
  body: JSON.stringify({ email: "recep@caponeclub.com.br", password: "Capone2026!" }),
});
const login = await loginRes.json();

const r = await fetch("http://localhost:4000/api/reports?start=2026-06-01&end=2026-06-30&forceRefresh=1", {
  headers: { Authorization: "Bearer " + login.access_token },
});
const j = await r.json();

console.log("=== TOTALS (atual API vs HTML original) ===");
console.log(JSON.stringify(j.totals, null, 2));
console.log("\n=== pipelineBreakdown ===");
for (const p of j.pipelineBreakdown) console.log(JSON.stringify(p));
console.log("\n=== byArtist count ===", j.byArtist.length, "linhas");
for (const a of j.byArtist.slice(0, 5)) console.log(JSON.stringify(a));
console.log("\n=== byCloser count ===", j.byCloser.length, "linhas");
for (const c of j.byCloser) console.log(JSON.stringify(c));
console.log("\n=== byOrigin count ===", j.byOrigin.length, "linhas");
for (const o of j.byOrigin) console.log(JSON.stringify(o));
console.log("\n=== alerts ===");
for (const a of j.alerts) console.log(JSON.stringify(a));
