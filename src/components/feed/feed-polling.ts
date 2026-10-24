import type { FeedItem, FeedSnapshot, Verdict } from "@/lib/types";

export const FEED_POLL_MS = 5000;
export const FEED_MAX_BACKOFF_MS = 60_000;

/** Delay before the next poll: the base interval, doubled per consecutive failure, capped. */
export function nextPollDelay(failures: number, baseMs = FEED_POLL_MS, maxMs = FEED_MAX_BACKOFF_MS): number {
  if (failures <= 0) return baseMs;
  return Math.min(maxMs, baseMs * 2 ** Math.min(failures, 16));
}

/** GET /api/v1/feed, with ?case= so the server can mark the viewer's own case. */
export function feedUrl(caseNumber?: string | null): string {
  return caseNumber ? `/api/v1/feed?case=${encodeURIComponent(caseNumber)}` : "/api/v1/feed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVerdict(value: unknown): value is Verdict {
  return value === "hot_dog" || value === "not_hot_dog";
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toItem(value: unknown): FeedItem | null {
  if (!isRecord(value)) return null;
  const { key, time, region, verdict, confidence, highlight } = value;
  if (typeof key !== "string" || typeof time !== "string" || !isVerdict(verdict)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return {
    key,
    time,
    region: typeof region === "string" ? region : null,
    verdict,
    confidence,
    highlight: highlight === true,
  };
}

/**
 * Validates a /api/v1/feed response (bare snapshot or wrapped in { feed }) so a bad payload
 * keeps the last good snapshot on screen instead of crashing the table. Null when unusable.
 */
export function parseFeedSnapshot(json: unknown): FeedSnapshot | null {
  const body = isRecord(json) && isRecord(json.feed) ? json.feed : json;
  if (!isRecord(body) || !Array.isArray(body.items)) return null;
  if (typeof body.verdictsToday !== "number" || !Number.isFinite(body.verdictsToday)) return null;

  const share = nullableNumber(body.hotDogShareToday);
  const p50 = nullableNumber(body.p50LatencyMs);
  return {
    items: body.items.map(toItem).filter((item): item is FeedItem => item !== null),
    verdictsToday: body.verdictsToday,
    hotDogShareToday: share ?? null,
    ambiguousAllTime: 0,
    p50LatencyMs: p50 ?? null,
    generatedAt: typeof body.generatedAt === "string" ? body.generatedAt : new Date().toISOString(),
  };
}
