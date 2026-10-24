// Pure row -> DTO mapping for certificates. No server-only imports: the scans module embeds
// certificates(*) in its reads and maps them with toCertificateSummary.
import { defaultClauseFor } from "@/lib/policy";
import type { Database } from "@/lib/supabase/database.types";
import type { CertificateStatus, CertificateSummary, PublicCertificate } from "@/lib/types";

export type CertificateRow = Database["public"]["Tables"]["certificates"]["Row"];
type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];

/** What toCertificateSummary reads. A full CertificateRow (certificates(*)) satisfies it. */
export type CertificateSummaryRow = Pick<
  CertificateRow,
  | "number"
  | "code"
  | "status"
  | "issued_to"
  | "product_name"
  | "sku"
  | "created_at"
  | "revoked_at"
  | "revoked_reason"
  | "verification_count"
>;

/** Scan columns the public record shows. Never the image, owner, or case number. */
export type PublicScanFields = Pick<
  ScanRow,
  "verdict" | "confidence" | "policy_clause" | "rating" | "rating_note" | "image_sha256" | "model"
>;

export type PublicCompanyFields = Pick<CompanyRow, "slug" | "is_listed">;

/** The columns toCertificateSummary reads, for selects that don't need the whole row. */
export const CERTIFICATE_COLUMNS =
  "number, code, status, issued_to, product_name, sku, created_at, revoked_at, revoked_reason, verification_count";

function toIsoString(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

function toStatus(status: string, revokedAt: string | null): CertificateStatus {
  // The DB check keeps these consistent; trust revoked_at too, so a stray value can't show "valid".
  return status === "revoked" || revokedAt !== null ? "revoked" : "valid";
}

export function toCertificateSummary(row: CertificateSummaryRow): CertificateSummary {
  return {
    number: row.number,
    code: row.code,
    status: toStatus(row.status, row.revoked_at),
    issuedTo: row.issued_to,
    productName: row.product_name,
    sku: row.sku,
    issuedAt: toIsoString(row.created_at),
    revokedAt: row.revoked_at ? toIsoString(row.revoked_at) : null,
    revokedReason: row.revoked_reason,
    verificationCount: Math.max(0, Math.floor(row.verification_count) || 0),
  };
}

/** "9f2c…e41a": enough of the SHA-256 to compare against a file, short enough to print. */
export function shortFingerprint(sha256: string | null | undefined): string | null {
  const hex = sha256?.trim().toLowerCase();
  if (!hex || !/^[0-9a-f]{16,}$/.test(hex)) return null;
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

/** The public record for /v/{code} and the PDF. companySlug only when the company is listed. */
export function buildPublicCertificate(
  cert: CertificateSummaryRow,
  scan: PublicScanFields,
  company: PublicCompanyFields | null,
): PublicCertificate {
  const isHotDog = scan.verdict === "hot_dog";
  return {
    ...toCertificateSummary(cert),
    verdict: scan.verdict,
    confidence: clamp01(scan.confidence),
    policyClause: scan.policy_clause ?? defaultClauseFor(scan.verdict),
    // Ratings belong to hot dogs only, even if an old row says otherwise.
    rating: isHotDog ? scan.rating : null,
    ratingNote: isHotDog && scan.rating !== null ? scan.rating_note : null,
    fingerprint: shortFingerprint(scan.image_sha256),
    companySlug: company?.is_listed ? company.slug : null,
    model: scan.model || null,
    isSample: false,
  };
}
