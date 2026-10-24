import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { reviewAppeal } from "@/lib/ai";
import { sniffImageType } from "@/lib/ai/image";
import { recordAuditEvents } from "@/lib/audit/record";
import type { ViewerContext } from "@/lib/auth/viewer";
import { revokeCertificate } from "@/lib/certificates/service";
import { invalidateLeaderboard } from "@/lib/companies/queries";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { createRpcConsumer } from "@/lib/rate-limit";
import { findAccessibleScan, loadAccessibleScan, viewerLabel } from "@/lib/scans/access";
import { UPLOAD_CHANNEL } from "@/lib/scans/audit";
import { truncate } from "@/lib/scans/mappers";
import { STATS_TAG } from "@/lib/scans/queries";
import { getAdminClient, SCANS_BUCKET, type AdminClient } from "@/lib/supabase/admin";
import type { AcceptedImageType, AppealView } from "@/lib/types";
import {
  APPEAL_COLUMNS,
  classificationFromScan,
  decisionDetail,
  isStalePending,
  overturnedScanUpdate,
  retainedImagePath,
  toAppealView,
} from "./mappers";
import { parseAppealReason } from "./validation";

export const REVIEW_BOARD = "Hot Dog Review Board";
export const OVERTURN_REVOCATION_REASON = "Verdict overturned on appeal by the Hot Dog Review Board.";

const APPEALS_PER_DAY = 5;
const DAY_SECONDS = 86_400;
// Matches STALE_PENDING_MS: one decision attempt per appeal per two-minute window.
const REVIEW_LEASE_SECONDS = 120;
const MAX_RULING_LENGTH = 1000; // DB check on appeals.ruling
const REASON_EXCERPT_LENGTH = 400;
const UNIQUE_VIOLATION = "23505";

const REVIEW_SCAN_COLUMNS =
  "verdict, confidence, summary, details, policy_clause, rating, rating_note, image_path, image_deleted_at, created_at";

/**
 * Files the one appeal a scan may have ("Request human review"), owner only, and schedules the Hot
 * Dog Review Board's decision after the response. Throws INVALID_REQUEST, NOT_FOUND / FORBIDDEN,
 * RATE_LIMITED, CONFLICT ("already under review") or INTERNAL.
 */
export async function fileAppeal(scanId: string, reason: string): Promise<AppealView> {
  const cleanReason = parseAppealReason(reason);
  // APP.md: the submitter appeals, not the rest of their company.
  const { admin, row, ctx } = await loadAccessibleScan(scanId, { require: "owner" });

  await enforceAppealLimit(admin, ctx);

  const { viewer, visitorId } = ctx;
  const { data: appeal, error } = await admin
    .from("appeals")
    .insert({
      scan_id: row.id,
      user_id: viewer.userId,
      visitor_id: viewer.userId ? null : visitorId,
      reason: cleanReason,
    })
    .select(APPEAL_COLUMNS)
    .single();
  if (error?.code === UNIQUE_VIOLATION) throw new AppError("CONFLICT", "This case is already under review.");
  if (error || !appeal) {
    throw new AppError("INTERNAL", "We couldn't file your appeal. Please try again.", {
      cause: error,
      retryable: true,
    });
  }

  const { error: statusError } = await admin.from("scans").update({ review_status: "pending" }).eq("id", row.id);
  // The appeal itself is filed; a stale review_status only affects the case badge until the decision.
  if (statusError) log.warn("appeals.review_status_failed", { scanId: row.id, error: statusError.message });
  // Audit details cap at 500 characters; keep the quote intact rather than cut mid-sentence.
  const excerpt = truncate(cleanReason, REASON_EXCERPT_LENGTH);
  await recordAuditEvents(row.id, [
    {
      event: "appeal_filed",
      actor: `${viewerLabel(viewer)} · ${UPLOAD_CHANNEL}`,
      detail: `Human review requested. Reason: "${excerpt}${excerpt === cleanReason ? "" : "…"}"`,
    },
  ]);

  log.info("appeals.filed", { scanId: row.id, appealId: appeal.id });
  after(() => decideAppeal(appeal.id));
  return toAppealView(appeal);
}

/**
 * The scan's appeal, for its owner or company; null when there is none or the viewer can't see the
 * case. A pending appeal older than two minutes gets its decision re-scheduled (the first attempt
 * failed or was cut off); the review lease keeps concurrent page views from piling up reviews.
 */
export async function getAppealForScan(scanId: string): Promise<AppealView | null> {
  const found = await findAccessibleScan(scanId);
  if (!found) return null;
  const { data: appeal, error } = await found.admin
    .from("appeals")
    .select(APPEAL_COLUMNS)
    .eq("scan_id", found.row.id)
    .maybeSingle();
  if (error) {
    throw new AppError("INTERNAL", "We couldn't load the appeal. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
  if (!appeal) return null;
  if (isStalePending(appeal, Date.now())) after(() => decideAppeal(appeal.id));
  return toAppealView(appeal);
}

/**
 * The Hot Dog Review Board's decision on one pending appeal. Runs inside after(), so it never
 * throws: a failed review leaves the appeal pending (logged) and getAppealForScan retries it later.
 * Exported for tests.
 */
export async function decideAppeal(appealId: string): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    if (!(await claimReview(admin, appealId))) return;

    const { data: appeal, error } = await admin
      .from("appeals")
      .select("scan_id, reason, status")
      .eq("id", appealId)
      .maybeSingle();
    if (error) throw error;
    if (!appeal || appeal.status !== "pending") return;
    const scanId = appeal.scan_id;

    const { data: scan, error: scanError } = await admin
      .from("scans")
      .select(REVIEW_SCAN_COLUMNS)
      .eq("id", scanId)
      .single();
    if (scanError) throw scanError;

    const original = classificationFromScan(scan);
    const image = await loadRetainedImage(admin, scanId, retainedImagePath(scan, Date.now()));
    const result = await reviewAppeal({ ...image, original, reason: appeal.reason });
    const overturned = result.decision === "overturned";

    // Conditional on 'pending': if two reviews ever race, only the first decision lands.
    const { data: decided, error: decideError } = await admin
      .from("appeals")
      .update({
        status: result.decision,
        ruling: truncate(result.ruling.trim(), MAX_RULING_LENGTH),
        reviewer_model: result.model,
        decided_at: new Date().toISOString(),
      })
      .eq("id", appealId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (decideError) throw decideError;
    if (!decided) return;

    const { error: updateError } = await admin
      .from("scans")
      .update(overturned ? overturnedScanUpdate(result.classification, scan) : { review_status: "upheld" })
      .eq("id", scanId);
    if (updateError) {
      // Undo the decision so the next look at the case retries it, rather than leaving the appeal
      // and the scan disagreeing.
      await admin
        .from("appeals")
        .update({ status: "pending", ruling: null, reviewer_model: null, decided_at: null })
        .eq("id", appealId);
      throw updateError;
    }

    await recordAuditEvents(scanId, [
      {
        event: overturned ? "appeal_overturned" : "appeal_upheld",
        actor: REVIEW_BOARD,
        detail: decisionDetail(result.decision, overturned ? result.classification : original, result.ruling),
      },
    ]);
    if (overturned) {
      await revokeOverturned(scanId);
      // The verdict, rating and certificate changed: rankings and the global counters with them.
      invalidateLeaderboard();
      revalidateTag(STATS_TAG, "max");
    }

    log.info("appeals.decided", {
      appealId,
      scanId,
      decision: result.decision,
      model: result.model,
      latencyMs: result.latencyMs,
      reviewedImage: image.bytes !== null,
    });
  } catch (error) {
    log.error("appeals.review_failed", { appealId, error });
  }
}

async function revokeOverturned(scanId: string): Promise<void> {
  try {
    await revokeCertificate(scanId, OVERTURN_REVOCATION_REASON);
  } catch (error) {
    // The decision stands; a certificate still marked valid needs a person to look at it.
    log.error("appeals.revoke_failed", { scanId, error });
  }
}

/** 5 appeals per day per user (or visitor). Fails open if the limiter itself is down. */
async function enforceAppealLimit(admin: AdminClient, { viewer, visitorId }: ViewerContext): Promise<void> {
  const subject = viewer.userId ? `u:${viewer.userId}` : `v:${visitorId}`;
  const state = await createRpcConsumer(admin)({
    key: `appeal:1d:${subject}`,
    limit: APPEALS_PER_DAY,
    windowSeconds: DAY_SECONDS,
  }).catch((error: unknown) => {
    log.warn("appeals.rate_limit_unavailable", { error });
    return null;
  });
  if (state && !state.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `The Review Board accepts ${APPEALS_PER_DAY} appeals a day. Please try again tomorrow.`,
      { retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000)), retryable: true },
    );
  }
}

/**
 * A two-minute lease per appeal (consume_rate_limit with a limit of 1), so page views that find the
 * appeal stale don't start parallel reviews. If the lease can't be checked we review anyway: the
 * decision write is conditional, so a duplicate only costs a model call.
 */
async function claimReview(admin: AdminClient, appealId: string): Promise<boolean> {
  try {
    const { allowed } = await createRpcConsumer(admin)({
      key: `appeal:review:${appealId}`,
      limit: 1,
      windowSeconds: REVIEW_LEASE_SECONDS,
    });
    return allowed;
  } catch (error) {
    log.warn("appeals.review_lease_unavailable", { appealId, error });
    return true;
  }
}

/** The stored image, or nulls: the Board then reviews the record alone. */
async function loadRetainedImage(
  admin: AdminClient,
  scanId: string,
  path: string | null,
): Promise<{ bytes: Uint8Array | null; mimeType: AcceptedImageType | null }> {
  const none = { bytes: null, mimeType: null };
  if (!path) return none;
  try {
    const { data, error } = await admin.storage.from(SCANS_BUCKET).download(path);
    if (error || !data) throw error ?? new Error("empty download");
    const bytes = new Uint8Array(await data.arrayBuffer());
    const mimeType = sniffImageType(bytes);
    return mimeType ? { bytes, mimeType } : none;
  } catch (error) {
    log.warn("appeals.image_unavailable", { scanId, error });
    return none;
  }
}
