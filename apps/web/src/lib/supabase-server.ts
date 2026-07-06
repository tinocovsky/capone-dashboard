/**
 * Cliente Supabase no server (RSC, Route Handlers, Server Actions).
 * Next.js 15: cookies() é async.
 */
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function getSupabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: async () => {
          const all = await store.getAll();
          return all.map((c: { name: string; value: string }) => ({ name: c.name, value: c.value }));
        },
        setAll: async (toSet: CookieToSet[]) => {
          try {
            toSet.forEach(({ name, value, options }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (store as any).set(name, value, options);
            });
          } catch {
            // chamado em RSC — sem efeito, sem erro
          }
        },
      },
    },
  );
}
