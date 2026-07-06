import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiEnv = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const lines = apiEnv.split("\n");
function get(name) {
  const line = lines.find((l) => l.indexOf(name + "=") === 0);
  return line ? line.substring(name.length + 1) : null;
}
const sr = get("SUPABASE_SERVICE_ROLE_KEY");
const url = get("SUPABASE_URL");

const sb = createClient(url, sr, { auth: { persistSession: false } });
const { error } = await sb
  .from("dashboard_cache")
  .delete()
  .eq("period_start", "2026-06-01")
  .eq("period_end", "2026-06-30");
console.log("cache cleared:", error ? "ERR " + error.message : "OK");
