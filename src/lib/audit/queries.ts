import "server-only";
import { getViewerContext } from "@/lib/auth/viewer";
import { AppError } from "@/lib/errors";
import { findAccessibleScan } from "@/lib/scans/access";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { AUDIT_EVENT_TYPES, type AuditEvent, type AuditEventType } from "@/lib/types";

type AuditRow = Database["public"]["Tables"]["audit_events"]["Row"];

const EVENT_COLUMNS = "id, event, actor, detail, occurred_at, hash, prev_hash";
const DEFAULT_LOG_LIMIT = 100;
const MAX_LOG_LIMIT = 500;

const readFailed = (cause: unknown) =>
  new AppError("INTERNAL", "We couldn't load the audit trail. Please try again.", { cause, retryable: true });

const EVENT_TYPES: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);
const isEventType = (value: string): value is AuditEventType => EVENT_TYPES.has(value);

/** One case's trail in chain order, for its owner or company; empty when the viewer can't open it. */
export async function listAuditEvents(scanId: string): Promise<AuditEvent[]> {
  const found = await findAccessibleScan(scanId);
  return found ? readAuditTrail(found.admin, found.row.id) : [];
}

/** A scan's trail in chain order, with no access check: only for callers that just did one. */
export async function readAuditTrail(admin: AdminClient, scanId: string): Promise<AuditEvent[]> {
  const { data, error } = await admin
    .from("audit_events")
    .select(EVENT_COLUMNS)
    .eq("scan_id", scanId)
    .order("id", { ascending: true });
  if (error) throw readFailed(error);
  return data.flatMap(toAuditEvent);
}

/**
 * The workspace audit log, newest first, with each event's case number. Same scope as History:
 * the company's scans plus the user's own, else their own (unclaimed ones for anonymous visitors).
 */
export async function listViewerAuditEvents(
  opts: { limit?: number } = {},
): Promise<Array<AuditEvent & { caseNumber: string }>> {
  const requested = opts.limit !== undefined && Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : DEFAULT_LOG_LIMIT;
  const limit = Math.min(MAX_LOG_LIMIT, Math.max(1, requested));
  // Read the viewer before any early return: the log is per-viewer, so always request-time.
  const { viewer, visitorId } = await getViewerContext();
  const admin = getAdminClient();
  if (!admin) return [];

  // !inner turns the embed into a join, so the scans filters below restrict the events.
  let query = admin.from("audit_events").select(`${EVENT_COLUMNS}, scans!inner(case_number)`);
  if (viewer.userId && viewer.company) {
    // Both uuids (verified JWT subject, DB id): safe to interpolate. Like History, this includes
    // the user's own scans from before onboarding, which have no company_id.
    query = query.or(`company_id.eq.${viewer.company.id},user_id.eq.${viewer.userId}`, { referencedTable: "scans" });
  } else if (viewer.userId) {
    query = query.eq("scans.user_id", viewer.userId);
  } else {
    query = query.eq("scans.visitor_id", visitorId).is("scans.user_id", null);
  }

  const { data, error } = await query.order("id", { ascending: false }).limit(limit);
  if (error) throw readFailed(error);
  return data.flatMap((row) => toAuditEvent(row).map((event) => ({ ...event, caseNumber: row.scans.case_number })));
}

/** Row → AuditEvent, or nothing for an event type this build doesn't know. Pure; exported for tests. */
export function toAuditEvent(
  row: Pick<AuditRow, "event" | "actor" | "detail" | "occurred_at" | "hash" | "prev_hash">,
): AuditEvent[] {
  if (!isEventType(row.event)) return [];
  return [
    {
      event: row.event,
      actor: row.actor,
      detail: row.detail,
      occurredAt: toAuditTimestamp(row.occurred_at),
      hash: row.hash,
      prevHash: row.prev_hash,
    },
  ];
}

// PostgREST sends "2026-10-24T10:15:56.123456+00:00". The chain trigger hashes the UTC time to the
// microsecond ("…56.123456Z"), so keep all six digits: an exported trail can then be re-verified.
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|[+-]00(?::?00)?)$/;

/** ISO 8601 in UTC with microseconds, the format audit_events_chain() hashes. */
export function toAuditTimestamp(value: string): string {
  const match = UTC_TIMESTAMP.exec(value);
  if (match) return `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(6, "0")}Z`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
