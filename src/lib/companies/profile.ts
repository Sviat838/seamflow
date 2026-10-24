import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { PROFILE_COLUMNS, toViewerProfile, type ViewerProfile } from "./mappers";

/** The user's job title and company (with role) in one query. Throws the PostgREST error on failure. */
export async function readViewerProfile(admin: AdminClient, userId: string): Promise<ViewerProfile> {
  const { data, error } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return toViewerProfile(data);
}

/** Just the user's company id (null when not onboarded). Throws the PostgREST error on failure. */
export async function readCompanyId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.company_id ?? null;
}
