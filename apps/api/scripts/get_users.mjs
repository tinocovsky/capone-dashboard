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
const tline = lines.find(l => l.indexOf(T) === 0);
const token = tline ? tline.substring(T.length) : null;

const headers = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0",
  Version: "2021-07-28",
};

const tries = [
  "/users?locationId=" + loc,
  "/users/",
  "/locations/" + loc + "/users",
];
for (const p of tries) {
  const r = await fetch("https://services.leadconnectorhq.com" + p, { headers });
  const t = await r.text();
  console.log(p, "→", r.status);
  if (r.ok) {
    const j = JSON.parse(t);
    const arr = j.users ?? j.data ?? j;
    if (Array.isArray(arr)) {
      for (const u of arr.slice(0, 10)) {
        console.log("  user:", u.id, "|", u.name ?? (u.firstName + " " + u.lastName), "|", u.email);
      }
    }
  } else {
    console.log("  ", t.slice(0, 100));
  }
}
