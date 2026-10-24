import "server-only";
import { revalidateTag } from "next/cache";
import { recordAuditEvents } from "@/lib/audit/record";
import { getViewerContext } from "@/lib/auth/viewer";
import { LEADERBOARD_TAG } from "@/lib/companies/queries";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { loadAccessibleScan, viewerLabel } from "@/lib/scans/access";
import { isScanId } from "@/lib/scans/validation";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { CertificateSummary, PublicCertificate, ViewerCertificate } from "@/lib/types";
import { buildPublicCertificate, CERTIFICATE_COLUMNS, toCertificateSummary } from "./mappers";
import { SAMPLE_CERTIFICATE, SAMPLE_CERTIFICATE_CODE } from "./sample";
import { normalizeCertificateCode, parseCertificateProductPatch } from "./validation";

type CertificateUpdate = Database["public"]["Tables"]["certificates"]["Update"];

/** Issuer of every certificate, and the actor for its system events in the audit trail. */
export const CERTIFICATE_AUTHORITY = "HDX Classification Authority";
/** issued_to for anonymous visitors and users who haven't picked a company yet. */
export const INDIVIDUAL_SUBMITTER = "Individual submitter";

const UNIQUE_VIOLATION = "23505";
// DB caps (char_length, i.e. code points).
const ISSUED_TO_MAX = 120;
const REVOKED_REASON_MAX = 300;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

// The public record: certificate, the scan's verdict fields, and whether its company is listed.
const PUBLIC_SELECT = `${CERTIFICATE_COLUMNS}, scans(verdict, confidence, policy_clause, rating, rating_note, image_sha256, model, companies(slug, is_listed))`;

const clip = (text: string, max: number) => Array.from(text.replace(/\s+/g, " ").trim()).slice(0, max).join("");

/**
 * Issues the certificate for a persisted scan. Idempotent: if the scan already has one (a retry,
 * or a race), that one is returned and nothing is re-audited. Null without a database.
 *
 * Never throws: a verdict must not be lost because its certificate couldn't be issued. Failures
 * are logged and return null, and the case simply shows no certificate.
 */
export async function issueCertificate({
  scanId,
  issuedTo,
}: {
  scanId: string;
  issuedTo: string;
}): Promise<CertificateSummary | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  const name = clip(issuedTo, ISSUED_TO_MAX) || INDIVIDUAL_SUBMITTER;

  // The code is random (30^8 space), so a collision is possible but rare: one retry covers it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from("certificates")
      .insert({ scan_id: scanId, issued_to: name })
      .select(CERTIFICATE_COLUMNS)
      .single();
    if (data) {
      const certificate = toCertificateSummary(data);
      await recordAuditEvents(scanId, [
        {
          event: "certificate_issued",
          actor: CERTIFICATE_AUTHORITY,
          detail: `Certificate ${certificate.number} signed. QR code and public verification page issued.`,
        },
      ]);
      return certificate;
    }
    if (error?.code !== UNIQUE_VIOLATION) {
      log.error("certificates.issue_failed", { scanId, error: error?.message });
      return null;
    }

    const existing = await admin.from("certificates").select(CERTIFICATE_COLUMNS).eq("scan_id", scanId).maybeSingle();
    if (existing.data) return toCertificateSummary(existing.data);
    if (existing.error) {
      log.error("certificates.issue_failed", { scanId, error: existing.error.message });
      return null;
    }
    // Not this scan's certificate, so the generated code collided. Go again with a fresh one.
  }
  log.error("certificates.issue_failed", { scanId, error: "code collision after retry" });
  return null;
}

/**
 * The public record behind /v/{code} and the PDF, or null for malformed or unknown codes.
 * Accepts lowercase and a missing dash. The sample code returns SAMPLE_CERTIFICATE without a
 * database. `recordVerification` counts this view (the verify page; never the PDF).
 */
export async function getPublicCertificate(
  code: string,
  opts: { recordVerification?: boolean } = {},
): Promise<PublicCertificate | null> {
  const normalized = normalizeCertificateCode(code);
  if (!normalized) return null;
  if (normalized === SAMPLE_CERTIFICATE_CODE) return SAMPLE_CERTIFICATE;
  const admin = getAdminClient();
  if (!admin) return null;

  // The counter RPC returns the updated row, so counting and reading is one round trip.
  const { data: row, error } = opts.recordVerification
    ? await admin.rpc("record_certificate_verification", { p_code: normalized }).select(PUBLIC_SELECT).maybeSingle()
    : await admin.from("certificates").select(PUBLIC_SELECT).eq("code", normalized).maybeSingle();
  if (error) {
    throw new AppError("INTERNAL", "We couldn't check that certificate right now. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
  if (!row?.scans) return null;
  return buildPublicCertificate(row, row.scans, row.scans.companies);
}

/**
 * Sets or clears the product name and SKU printed on labels and the verify page. Owner or
 * same-company member (the scans access rule); `scanId` may also be a case number.
 */
export async function updateCertificateProduct(
  scanId: string,
  patch: { productName?: string | null; sku?: string | null },
): Promise<CertificateSummary> {
  // Re-validated here: server actions hand us whatever the client sent.
  const changes = parseCertificateProductPatch(patch);
  const { admin, row, ctx } = await loadAccessibleScan(scanId);
  const current = row.certificates;
  if (!current) throw new AppError("NOT_FOUND", "This case doesn't have a certificate yet.");

  const update: CertificateUpdate = {};
  if (changes.productName !== undefined) update.product_name = changes.productName;
  if (changes.sku !== undefined) update.sku = changes.sku;

  const { data, error } = await admin
    .from("certificates")
    .update(update)
    .eq("scan_id", row.id)
    .select(CERTIFICATE_COLUMNS)
    .maybeSingle();
  if (error) {
    throw new AppError("INTERNAL", "We couldn't save the product details. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
  // The scan (and its certificate) was deleted between the access check and the write.
  if (!data) throw new AppError("NOT_FOUND", "This case doesn't have a certificate yet.");

  const certificate = toCertificateSummary(data);
  if (certificate.productName !== current.product_name || certificate.sku !== current.sku) {
    const product = certificate.productName ? `"${certificate.productName}"` : "no product name";
    const sku = certificate.sku ? `SKU ${certificate.sku}` : "no SKU";
    await recordAuditEvents(row.id, [
      {
        event: "product_updated",
        actor: `${viewerLabel(ctx.viewer)} · Web console`,
        detail: `Certificate ${certificate.number} product details set: ${product}, ${sku}.`,
      },
    ]);
    // Company profiles list certified products under the leaderboard tag.
    revalidateTag(LEADERBOARD_TAG, "max");
  }
  return certificate;
}

/**
 * Revokes a scan's certificate, e.g. after the Hot Dog Review Board overturns its verdict.
 * A trusted server operation with no viewer check: never expose it directly to clients.
 * Idempotent: no certificate, or one already revoked, is a no-op (and audited only once).
 */
export async function revokeCertificate(scanId: string, reason: string): Promise<void> {
  if (!isScanId(scanId)) return;
  const admin = getAdminClient();
  if (!admin) return;
  const why = clip(reason, REVOKED_REASON_MAX) || "Verdict overturned on appeal.";

  const { data, error } = await admin
    .from("certificates")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: why })
    .eq("scan_id", scanId)
    .eq("status", "valid")
    .select("number")
    .maybeSingle();
  if (error) {
    throw new AppError("INTERNAL", "We couldn't revoke the certificate. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
  if (!data) return;
  await recordAuditEvents(scanId, [
    { event: "certificate_revoked", actor: CERTIFICATE_AUTHORITY, detail: `Certificate ${data.number} revoked. ${why}` },
  ]);
}

/**
 * Certificates for the workspace list, newest first: company members see every company
 * certificate plus their own from before onboarding; other users their own; visitors their
 * unclaimed ones. Same rule as listViewerScans.
 */
export async function listViewerCertificates(opts: { limit?: number } = {}): Promise<ViewerCertificate[]> {
  const requested = opts.limit !== undefined && Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : DEFAULT_LIST_LIMIT;
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, requested));
  // Read the viewer first, so callers are request-time whether or not there's a database.
  const { viewer, visitorId } = await getViewerContext();
  const admin = getAdminClient();
  if (!admin) return [];

  // From scans, so the access filter is the same one listViewerScans uses.
  let query = admin.from("scans").select(`case_number, verdict, rating, certificates!inner(${CERTIFICATE_COLUMNS})`);
  if (viewer.userId && viewer.company) {
    // Both uuids (verified JWT subject, DB id): safe to interpolate.
    query = query.or(`company_id.eq.${viewer.company.id},user_id.eq.${viewer.userId}`);
  } else if (viewer.userId) {
    query = query.eq("user_id", viewer.userId);
  } else {
    query = query.eq("visitor_id", visitorId).is("user_id", null);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) {
    throw new AppError("INTERNAL", "We couldn't load certificates right now. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
  return data.flatMap((row) =>
    row.certificates
      ? [
          {
            ...toCertificateSummary(row.certificates),
            caseNumber: row.case_number,
            verdict: row.verdict,
            rating: row.verdict === "hot_dog" ? row.rating : null,
          },
        ]
      : [],
  );
}
