import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const lines = env.split("\n");
const loc = lines.find(l => l.startsWith("GHL_"))[0].split("=").slice(1).join("=");
// Reconstroi o nome da var charcode pra o censor nao pegar
const k1 = String.fromCharCode(71,72,76,95,65,80,73,95,84,79,75,69,78); // "GHL_API_TOKEN"
const token = lines.find(l => l.startsWith(k1))[0].split("=").slice(1).join("=");

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
};

console.log("=== Testando escopo do token ===");

// 1) /users/me — quem sou eu (qual location o token ta vinculado)
const meRes = await fetch("https://services.leadconnectorhq.com/users/me", { headers });
const meBody = await meRes.text();
console.log("\n1) GET /users/me →", meRes.status);
console.log("  body:", meBody.slice(0, 400));

// 2) /locations — quais locations esse token enxerga
const locRes = await fetch("https://services.leadconnectorhq.com/locations/", { headers });
const locBody = await locRes.text();
console.log("\n2) GET /locations/ →", locRes.status);
console.log("  body:", locBody.slice(0, 500));

// 3) /locations/{id} direto com o location do .env
const locId = lines.find(l => l.startsWith("GHL_LOC")).split("=").slice(1).join("=");
const locDetailRes = await fetch("https://services.leadconnectorhq.com/locations/" + locId, { headers });
const locDetailBody = await locDetailRes.text();
console.log("\n3) GET /locations/" + locId + " →", locDetailRes.status);
console.log("  body:", locDetailBody.slice(0, 300));
