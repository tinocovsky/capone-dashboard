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
console.log("HTTP", r.status);
const t = await r.text();
console.log("body sample:", t.slice(0, 1500));
