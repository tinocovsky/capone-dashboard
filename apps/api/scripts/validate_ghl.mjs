import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const lines = env.split("\n");

function get(name) {
  const line = lines.find(l => l.indexOf(name + "=") === 0);
  if (!line) return null;
  return line.substring(name.length + 1);
}

const loc = get("GHL_LOCATION_ID");
const tokenLine = lines.find(l => l.startsWith("GHL_API") && l.indexOf("TOKEN=") > 0);
const token = tokenLine.substring(tokenLine.indexOf("=") + 1);
const pipe = get("GHL_PIPELINE_VENDAS");

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

console.log("token len:", token.length, "| starts pit-:", token.startsWith("pit-"));
console.log("location:", loc, "| pipeline vendas:", pipe);

const tests = [
  ["GET", "https://services.leadconnectorhq.com/users/me"],
  ["GET", "https://services.leadconnectorhq.com/locations/" + loc],
  ["POST", "https://services.leadconnectorhq.com/opportunities/search"],
];

for (const [method, url] of tests) {
  const init = { method, headers };
  if (method === "POST") {
    init.body = JSON.stringify({ locationId: loc, pipeline_id: pipe, startAfter: Date.parse("2026-06-01"), limit: 5 });
  }
  const res = await fetch(url, init);
  const body = await res.text();
  console.log("\n", method, url.replace("https://services.leadconnectorhq.com", ""), "→", res.status);
  console.log("  ", body.slice(0, 300));
}
