import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cookie-bound, user-scoped client (RLS applies) for Server Components, Server Actions and
 * Route Handlers. Create one per request; never cache it or call it inside 'use cache'.
 * Returns null when Supabase isn't configured.
 */
export async function createServerSupabase(): Promise<SupabaseClient<Database> | null> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = serverEnv();
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't write cookies. src/proxy.ts refreshes the session before
          // rendering, so the only thing lost here is a redundant write.
        }
      },
    },
  });
}
