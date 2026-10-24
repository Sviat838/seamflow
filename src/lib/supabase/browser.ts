import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Supabase client for Client Components (singleton per tab, session in cookies). Reads go
 * through RLS; writes belong on the server. Null when Supabase isn't configured.
 */
export function getBrowserSupabase(): SupabaseClient<Database> | null {
  // Literal process.env.NEXT_PUBLIC_* reads so Next inlines them into the client bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createBrowserClient<Database>(url, key);
}
