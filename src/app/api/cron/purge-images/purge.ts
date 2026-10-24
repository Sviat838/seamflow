import "server-only";
import { recordAuditEvents } from "@/lib/audit/record";
import { log } from "@/lib/log";
import { SCANS_BUCKET, type AdminClient } from "@/lib/supabase/admin";
import { IMAGE_RETENTION_HOURS } from "@/lib/types";

/** Scans handled per run; a backlog drains over the next runs. */
export const PURGE_BATCH_SIZE = 500;
const REMOVE_CHUNK_SIZE = 100;
// Audit inserts serialize per scan (chain trigger), not across scans, so a few can run at once.
const AUDIT_CONCURRENCY = 10;

export const RETENTION_ACTOR = "HDX retention service";
export const RETENTION_DETAIL = `Image deleted automatically after ${IMAGE_RETENTION_HOURS} hours under the retention policy.`;

export interface PurgeResult {
  /** Expired images found this run (at most PURGE_BATCH_SIZE). */
  candidates: number;
  deleted: number;
  /** Left for the next run: storage or the database refused. */
  failed: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Deletes stored images older than IMAGE_RETENTION_HOURS, marks their scans image_deleted_at and
 * records `image_deleted`. Idempotent: objects already gone count as removed, and only rows this
 * run marked get an audit event, so overlapping runs can't double-audit. Throws if the candidate
 * query fails; per-chunk failures are logged and retried next run.
 */
export async function purgeExpiredImages(admin: AdminClient, now = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - IMAGE_RETENTION_HOURS * 60 * 60 * 1000).toISOString();
  // Matches the partial index scans_image_retention_idx.
  const { data, error } = await admin
    .from("scans")
    .select("id, image_path")
    .not("image_path", "is", null)
    .is("image_deleted_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(PURGE_BATCH_SIZE);
  if (error) throw new Error("purge-images: candidate query failed", { cause: error });

  const expired = data.flatMap((row) => (row.image_path ? [{ id: row.id, path: row.image_path }] : []));
  const result: PurgeResult = { candidates: expired.length, deleted: 0, failed: 0 };

  for (const batch of chunk(expired, REMOVE_CHUNK_SIZE)) {
    const { error: removeError } = await admin.storage.from(SCANS_BUCKET).remove(batch.map((item) => item.path));
    if (removeError) {
      result.failed += batch.length;
      log.error("retention.remove_failed", { count: batch.length, error: removeError.message });
      continue;
    }

    const { data: marked, error: markError } = await admin
      .from("scans")
      .update({ image_deleted_at: now.toISOString() })
      .in("id", batch.map((item) => item.id))
      .is("image_deleted_at", null)
      .select("id");
    if (markError) {
      // The objects are gone; the next run finds the rows again and marks them.
      result.failed += batch.length;
      log.error("retention.mark_failed", { count: batch.length, error: markError.message });
      continue;
    }

    result.deleted += marked.length;
    for (const group of chunk(marked, AUDIT_CONCURRENCY)) {
      await Promise.all(
        group.map(({ id }) =>
          recordAuditEvents(id, [{ event: "image_deleted", actor: RETENTION_ACTOR, detail: RETENTION_DETAIL }]),
        ),
      );
    }
  }

  log.info("retention.purged", { ...result });
  return result;
}
