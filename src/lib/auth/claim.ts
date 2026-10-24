import "server-only";
import { readCompanyId } from "@/lib/companies/profile";
import { invalidateLeaderboard } from "@/lib/companies/queries";
import { log } from "@/lib/log";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { isUuid } from "./visitor";

/**
 * Moves a visitor's anonymous scans to a user after sign-in, and to the user's company when they
 * already have one. Returns how many were claimed. `companyId` skips the profile lookup when the
 * caller already knows it (null: no company); leave it undefined to look it up here.
 * Best effort: 0 without Supabase or on any failure (logged), so sign-in never breaks over it.
 */
export async function claimVisitorScans(
  userId: string,
  visitorId: string,
  companyId?: string | null,
): Promise<number> {
  // Malformed ids would only produce a Postgres cast error; skip the round trip.
  if (!isUuid(userId) || !isUuid(visitorId)) return 0;
  const admin = getAdminClient();
  if (!admin) return 0;

  try {
    const company = companyId === undefined ? await lookupCompanyId(admin, userId) : companyId;
    const { data, error } = await admin
      .from("scans")
      .update(company ? { user_id: userId, company_id: company } : { user_id: userId })
      .eq("visitor_id", visitorId)
      .is("user_id", null)
      .select("id");
    if (error) {
      log.error("auth.claim_scans_failed", { userId, error });
      return 0;
    }
    if (data.length > 0) {
      log.info("auth.claimed_scans", { userId, count: data.length, companyId: company });
      // Company scans count toward the leaderboard.
      if (company) invalidateLeaderboard();
    }
    return data.length;
  } catch (error) {
    log.error("auth.claim_scans_failed", { userId, error });
    return 0;
  }
}

// Without the company the scans are still claimed; onboarding attributes them later.
async function lookupCompanyId(admin: AdminClient, userId: string): Promise<string | null> {
  try {
    return await readCompanyId(admin, userId);
  } catch (error) {
    log.warn("auth.claim_company_lookup_failed", { userId, error });
    return null;
  }
}
