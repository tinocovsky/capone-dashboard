// Lista custom fields do contact pra descobrir:
// 1) nome do field n6C6NvvggHHmIK6dIo2W (provável CPF)
// 2) se tem algum endpoint que retorna telefone sem máscara
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

console.log("=== custom fields do contact ===");
const r1 = await fetch(`https://services.leadconnectorhq.com/locations/${loc}/customFields?model=contact`, { headers: HEADERS });
console.log("HTTP", r1.status);
const j1 = await r1.json();
const all = j1.customFields || [];
console.log("Total fields:", all.length);
for (const f of all) {
  if (/cpf|cnpj|doc|cpf|identidade|rg/i.test(f.name || f.fieldKey || "") ||
      (f.id || "").includes("n6C6NvvggHHmIK6dIo2W")) {
    console.log("  MATCH:", f.id, "|", f.name, "|", f.fieldKey, "|", f.dataType);
  }
}
// Dump rápido de todos os nomes
console.log("\nTodos os fields (apenas nome+id):");
for (const f of all) {
  console.log("  -", f.id, "|", f.name, "|", f.fieldKey);
}
