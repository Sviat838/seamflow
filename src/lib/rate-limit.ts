import "server-only";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";

export interface RateLimitSubject {
  userId: string | null;
  visitorId: string;
  ipHash: string | null;
}

export interface RateLimitBucket {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface BucketState {
  allowed: boolean;
  /** Epoch ms when the bucket's current window ends. */
  resetAt: number;
}

/** Counts one hit against a bucket. Rejects when the backing store fails. */
export type BucketConsumer = (bucket: RateLimitBucket) => Promise<BucketState>;

export interface ScanLimits {
  perMinute: number;
  perDay: number;
  globalPerDay: number;
}

export interface RateLimitDeps {
  limits: ScanLimits;
  /** DB-backed consumer; null when Supabase isn't configured. */
  consume: BucketConsumer | null;
  /** Per-instance limiter used when the DB is missing or failing. */
  fallback: BucketConsumer;
  now?: () => number;
}

const MINUTE = 60;
const DAY = 86_400;
// One IP is often many people (offices, campuses, mobile carrier NAT), so it gets more headroom.
const IP_LIMIT_MULTIPLIER = 3;
const RPC_TIMEOUT_MS = 2000;

/** Subject and IP buckets for one scan, plus the global daily bucket. Pure. */
export function scanBuckets(
  subject: RateLimitSubject,
  limits: ScanLimits,
): { perClient: RateLimitBucket[]; global: RateLimitBucket } {
  const perClient: RateLimitBucket[] = [];
  const subjectKey = subject.userId ? `u:${subject.userId}` : subject.visitorId ? `v:${subject.visitorId}` : null;
  if (subjectKey) {
    perClient.push(
      { key: `scan:1m:${subjectKey}`, limit: limits.perMinute, windowSeconds: MINUTE },
      { key: `scan:1d:${subjectKey}`, limit: limits.perDay, windowSeconds: DAY },
    );
  }
  if (subject.ipHash) {
    perClient.push(
      { key: `scan:1m:ip:${subject.ipHash}`, limit: limits.perMinute * IP_LIMIT_MULTIPLIER, windowSeconds: MINUTE },
      { key: `scan:1d:ip:${subject.ipHash}`, limit: limits.perDay * IP_LIMIT_MULTIPLIER, windowSeconds: DAY },
    );
  }
  return { perClient, global: { key: "scan:1d:global", limit: limits.globalPerDay, windowSeconds: DAY } };
}

/** consume_rate_limit() RPC: fixed windows aligned to the epoch, shared by every instance. */
export function createRpcConsumer(admin: AdminClient): BucketConsumer {
  return async ({ key, limit, windowSeconds }) => {
    const { data, error } = await admin
      .rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (error) throw new Error("consume_rate_limit failed", { cause: error });
    const row = data?.[0];
    const resetAt = row ? Date.parse(row.reset_at) : Number.NaN;
    if (!row || !Number.isFinite(resetAt)) {
      throw new Error("consume_rate_limit returned an unexpected shape", { cause: data });
    }
    return { allowed: row.allowed, resetAt };
  };
}

/**
 * In-memory fixed-window limiter with the same window alignment as the RPC. Bounded: expired
 * windows are dropped first, then the least recently used keys.
 */
export function createMemoryConsumer(
  options: { now?: () => number; maxKeys?: number } = {},
): BucketConsumer {
  const { now = Date.now, maxKeys = 10_000 } = options;
  const windows = new Map<string, { hits: number; resetAt: number }>();

  function makeRoom(t: number) {
    for (const [key, entry] of windows) if (entry.resetAt <= t) windows.delete(key);
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  }

  return async ({ key, limit, windowSeconds }) => {
    const t = now();
    const windowMs = windowSeconds * 1000;
    let entry = windows.get(key);
    windows.delete(key); // re-inserted below as the most recently used key
    if (!entry || entry.resetAt <= t) {
      if (windows.size >= maxKeys) makeRoom(t);
      entry = { hits: 0, resetAt: Math.floor(t / windowMs) * windowMs + windowMs };
    }
    entry.hits += 1;
    windows.set(key, entry);
    return { allowed: entry.hits <= limit, resetAt: entry.resetAt };
  };
}

let warnedNoDatabase = false;

async function consumeAll(buckets: RateLimitBucket[], deps: RateLimitDeps): Promise<BucketState[]> {
  const { consume, fallback } = deps;
  if (!consume) {
    if (!warnedNoDatabase) {
      warnedNoDatabase = true;
      log.warn("rate_limit.fallback", { reason: "database_not_configured", scope: "per_instance" });
    }
    return Promise.all(buckets.map((bucket) => fallback(bucket)));
  }
  const settled = await Promise.allSettled(buckets.map((bucket) => consume(bucket)));
  const failures = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
  if (failures.length > 0) {
    // Fail open-ish: still limited, just per instance, for the buckets the DB couldn't count.
    log.warn("rate_limit.fallback", {
      reason: "rpc_failed",
      scope: "per_instance",
      failedBuckets: failures.length,
      error: failures[0].reason,
    });
  }
  return Promise.all(
    settled.map((result, i) => (result.status === "fulfilled" ? result.value : fallback(buckets[i]))),
  );
}

function secondsUntil(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function formatWait(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return plural(seconds, "second");
  if (seconds < 3600) return plural(Math.ceil(seconds / 60), "minute");
  return plural(Math.ceil(seconds / 3600), "hour");
}

/**
 * Testable core of enforceScanRateLimit. Client buckets are consumed first and the global bucket
 * only after they pass, so a client that is already throttled can't burn the global budget.
 */
export async function checkScanRateLimit(subject: RateLimitSubject, deps: RateLimitDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const { perClient, global } = scanBuckets(subject, deps.limits);

  const blocked = (await consumeAll(perClient, deps)).filter((state) => !state.allowed);
  if (blocked.length > 0) {
    // Every blocking window has to roll over before a retry can succeed.
    const retryAfterSeconds = secondsUntil(Math.max(...blocked.map((state) => state.resetAt)), now());
    throw new AppError(
      "RATE_LIMITED",
      `Scan quota reached. Your next scan is available in ${formatWait(retryAfterSeconds)}.`,
      { retryAfterSeconds, retryable: true },
    );
  }

  const [globalState] = await consumeAll([global], deps);
  if (!globalState.allowed) {
    throw new AppError(
      "CAPACITY_EXCEEDED",
      "Seamflow has reached today's scan capacity. Please try again tomorrow.",
      { retryAfterSeconds: secondsUntil(globalState.resetAt, now()), retryable: true },
    );
  }
}

const memoryConsumer = createMemoryConsumer();

/**
 * Per-subject per-minute and per-day limits (IP hash as a second key, x3) plus the global daily cap.
 * Throws AppError RATE_LIMITED (with retryAfterSeconds) or CAPACITY_EXCEEDED.
 * DB-backed via consume_rate_limit(); falls back to an in-memory limiter without Supabase.
 */
export async function enforceScanRateLimit(subject: RateLimitSubject): Promise<void> {
  const env = serverEnv();
  const admin = getAdminClient();
  await checkScanRateLimit(subject, {
    limits: {
      perMinute: env.RATE_LIMIT_PER_MINUTE,
      perDay: env.RATE_LIMIT_PER_DAY,
      globalPerDay: env.GLOBAL_DAILY_SCAN_CAP,
    },
    consume: admin ? createRpcConsumer(admin) : null,
    fallback: memoryConsumer,
  });
}
