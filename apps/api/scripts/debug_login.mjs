import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webEnv = fs.readFileSync(path.join(__dirname, "..", "..", "web", ".env.local"), "utf8");
const lines = webEnv.split("\n");
const anon = lines.filter(l => l.startsWith("NEXT_PUBLIC_SUPABASE_ANON_"))[0].split("=").slice(1).join("=");
const url = lines.filter(l => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="))[0].split("=").slice(1).join("=");

console.log("testando login no Supabase...");
console.log("  url:", url);
console.log("  anon len:", anon.length, "| starts eyJ:", anon.startsWith("eyJ"));

const loginRes = await fetch(url + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon },
  body: JSON.stringify({ email: "recep@caponeclub.com.br", password: "Capone2026!" }),
});
const loginData = await loginRes.json();
console.log("\n--- Login direto Supabase ---");
console.log("HTTP", loginRes.status);
if (loginRes.ok) {
  console.log("  user.id:", loginData.user?.id?.slice(0,8) + "...");
  console.log("  email:", loginData.user?.email);
  console.log("  role:", loginData.user?.role);
  console.log("  access_token presente:", !!loginData.access_token);
} else {
  console.log("  error:", JSON.stringify(loginData).slice(0, 400));
}

console.log("\n--- Magic link ---");
const magicRes = await fetch(url + "/auth/v1/otp", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon },
  body: JSON.stringify({ email: "recep@caponeclub.com.br" }),
});
const magicData = await magicRes.json();
console.log("HTTP", magicRes.status, magicRes.ok ? "(enviou)" : "");
if (!magicRes.ok) console.log("  error:", JSON.stringify(magicData).slice(0, 400));

const apiEnv = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const serviceRole = apiEnv.split("\n").filter(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))[0].split("=").slice(1).join("=");
const userRes = await fetch(url + "/auth/v1/admin/users?email=recep@caponeclub.com.br", {
  headers: { apikey: serviceRole, Authorization: "Bearer " + serviceRole },
});
const userData = await userRes.json();
console.log("\n--- User lookup (admin) ---");
console.log("HTTP", userRes.status);
const u = (userData.users ?? [])[0];
if (u) {
  console.log("  id:", u.id?.slice(0,8) + "...");
  console.log("  email:", u.email);
  console.log("  email_confirmed_at:", u.email_confirmed_at);
  console.log("  banned_until:", u.banned_until);
  console.log("  role:", u.role);
  console.log("  providers:", u.app_metadata?.providers);
} else {
  console.log("  user NÃO encontrado no admin lookup");
}
