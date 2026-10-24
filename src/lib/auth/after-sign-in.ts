import "server-only";
import { readCompanyId } from "@/lib/companies/profile";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import { claimVisitorScans } from "./claim";

/** The user's company id; null when they have none, undefined when it couldn't be read. */
async function findCompanyId(userId: string, requestId: string): Promise<string | null | undefined> {
  const admin = getAdminClient();
  if (!admin) return null;
  try {
    return await readCompanyId(admin, userId);
  } catch (error) {
    log.warn("auth.company_lookup_failed", { requestId, userId, error });
    return undefined;
  }
}

/**
 * Shared by every sign-in method once the session exists: claims the visitor's anonymous scans
 * (into the company when there is one) and says whether the user has a company. Unknown (lookup
 * failed) counts as no company, so they go to onboarding, which forwards users who have one.
 */
export async function finishSignIn({
  userId,
  visitorId,
  requestId,
  method,
}: {
  userId: string;
  visitorId: string | null;
  requestId: string;
  method: "google" | "password";
}): Promise<{ hasCompany: boolean }> {
  const companyId = await findCompanyId(userId, requestId);
  if (visitorId) await claimVisitorScans(userId, visitorId, companyId);
  const hasCompany = Boolean(companyId);
  log.info("auth.signed_in", { requestId, userId, hasCompany, method });
  return { hasCompany };
}
