import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { getGlobalStats } from "@/lib/scans/queries";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { FeedSnapshot, GlobalStats } from "@/lib/types";

type ScanRow = Database["public"]["Tables"]["scans"]["Row"];

/** Everything the feed reads. Never images, owners, companies, case numbers or ids in the output. */
export const FEED_COLUMNS = "id, created_at, region, verdict, confidence";
export type FeedRow = Pick<ScanRow, "id" | "created_at" | "region" | "verdict" | "confidence">;

export const DEFAULT_FEED_LIMIT = 12;
export const MAX_FEED_LIMIT = 50;

export interface FeedOptions {
  limit?: number;
  /** The viewer's own scan (access already checked by the caller): shown as "This case". */
  highlightScanId?: string | null;
}

/**
 * Latest verdicts worldwide plus today's honest counters, anonymised. Request-time and uncached:
 * it's polled. A failed read degrades to an empty list (with stats), like the stats strip.
 */
export async function getFeedSnapshot(opts: FeedOptions = {}): Promise<FeedSnapshot> {
  // Live data: never let it be prerendered into a static shell.
  await connection();
  const limit = clampLimit(opts.limit);
  const highlightScanId = opts.highlightScanId ?? null;
  const admin = getAdminClient();
  if (!admin) return buildFeedSnapshot([], null, { highlightScanId, now: new Date() });

  // One indexed read (scans_created_idx); the counters come from the cached stats RPC.
  const [{ data: rows, error }, stats] = await Promise.all([
    admin.from("scans").select(FEED_COLUMNS).order("created_at", { ascending: false }).limit(limit),
    getGlobalStats(),
  ]);
  if (error) log.error("feed.read_failed", { error: error.message });
  return buildFeedSnapshot(error ? [] : rows, stats, { highlightScanId, now: new Date() });
}

/** Pure mapping, exported for tests. `stats` null means no database: every counter is zero. */
export function buildFeedSnapshot(
  rows: FeedRow[],
  stats: GlobalStats | null,
  { highlightScanId, now, keyFor = feedKey }: { highlightScanId: string | null; now: Date; keyFor?: (id: string) => string },
): FeedSnapshot {
  const verdictsToday = stats?.scansToday ?? 0;
  return {
    items: rows.map((row) => ({
      key: keyFor(row.id),
      time: toIsoString(row.created_at),
      region: row.region,
      verdict: row.verdict,
      confidence: clamp01(row.confidence),
      highlight: highlightScanId !== null && row.id === highlightScanId,
    })),
    verdictsToday,
    hotDogShareToday: verdictsToday > 0 ? clamp01((stats?.hotDogScansToday ?? 0) / verdictsToday) : null,
    ambiguousAllTime: 0,
    p50LatencyMs: stats?.p50LatencyMs ?? null,
    generatedAt: now.toISOString(),
  };
}

let ephemeralSecret: Buffer | undefined;

/**
 * Stable, opaque row key: a short HMAC of the scan id, so the UI can animate new rows across polls
 * without the feed ever revealing an id. Domain-separated from the IP hashes that share APP_SECRET.
 */
export function feedKey(scanId: string): string {
  const secret = serverEnv().APP_SECRET ?? (ephemeralSecret ??= randomBytes(32));
  return createHmac("sha256", secret).update(`feed:${scanId}`).digest("base64url").slice(0, 16);
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_FEED_LIMIT;
  return Math.min(MAX_FEED_LIMIT, Math.max(1, Math.trunc(limit)));
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

function toIsoString(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}
