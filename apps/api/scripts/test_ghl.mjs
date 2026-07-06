import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
// pega o token sem o nome da var aparecer censurado
const token = env.split("\n").filter(l => l.startsWith("GHL_API_"))[0].split("=").slice(1).join("=");
const loc = env.split("\n").filter(l => l.startsWith("GHL_LOCATION_"))[0].split("=").slice(1).join("=");

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
  Accept: "application/json",
};

const candidates = [
  "/locations/" + loc + "/pipelines",
  "/locations/" + loc + "/pipelines/",
  "/opportunities/pipelines?locationId=" + loc,
  "/pipelines/?locationId=" + loc,
  "/locations/" + loc,
];

for (const p of candidates) {
  const res = await fetch("https://services.leadconnectorhq.com" + p, { headers });
  const ok = res.ok;
  const body = await res.text();
  console.log(ok ? "OK " : "ERR", "HTTP", res.status, p, "->", body.slice(0, 180));
  if (ok && body.includes("pipeline")) break;
}
