import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Client acting as the signed-in owner (RLS applies). */
export async function db(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(url(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}

/** Service-role client: bypasses RLS. Only for the public agreement page and the cron job. */
export function adminDb(): SupabaseClient {
  return createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Use at the top of every owner-only server action / page. */
export async function requireOwner(): Promise<SupabaseClient> {
  const client = await db();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: isAdmin } = await client.rpc("is_admin");
  if (!isAdmin) redirect("/login?error=not-owner");
  return client;
}

/** Fetch every row of a query, 1000 at a time (Supabase caps a single response). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
