/**
 * Cliente Supabase no browser. Anexa o access_token em todo request à API
 * (Authorization: Bearer ...) — o middleware/SSR já refresca o token.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

const _client = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export function supabaseBrowser() {
  return _client;
}

export async function authedFetch(input: string, init: RequestInit = {}, session?: Session | null) {
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}
