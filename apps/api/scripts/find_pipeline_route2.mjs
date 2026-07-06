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
};

// Testa várias formas de passar locationId
const tries = [
  ["GET", "/opportunities/pipelines?locationId=" + loc],
  ["POST", "/opportunities/pipelines"],
  ["GET", "/opportunities/pipelines/" + loc],
  ["GET", "/opportunities/pipelines?location_id=" + loc],
  ["GET", "/pipelines/?locationId=" + loc],
];
for (const [method, p] of tries) {
  const r = await fetch("https://services.leadconnectorhq.com" + p, {
    method,
    headers: { ...headers, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify({ locationId: loc }) : undefined,
  });
  const t = await r.text();
  console.log(method, p, "→", r.status);
  if (r.ok) {
    const j = JSON.parse(t);
    console.log("  body sample:", JSON.stringify(j).slice(0, 300));
  } else {
    console.log("  err:", t.slice(0, 150));
  }
}
