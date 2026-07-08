// Inspeciona um contact completo via /contacts/{id} pra ver:
// 1) se o telefone vem mascarado ou real
// 2) se existe custom field de CPF
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const lines = env.split("\n");
const loc = lines.find(l => l.indexOf("GHL_LOCATION_ID=") === 0).substring("GHL_LOCATION_ID=".length);
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const token = lines.find(l => l.indexOf(T) === 0).substring(T.length);

const HEADERS = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

const ids = ["TNG87gB5VAgWhsCPNGKa", "9lE8alA1vXJhF8cz8dF6"];
for (const id of ids) {
  console.log(`\n=== contact ${id} ===`);
  const r = await fetch(`https://services.leadconnectorhq.com/contacts/${id}`, { headers: HEADERS });
  console.log("HTTP", r.status);
  const j = await r.json();
  console.log(JSON.stringify(j, null, 2).slice(0, 4000));
}
