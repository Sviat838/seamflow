import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { getViewerContext } from "@/lib/auth/viewer";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { OnboardingInput, OnboardingResult, Viewer, ViewerCompany } from "@/lib/types";
import { COMPANY_COLUMNS, toViewerCompany, type CompanyRecord } from "./mappers";
import { readViewerProfile } from "./profile";
import { invalidateLeaderboard } from "./queries";
import { slugify } from "./slug";
import { parseListingFlag, parseOnboardingInput } from "./validation";

const CONFLICT_MESSAGE = "This company name is already registered. Please choose another.";

const unavailable = (cause?: unknown) =>
  new AppError("INTERNAL", "Company registration is unavailable right now. Please try again later.", {
    cause,
    retryable: true,
  });

interface Membership {
  company: CompanyRecord;
  /** True only when this call inserted the company, so a lost race may delete it again. */
  inserted: boolean;
}

/**
 * First-sign-in company step (docs/APP.md, Companies): one account = one company.
 * Creates a new company with the user as `owner`. A name (case-insensitive) or slug already taken
 * by another account is CONFLICT; there is no email-domain matching or auto-join.
 * Then links the profile (creating it for older accounts) and moves the user's unattributed scans
 * to the company. Idempotent once onboarded, and safe against concurrent registrations.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const { companyName, jobTitle } = parseOnboardingInput(input);
  const { viewer } = await getViewerContext();
  if (!viewer.userId) throw new AppError("UNAUTHORIZED", "Sign in to register your company.");
  const userId = viewer.userId;
  const admin = getAdminClient();
  if (!admin) throw unavailable();

  // Read strictly rather than trusting the viewer, which treats a failed read as "no company".
  const current = await readProfileOrThrow(admin, userId);
  if (current.company) {
    await attributeScans(admin, userId, current.company);
    return existingMembership(current.company);
  }

  const membership = await createCompany(admin, { userId, name: companyName });
  const company = toViewerCompany(membership.company, "owner");

  if (!(await linkProfile(admin, { userId, viewer, company, jobTitle }))) {
    // A concurrent request linked this user first; its result stands.
    const winner = await readProfileOrThrow(admin, userId);
    if (!winner.company) throw unavailable(new Error("profile link lost without a company"));
    // The winner may be our own double submit that adopted the company we inserted.
    if (membership.inserted && winner.company.id !== company.id) await deleteOrphanCompany(admin, company.id);
    return existingMembership(winner.company);
  }

  const attributed = await attributeScans(admin, userId, company);
  log.info("companies.onboarded", { userId, companyId: company.id, kind: "created", attributed });
  return { kind: "created", company };
}

/** Shows or hides the viewer's company on the public leaderboard. Owner only. */
export async function setCompanyListing(isListed: boolean): Promise<ViewerCompany> {
  const listed = parseListingFlag(isListed);
  const { viewer } = await getViewerContext();
  if (!viewer.userId) throw new AppError("UNAUTHORIZED", "Sign in to manage your company.");
  const company = viewer.company;
  if (!company) throw new AppError("FORBIDDEN", "Register your company first.");
  if (company.role !== "owner") {
    throw new AppError("FORBIDDEN", "Only the company owner can change the public listing.");
  }
  const admin = getAdminClient();
  if (!admin) throw unavailable();

  const { data, error } = await admin
    .from("companies")
    .update({ is_listed: listed })
    .eq("id", company.id)
    .select(COMPANY_COLUMNS)
    .single();
  if (error) {
    throw new AppError("INTERNAL", "We couldn't update the listing. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
  invalidateLeaderboard();
  log.info("companies.listing_changed", { companyId: company.id, isListed: listed });
  return toViewerCompany(data, "owner");
}

function existingMembership(company: ViewerCompany): OnboardingResult {
  return { kind: "created", company };
}

async function readProfileOrThrow(admin: AdminClient, userId: string) {
  try {
    return await readViewerProfile(admin, userId);
  } catch (error) {
    throw unavailable(error);
  }
}

async function createCompany(
  admin: AdminClient,
  { userId, name }: { userId: string; name: string },
): Promise<Membership> {
  const { data: created, error } = await admin
    .from("companies")
    .insert({ name, slug: slugify(name), created_by: userId })
    .select(COMPANY_COLUMNS)
    .single();
  if (!error) return { company: created, inserted: true };

  switch (violatedConstraint(error)) {
    case "companies_name_key":
    case "companies_slug_key": {
      // The user's own double submit isn't a conflict.
      const own = await findOwnCompanyByName(admin, userId, name);
      if (own) return { company: own, inserted: false };
      throw new AppError("CONFLICT", CONFLICT_MESSAGE, { cause: error });
    }
    default:
      throw unavailable(error);
  }
}

// PostgREST reports unique violations as 23505 with the constraint (or unique index) name in the message.
function violatedConstraint(error: PostgrestError): string | null {
  if (error.code !== "23505") return null;
  return /unique constraint "([^"]+)"/.exec(error.message)?.[1] ?? null;
}

/** The user's own double submit isn't a conflict: the same name, created by them moments ago. */
async function findOwnCompanyByName(admin: AdminClient, userId: string, name: string): Promise<CompanyRecord | null> {
  const { data, error } = await admin
    .from("companies")
    .select(`${COMPANY_COLUMNS}, created_by`)
    .eq("created_by", userId);
  if (error) throw unavailable(error);
  const key = name.toLowerCase();
  return data.find((company) => company.name.toLowerCase() === key) ?? null;
}

/**
 * Links the profile to the company unless it already has one. Older accounts may predate the
 * profiles trigger, so the row is created first without touching an existing one.
 * Returns false when a concurrent request linked a company first.
 */
async function linkProfile(
  admin: AdminClient,
  { userId, viewer, company, jobTitle }: { userId: string; viewer: Viewer; company: ViewerCompany; jobTitle: string | null },
): Promise<boolean> {
  const { error: ensureError } = await admin
    .from("profiles")
    .upsert(
      { id: userId, display_name: viewer.displayName, avatar_url: viewer.avatarUrl },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (ensureError) throw unavailable(ensureError);

  const { data, error } = await admin
    .from("profiles")
    .update({ company_id: company.id, company_role: company.role, job_title: jobTitle })
    .eq("id", userId)
    .is("company_id", null)
    .select("id");
  if (error) throw unavailable(error);
  return data.length > 0;
}

/**
 * Best effort: drops a company this call created but couldn't link, so it doesn't hold the name,
 * and slug with no owner. Skipped if anyone linked to it meanwhile.
 */
async function deleteOrphanCompany(admin: AdminClient, companyId: string): Promise<void> {
  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (countError || count !== 0) {
    if (countError) log.warn("companies.orphan_check_failed", { companyId, error: countError });
    return;
  }
  const { error } = await admin.from("companies").delete().eq("id", companyId);
  if (error) log.warn("companies.orphan_delete_failed", { companyId, error });
}

/**
 * Moves the user's scans that predate the company (or were claimed before it was linked) to it.
 * Best effort: onboarding has already succeeded, so a failure is logged, not thrown.
 */
async function attributeScans(admin: AdminClient, userId: string, company: ViewerCompany): Promise<number> {
  const { data, error } = await admin
    .from("scans")
    .update({ company_id: company.id })
    .eq("user_id", userId)
    .is("company_id", null)
    .select("id");
  if (error) {
    log.warn("companies.attribute_scans_failed", { userId, companyId: company.id, error });
    return 0;
  }
  // New scans can move a listed company on the leaderboard.
  if (data.length > 0 && company.isListed) invalidateLeaderboard();
  return data.length;
}
