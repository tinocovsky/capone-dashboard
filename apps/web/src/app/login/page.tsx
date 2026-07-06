import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const sb = await getSupabaseServer();
  const { data } = await sb.auth.getUser();
  if (data.user) redirect("/");
  return (
    <div className="login">
      <h1>Dashboard Capone</h1>
      <p className="sub">Acesse com email + senha ou solicite um magic link.</p>
      <LoginForm />
    </div>
  );
}
