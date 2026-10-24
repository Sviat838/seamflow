import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

export type AdminClient = SupabaseClient<Database>;

let cached: AdminClient | null | undefined;

/**
 * Secret-key client for trusted server code. Bypasses RLS, so callers must do their own
 * ownership checks. Returns null when Supabase isn't configured, so callers can degrade
 * gracefully instead of failing the core classify flow.
 */
export function getAdminClient(): AdminClient | null {
  if (cached !== undefined) return cached;
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = serverEnv();
  cached =
    url && key
      ? createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;
  return cached;
}

/** Private bucket holding uploaded scan images. */
export const SCANS_BUCKET = "scans";
