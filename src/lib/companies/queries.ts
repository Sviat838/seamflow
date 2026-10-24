import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import type { CompanyProfile, LeaderboardEntry } from "@/lib/types";
import { CERTIFIED_PRODUCT_COLUMNS, toCertifiedProduct, toLeaderboardEntry } from "./mappers";
import { isCompanySlug } from "./slug";

/** Cache tag for public company data (leaderboard and profiles). */
export const LEADERBOARD_TAG = "leaderboard";

const DEFAULT_LEADERBOARD_SIZE = 50;
/** get_company_leaderboard() caps p_limit at 100. */
const MAX_LEADERBOARD_SIZE = 100;
const MAX_PROFILE_PRODUCTS = 50;
// A hung database must not hang the leaderboard render (or the build that prerenders it).
const LEADERBOARD_TIMEOUT_MS = 3000;

/**
 * Expires the leaderboard and company profiles immediately (the next read waits for fresh data).
 * Works in Server Actions and Route Handlers; call it after writes that change rankings or listings.
 */
export function invalidateLeaderboard(): void {
  revalidateTag(LEADERBOARD_TAG, { expire: 0 });
}

/** Listed companies with at least one HOT DOG, best smoothed HDX Rating first. Cached and public. */
export async function getLeaderboard(limit: number = DEFAULT_LEADERBOARD_SIZE): Promise<LeaderboardEntry[]> {
  "use cache";
  cacheTag(LEADERBOARD_TAG);
  // One profile for every outcome, like getGlobalStats: a shorter one on failure would turn this
  // into a request-time hole and a DB blip during `next build` would fail the page.
  cacheLife("minutes");

  const admin = getAdminClient();
  if (!admin) return [];

  const size = Number.isFinite(limit)
    ? Math.min(MAX_LEADERBOARD_SIZE, Math.max(1, Math.trunc(limit)))
    : DEFAULT_LEADERBOARD_SIZE;
  const { data, error } = await admin
    .rpc("get_company_leaderboard", { p_limit: size })
    .abortSignal(AbortSignal.timeout(LEADERBOARD_TIMEOUT_MS));
  if (error) {
    log.error("companies.leaderboard_failed", { error: error.message });
    return [];
  }
  return data.map(toLeaderboardEntry);
}

/**
 * A listed company's public profile: its leaderboard entry (null until its first HOT DOG, or
 * outside the top 100) and up to 50 certified products, newest first. Null for unknown or unlisted
 * slugs. Cached and public; the slug is matched case-insensitively.
 */
export async function getCompanyProfile(slug: string): Promise<CompanyProfile | null> {
  "use cache";
  cacheTag(LEADERBOARD_TAG);
  cacheLife("minutes");

  const normalized = typeof slug === "string" ? slug.toLowerCase() : slug;
  if (!isCompanySlug(normalized)) return null;
  const admin = getAdminClient();
  if (!admin) return null;

  const { data: company, error } = await admin
    .from("companies")
    .select("id, name, slug, created_at")
    .eq("slug", normalized)
    .eq("is_listed", true)
    .maybeSingle();
  if (error) throw readFailed(error);
  if (!company) return null;

  const [leaderboard, products] = await Promise.all([
    getLeaderboard(MAX_LEADERBOARD_SIZE),
    admin
      .from("certificates")
      .select(CERTIFIED_PRODUCT_COLUMNS)
      .eq("status", "valid")
      .eq("scans.company_id", company.id)
      .eq("scans.verdict", "hot_dog")
      .order("created_at", { ascending: false })
      .limit(MAX_PROFILE_PRODUCTS),
  ]);
  if (products.error) throw readFailed(products.error);

  return {
    name: company.name,
    slug: company.slug,
    memberSince: new Date(company.created_at).toISOString(),
    entry: leaderboard.find((entry) => entry.slug === company.slug) ?? null,
    products: products.data.map(toCertifiedProduct),
  };
}

function readFailed(cause: unknown): AppError {
  return new AppError("INTERNAL", "We couldn't load this company right now. Please try again.", {
    cause,
    retryable: true,
  });
}
