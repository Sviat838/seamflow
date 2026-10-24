// Pure row -> DTO mapping for companies. No server-only imports.
import type { Database } from "@/lib/supabase/database.types";
import type { CertifiedProduct, CompanyRole, LeaderboardEntry, ViewerCompany } from "@/lib/types";

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type LeaderboardRow = Database["public"]["Functions"]["get_company_leaderboard"]["Returns"][number];

/** Columns toViewerCompany reads; used by every companies select. */
export const COMPANY_COLUMNS = "id, name, slug, plan, is_listed";
export type CompanyRecord = Pick<CompanyRow, "id" | "name" | "slug" | "plan" | "is_listed">;

/** profiles joined to companies through profiles.company_id: one query per viewer. */
export const PROFILE_COLUMNS = `job_title, company_role, companies(${COMPANY_COLUMNS})`;
export interface ProfileRecord {
  job_title: string | null;
  company_role: string | null;
  companies: CompanyRecord | null;
}

export interface ViewerProfile {
  jobTitle: string | null;
  company: ViewerCompany | null;
}

export function toCompanyRole(value: string | null): CompanyRole {
  // Least privilege if the column is ever empty: owner-only actions stay locked.
  return value === "owner" ? "owner" : "member";
}

export function toViewerCompany(row: CompanyRecord, role: CompanyRole): ViewerCompany {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan === "business" ? "business" : "free",
    role,
    isListed: row.is_listed,
  };
}

/** A missing profile row (accounts older than the profiles trigger) reads as "no company yet". */
export function toViewerProfile(row: ProfileRecord | null): ViewerProfile {
  return {
    jobTitle: row?.job_title ?? null,
    company: row?.companies ? toViewerCompany(row.companies, toCompanyRole(row.company_role)) : null,
  };
}

function toIsoString(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}

// PostgREST sends bigint/numeric as JSON numbers today; coerce anyway so a string can't leak through.
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function clamp(value: unknown, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/** RPC rows arrive ranked; `index` is the row's position in that order. */
export function toLeaderboardEntry(row: LeaderboardRow, index: number): LeaderboardEntry {
  return {
    rank: index + 1,
    name: row.name,
    slug: row.slug,
    score: Math.round(clamp(row.score, 0, 100) * 10) / 10,
    ratedHotDogs: toCount(row.rated_hot_dogs),
    certifiedHotDogs: toCount(row.certified_hot_dogs),
    totalScans: toCount(row.total_scans),
    hotDogShare: clamp(row.hot_dog_share, 0, 1),
    lastActivity: toIsoString(row.last_activity),
  };
}

/** Columns for a company's public product list. Never case numbers, people or images. */
export const CERTIFIED_PRODUCT_COLUMNS = "number, code, product_name, sku, created_at, scans!inner(rating, rating_note)";
export interface CertifiedProductRecord {
  number: string;
  code: string;
  product_name: string | null;
  sku: string | null;
  created_at: string;
  scans: { rating: number | null; rating_note: string | null } | null;
}

export function toCertifiedProduct(row: CertifiedProductRecord): CertifiedProduct {
  return {
    certificateNumber: row.number,
    code: row.code,
    productName: row.product_name,
    sku: row.sku,
    rating: row.scans?.rating ?? null,
    ratingNote: row.scans?.rating_note ?? null,
    issuedAt: toIsoString(row.created_at),
  };
}
