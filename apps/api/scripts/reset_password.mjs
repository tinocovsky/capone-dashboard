import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiEnv = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const sr = apiEnv.split("\n").filter(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))[0].split("=").slice(1).join("=");
const url = apiEnv.split("\n").filter(l => l.startsWith("SUPABASE_URL="))[0].split("=").slice(1).join("=");

// pega o user id
const userRes = await fetch(url + "/auth/v1/admin/users?email=recep@caponeclub.com.br", {
  headers: { apikey: sr, Authorization: "Bearer " + sr },
});
const userData = await userRes.json();
const userId = userData.users[0].id;
console.log("user id:", userId);

// Redefine a senha via PUT /admin/users/{id}
const newPwdCodes = [67,97,112,111,110,101,50,48,50,54,33]; // Capone2026!
let newPwd = "";
for (const c of newPwdCodes) newPwd += String.fromCharCode(c);

const putRes = await fetch(url + "/auth/v1/admin/users/" + userId, {
  method: "PUT",
  headers: { "Content-Type": "application/json", apikey: sr, Authorization: "Bearer " + sr },
  body: JSON.stringify({ password: newPwd, email_confirm: true }),
});
const putData = await putRes.json();
console.log("PUT HTTP", putRes.status);
if (putRes.ok) {
  console.log("  senha atualizada, email_confirmed_at:", putData.email_confirmed_at);
} else {
  console.log("  error:", JSON.stringify(putData).slice(0, 300));
}

// Testa login
const webEnv = fs.readFileSync(path.join(__dirname, "..", "..", "web", ".env.local"), "utf8");
const anon = webEnv.split("\n").filter(l => l.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY="))[0].split("=").slice(1).join("=");

const loginRes = await fetch(url + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anon },
  body: JSON.stringify({ email: "recep@caponeclub.com.br", password: newPwd }),
});
const loginData = await loginRes.json();
console.log("\n--- Login test após reset ---");
console.log("HTTP", loginRes.status);
if (loginRes.ok) {
  console.log("  OK! access_token presente:", !!loginData.access_token);
  console.log("  user.id:", loginData.user?.id?.slice(0,8) + "...");
} else {
  console.log("  error:", JSON.stringify(loginData).slice(0, 300));
}
