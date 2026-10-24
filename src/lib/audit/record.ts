import "server-only";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import type { AuditEventType } from "@/lib/types";

export interface AuditEventInput {
  event: AuditEventType;
  /** Who acted, as shown in the trail: "Dana Kessler · Web console", "HDX policy engine", ... */
  actor: string;
  detail: string;
}

/**
 * Appends events to a scan's audit trail. The database chains each row's SHA-256 to the previous
 * one (trigger audit_events_chain), so callers only supply content, in order.
 * Never throws: a missing audit row must not fail the user's request.
 */
export async function recordAuditEvents(scanId: string, events: AuditEventInput[]): Promise<void> {
  const admin = getAdminClient();
  if (!admin || events.length === 0) return;
  // One insert per event keeps the chain order explicit (a multi-row insert would too, but
  // sequential inserts make the per-row clock_timestamp() strictly increasing).
  for (const e of events) {
    const { error } = await admin.from("audit_events").insert({
      scan_id: scanId,
      event: e.event,
      actor: e.actor.slice(0, 120),
      detail: e.detail.slice(0, 500),
      hash: "", // replaced by the chain trigger
    });
    if (error) {
      log.warn("audit.record_failed", { scanId, event: e.event, cause: error });
      return;
    }
  }
}
