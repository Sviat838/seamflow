// Pure appeal mapping and Review Board decision rules. No server-only imports, so it's cheap to test.
import { defaultClauseFor } from "@/lib/policy";
import { verdictSentence } from "@/lib/scans/audit";
import { parseScanDetails, toScanDetails, type ScanRecord } from "@/lib/scans/mappers";
import type { Database } from "@/lib/supabase/database.types";
import { IMAGE_RETENTION_HOURS, type AppealView, type Classification, type ReviewStatus } from "@/lib/types";

type AppealRow = Database["public"]["Tables"]["appeals"]["Row"];
type ScanUpdate = Database["public"]["Tables"]["scans"]["Update"];

export const APPEAL_COLUMNS = "id, scan_id, status, reason, ruling, created_at, decided_at";
export type AppealRecord = Pick<
  AppealRow,
  "id" | "scan_id" | "status" | "reason" | "ruling" | "created_at" | "decided_at"
>;

/** A pending appeal older than this gets its decision re-scheduled: the first attempt failed or was cut off. */
export const STALE_PENDING_MS = 2 * 60 * 1000;

const REVIEW_STATUSES: readonly string[] = ["pending", "upheld", "overturned"] satisfies ReviewStatus[];
const isReviewStatus = (value: string): value is ReviewStatus => REVIEW_STATUSES.includes(value);

function toIsoString(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}

export function toAppealView(row: AppealRecord): AppealView {
  return {
    status: isReviewStatus(row.status) ? row.status : "pending",
    reason: row.reason,
    ruling: row.ruling,
    createdAt: toIsoString(row.created_at),
    decidedAt: row.decided_at ? toIsoString(row.decided_at) : null,
  };
}

export function isStalePending(row: Pick<AppealRecord, "status" | "created_at">, now: number): boolean {
  return row.status === "pending" && Date.parse(row.created_at) <= now - STALE_PENDING_MS;
}

/** The stored image the Board may look at: not purged and still inside the retention window. */
export function retainedImagePath(
  row: Pick<ScanRecord, "image_path" | "image_deleted_at" | "created_at">,
  now: number,
): string | null {
  const expiresAt = Date.parse(row.created_at) + IMAGE_RETENTION_HOURS * 60 * 60 * 1000;
  return row.image_path && !row.image_deleted_at && now < expiresAt ? row.image_path : null;
}

/** The verdict on record, in the shape the classifier returned it. */
export function classificationFromScan(
  row: Pick<ScanRecord, "verdict" | "confidence" | "summary" | "details" | "policy_clause" | "rating" | "rating_note">,
): Classification {
  const details = parseScanDetails(row.details);
  return {
    verdict: row.verdict,
    confidence: row.confidence,
    summary: row.summary,
    reasoning: details.reasoning,
    detectedItems: details.detectedItems,
    flags: details.flags,
    policyClause: row.policy_clause ?? defaultClauseFor(row.verdict),
    rating: row.rating,
    ratingNote: row.rating_note,
  };
}

/**
 * The scan write for an overturned verdict: the Board's classification replaces the verdict, clause,
 * rating and details (the original stays in the audit trail). reviewAppeal already guarantees the
 * clause matches the verdict and that only HOT DOG verdicts carry a rating.
 */
export function overturnedScanUpdate(next: Classification, previous: Pick<ScanRecord, "details">): ScanUpdate {
  return {
    verdict: next.verdict,
    confidence: next.confidence,
    summary: next.summary,
    details: toScanDetails(next, parseScanDetails(previous.details).cached),
    policy_clause: next.policyClause,
    rating: next.verdict === "hot_dog" ? next.rating : null,
    rating_note: next.verdict === "hot_dog" ? next.ratingNote : null,
    review_status: "overturned",
  };
}

/** Audit detail for the Review Board's decision, e.g. "Verdict overturned. Final verdict: NOT HOT DOG at …". */
export function decisionDetail(
  decision: "upheld" | "overturned",
  final: Classification,
  ruling: string,
): string {
  const verdict = verdictSentence(final.verdict, final.confidence, final.policyClause);
  return `Verdict ${decision}. Final verdict: ${verdict} ${ruling}`;
}
