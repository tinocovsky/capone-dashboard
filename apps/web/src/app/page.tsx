import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import Dashboard from "./dashboard";

export default async function Home() {
  const sb = await getSupabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");
  return <Dashboard user={{ id: data.user.id, email: data.user.email ?? "" }} />;
}
