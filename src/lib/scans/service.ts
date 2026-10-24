import "server-only";
import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { classifyImage } from "@/lib/ai";
import { assertValidImage } from "@/lib/ai/image";
import { recordAuditEvents } from "@/lib/audit/record";
import { getViewerContext } from "@/lib/auth/viewer";
import { INDIVIDUAL_SUBMITTER, issueCertificate } from "@/lib/certificates/service";
import { invalidateLeaderboard } from "@/lib/companies/queries";
import { AppError } from "@/lib/errors";
import { regionFromHeaders } from "@/lib/geo";
import { getClientIp, hashIp } from "@/lib/http/request";
import { log } from "@/lib/log";
import { enforceScanRateLimit } from "@/lib/rate-limit";
import type { Database } from "@/lib/supabase/database.types";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import {
  MAX_IMAGE_BYTES,
  type AcceptedImageType,
  type CertificateSummary,
  type Classification,
  type Scan,
  type UpdateScanRequest,
} from "@/lib/types";
import { assertWithinQuota } from "@/lib/usage";
import { loadAccessibleScan, scopeToAccess, viewerLabel } from "./access";
import { intakeAuditEvents, type IntakeAuditInput } from "./audit";
import {
  SCAN_COLUMNS,
  toReusableClassification,
  toScan,
  toScanDetails,
  toUnsavedScan,
  toVerdictFields,
  truncate,
} from "./mappers";
import { STATS_TAG, toViewerScan } from "./queries";
import { discardScanImage, removeScanImage, scanImagePath, signScanImage, uploadScanImage } from "./storage";
import { imageTooLarge, parseUpdateScanRequest, sanitizeFileName } from "./validation";

type ScanUpdate = Database["public"]["Tables"]["scans"]["Update"];

export interface CreateScanInput {
  file: File | Blob;
  /** Original file name (File.name); sanitized before it's stored. */
  fileName?: string | null;
  isPublic?: boolean;
  requestId: string;
  headers: Headers; // for IP hashing and the coarse region
}

interface VerdictResult {
  classification: Classification;
  model: string;
  latencyMs: number | null;
  cached: boolean;
}

// The DB caps summary at 500 chars; a longer one must not cost the user their saved scan.
const MAX_SUMMARY_LENGTH = 500;

/**
 * validate → rate limit → quota → reuse by sha256 or classify (image upload runs in parallel) →
 * persist → audit trail + certificate → DTO.
 */
export async function createScan({
  file,
  fileName: rawFileName,
  isPublic = false,
  requestId,
  headers,
}: CreateScanInput): Promise<Scan> {
  const ctx = await getViewerContext();
  const { viewer, visitorId } = ctx;
  const ipHash = hashIp(getClientIp(headers));

  // Size first, so an oversized upload is rejected before it's buffered.
  if (file.size > MAX_IMAGE_BYTES) throw imageTooLarge();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = assertValidImage(bytes);

  // After validation so junk uploads don't burn quota; before reuse so cached verdicts still count.
  await enforceScanRateLimit({ userId: viewer.userId, visitorId, ipHash });
  await assertWithinQuota(ctx);

  const scanId = crypto.randomUUID();
  const fileName = sanitizeFileName(rawFileName);
  const region = regionFromHeaders(headers);
  const unsaved = (result: VerdictResult) =>
    toUnsavedScan({
      id: scanId,
      ...result,
      createdAt: new Date().toISOString(),
      fileName,
      region,
      imageBytes: bytes.byteLength,
      submittedBy: viewer.displayName,
    });

  const admin = getAdminClient();
  if (!admin) {
    const result = await classify(bytes, mimeType);
    logVerdict(requestId, scanId, result, false);
    return unsaved(result);
  }

  const imagePath = scanImagePath(viewer.userId, scanId, mimeType);
  // Kick off the upload now so it overlaps the reuse lookup and the model call.
  const upload = uploadScanImage(admin, imagePath, bytes, mimeType, requestId);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  let result: VerdictResult;
  try {
    result = (await findPriorVerdict(admin, sha256, requestId)) ?? (await classify(bytes, mimeType));
  } catch (error) {
    after(() => discardScanImage(admin, upload, imagePath, requestId));
    throw error;
  }

  const uploaded = await upload;
  const { classification, model, latencyMs, cached } = result;
  const verdict = toVerdictFields(classification.verdict, classification);
  const { data: row, error } = await admin
    .from("scans")
    .insert({
      id: scanId,
      user_id: viewer.userId,
      visitor_id: viewer.userId ? null : visitorId,
      company_id: viewer.company?.id ?? null,
      verdict: classification.verdict,
      confidence: classification.confidence,
      summary: truncate(classification.summary, MAX_SUMMARY_LENGTH),
      details: toScanDetails(classification, cached),
      policy_clause: verdict.policyClause,
      rating: verdict.rating,
      rating_note: verdict.ratingNote,
      region,
      file_name: fileName,
      image_path: uploaded ? imagePath : null,
      image_mime: mimeType,
      image_bytes: bytes.byteLength,
      image_sha256: sha256,
      model,
      latency_ms: latencyMs,
      is_public: isPublic,
      ip_hash: ipHash,
      request_id: requestId,
    })
    .select(SCAN_COLUMNS)
    .single();

  if (error || !row) {
    // The user still gets their verdict; it just isn't saved.
    log.error("scans.insert_failed", { requestId, scanId, error: error?.message });
    after(() => discardScanImage(admin, upload, imagePath, requestId));
    logVerdict(requestId, scanId, result, false);
    return unsaved(result);
  }

  logVerdict(requestId, scanId, result, true);
  revalidateTag(STATS_TAG, "max");

  const [imageUrl, certificate] = await Promise.all([
    signScanImage(admin, row.image_path),
    // Intake events first, so certificate_issued (appended by issueCertificate) follows them in the chain.
    recordIntake(scanId, requestId, {
      submitter: viewerLabel(viewer),
      fileName,
      mimeType,
      imageBytes: bytes.byteLength,
      sha256,
      imageStored: uploaded,
      verdict: classification.verdict,
      confidence: classification.confidence,
      policyClause: verdict.policyClause,
      model,
      cached,
    }).then(() => issueCertificateFor(scanId, viewer.company?.name ?? INDIVIDUAL_SUBMITTER, requestId)),
  ]);
  // Company scans move the public leaderboard (ratings and certified counts), once both exist.
  if (row.company_id) invalidateLeaderboard();

  return toScan(row, { isOwner: true, imageUrl, submittedBy: viewer.displayName, certificate });
}

/** Owner or company member. Sets or clears feedback (with feedback_at) and/or the public flag. */
export async function updateScan(id: string, patch: UpdateScanRequest): Promise<Scan> {
  // Re-validated here because server actions hand us whatever the client sent.
  const changes = parseUpdateScanRequest(patch);
  const found = await loadAccessibleScan(id);
  const { admin, row, ctx, access } = found;

  const update: ScanUpdate = {};
  if (changes.feedback !== undefined) {
    update.feedback = changes.feedback;
    update.feedback_at = changes.feedback ? new Date().toISOString() : null;
  }
  if (changes.isPublic !== undefined) update.is_public = changes.isPublic;

  const { data: updated, error } = await scopeToAccess(admin.from("scans").update(update).eq("id", row.id), row, found)
    .select(SCAN_COLUMNS)
    .maybeSingle();
  if (error) {
    throw new AppError("INTERNAL", "We couldn't save that change. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
  // Deleted, claimed or moved between the access check and the write.
  if (!updated) throw new AppError("NOT_FOUND", "We couldn't find that scan.");

  if (changes.feedback !== undefined) revalidateTag(STATS_TAG, "max");
  return toViewerScan(admin, updated, ctx.viewer, access);
}

/**
 * Owner or company member. Removes the stored image first, so a storage failure leaves the row for
 * a retry. The certificate and audit trail go with the row (ON DELETE CASCADE).
 */
export async function deleteScan(id: string): Promise<void> {
  const found = await loadAccessibleScan(id);
  const { admin, row } = found;

  if (row.image_path) await removeScanImage(admin, row.image_path);
  const { error } = await scopeToAccess(admin.from("scans").delete().eq("id", row.id), row, found);
  if (error) {
    throw new AppError("INTERNAL", "We couldn't delete that scan. Please try again.", {
      cause: error,
      retryable: true,
    });
  }

  revalidateTag(STATS_TAG, "max");
  if (row.company_id) invalidateLeaderboard();
}

/** One line per verdict: model, latency and reuse rate are what to watch in production. */
function logVerdict(requestId: string, scanId: string, result: VerdictResult, persisted: boolean): void {
  const { classification, model, latencyMs, cached } = result;
  log.info("scans.verdict", {
    requestId,
    scanId,
    verdict: classification.verdict,
    confidence: classification.confidence,
    policyClause: classification.policyClause,
    rating: classification.rating,
    flags: classification.flags,
    model,
    latencyMs,
    cached,
    persisted,
  });
}

async function classify(bytes: Uint8Array, mimeType: AcceptedImageType): Promise<VerdictResult> {
  const { classification, model, latencyMs } = await classifyImage({ bytes, mimeType });
  return { classification, model, latencyMs, cached: false };
}

/**
 * Most recent verdict for identical bytes, rating and clause included. Skips verdicts under review
 * or overturned on appeal. Lookup problems just mean we ask the model.
 */
async function findPriorVerdict(
  admin: AdminClient,
  sha256: string,
  requestId: string,
): Promise<VerdictResult | null> {
  const { data: prior, error } = await admin
    .from("scans")
    .select("verdict, confidence, summary, details, policy_clause, rating, rating_note, model")
    .eq("image_sha256", sha256)
    .or("review_status.is.null,review_status.eq.upheld")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    log.warn("scans.reuse_lookup_failed", { requestId, error: error.message });
    return null;
  }
  const classification = prior && toReusableClassification(prior);
  // latencyMs stays null: no model call happened for this scan.
  return classification ? { classification, model: prior.model, latencyMs: null, cached: true } : null;
}

/** Never rejects: a missing audit row must not cost the user their verdict. */
async function recordIntake(scanId: string, requestId: string, input: IntakeAuditInput): Promise<void> {
  try {
    await recordAuditEvents(scanId, intakeAuditEvents(input));
  } catch (error) {
    log.warn("scans.audit_failed", { requestId, scanId, error });
  }
}

/** Never rejects: the scan is saved either way, just without a certificate. */
async function issueCertificateFor(
  scanId: string,
  issuedTo: string,
  requestId: string,
): Promise<CertificateSummary | null> {
  try {
    return await issueCertificate({ scanId, issuedTo });
  } catch (error) {
    log.warn("scans.certificate_failed", { requestId, scanId, error });
    return null;
  }
}
