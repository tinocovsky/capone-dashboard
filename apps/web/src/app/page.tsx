import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase-server";
import Dashboard from "./dashboard";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const sb = await getSupabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");

  // Links compartilhados carregam o período da URL (?start=...&end=...)
  const params = await searchParams;
  const initialStart = DATE_RE.test(params.start ?? "") ? params.start : undefined;
  const initialEnd = DATE_RE.test(params.end ?? "") ? params.end : undefined;

  return (
    <Dashboard
      user={{ id: data.user.id, email: data.user.email ?? "" }}
      initialStart={initialStart}
      initialEnd={initialEnd}
    />
  );
}
