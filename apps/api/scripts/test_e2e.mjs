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

// 1) Login
const loginRes = await fetch(url + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon },
  body: JSON.stringify({ email: "recep@caponeclub.com.br", password: "Capone2026!" }),
});
const loginData = await loginRes.json();
if (!loginRes.ok) { console.log("login falhou:", loginData); process.exit(1); }
console.log("login OK, user.id:", loginData.user.id.slice(0, 8) + "...");

// 2) GET /api/reports
const reportsRes = await fetch("http://localhost:4000/api/reports?start=2026-06-01&end=2026-06-30", {
  headers: {
    Authorization: "Bearer " + loginData.access_token,
    "Content-Type": "application/json",
  },
});
const body = await reportsRes.text();
console.log("\n/api/reports →", reportsRes.status);
if (reportsRes.ok) {
  const j = JSON.parse(body);
  console.log("  period:", j.period);
  console.log("  totals:", JSON.stringify(j.totals, null, 2));
  console.log("  cacheHit:", j.cacheHit);
  console.log("  alerts count:", j.alerts?.length);
  console.log("  contactsByDay count:", j.contactsByDay?.length);
  console.log("  byArtist count:", j.byArtist?.length);
  console.log("  pipelineBreakdown count:", j.pipelineBreakdown?.length);
} else {
  console.log("  body:", body.slice(0, 500));
}
