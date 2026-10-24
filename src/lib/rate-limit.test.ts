import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import {
  checkScanRateLimit,
  createMemoryConsumer,
  createRpcConsumer,
  enforceScanRateLimit,
  scanBuckets,
  type BucketConsumer,
  type RateLimitBucket,
  type RateLimitSubject,
} from "@/lib/rate-limit";
import type { AdminClient } from "@/lib/supabase/admin";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const admin = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/log", () => ({ log }));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ RATE_LIMIT_PER_MINUTE: 10, RATE_LIMIT_PER_DAY: 100, GLOBAL_DAILY_SCAN_CAP: 2000 }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => admin.client }));

const LIMITS = { perMinute: 10, perDay: 100, globalPerDay: 2000 };
const NOW = Date.UTC(2026, 9, 24, 12, 0, 30); // 30s into a minute window
const visitor: RateLimitSubject = { userId: null, visitorId: "vis-1", ipHash: "iphash1" };

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("expected a rejection");
}

/** Mocked RPC: every bucket allowed unless listed, with a reset 30s out. */
function fakeConsumer(blocked: Record<string, number> = {}) {
  const calls: RateLimitBucket[] = [];
  const consume: BucketConsumer = async (bucket) => {
    calls.push(bucket);
    const resetAt = blocked[bucket.key];
    return resetAt === undefined ? { allowed: true, resetAt: NOW + 30_000 } : { allowed: false, resetAt };
  };
  return { consume, calls };
}

const unusedFallback: BucketConsumer = async () => {
  throw new Error("fallback should not be used");
};

beforeEach(() => {
  log.warn.mockClear();
  admin.client = null;
});

describe("scanBuckets", () => {
  it("keys signed-in users by user id, with IP buckets at 3x", () => {
    const { perClient, global } = scanBuckets({ userId: "user-1", visitorId: "vis-1", ipHash: "h" }, LIMITS);
    expect(perClient).toEqual([
      { key: "scan:1m:u:user-1", limit: 10, windowSeconds: 60 },
      { key: "scan:1d:u:user-1", limit: 100, windowSeconds: 86_400 },
      { key: "scan:1m:ip:h", limit: 30, windowSeconds: 60 },
      { key: "scan:1d:ip:h", limit: 300, windowSeconds: 86_400 },
    ]);
    expect(global).toEqual({ key: "scan:1d:global", limit: 2000, windowSeconds: 86_400 });
  });

  it("keys anonymous visitors by visitor id and skips IP buckets without an IP", () => {
    const { perClient } = scanBuckets({ userId: null, visitorId: "vis-1", ipHash: null }, LIMITS);
    expect(perClient.map((b) => b.key)).toEqual(["scan:1m:v:vis-1", "scan:1d:v:vis-1"]);
  });
});

describe("checkScanRateLimit (RPC path)", () => {
  it("passes when every bucket allows, consuming the global bucket last", async () => {
    const { consume, calls } = fakeConsumer();
    await checkScanRateLimit(visitor, { limits: LIMITS, consume, fallback: unusedFallback, now: () => NOW });
    expect(calls.map((b) => b.key)).toEqual([
      "scan:1m:v:vis-1",
      "scan:1d:v:vis-1",
      "scan:1m:ip:iphash1",
      "scan:1d:ip:iphash1",
      "scan:1d:global",
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("throws RATE_LIMITED without touching the global budget", async () => {
    const { consume, calls } = fakeConsumer({ "scan:1m:v:vis-1": NOW + 29_500 });
    const error = await catchError(
      checkScanRateLimit(visitor, { limits: LIMITS, consume, fallback: unusedFallback, now: () => NOW }),
    );
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(30); // 29.5s rounds up
    expect(error.message).toContain("30 seconds");
    expect(calls.map((b) => b.key)).not.toContain("scan:1d:global");
  });

  it("waits for the latest blocking reset when several buckets block", async () => {
    const { consume } = fakeConsumer({
      "scan:1m:v:vis-1": NOW + 30_000,
      "scan:1d:ip:iphash1": NOW + 5 * 3600_000 + 1,
    });
    const error = await catchError(
      checkScanRateLimit(visitor, { limits: LIMITS, consume, fallback: unusedFallback, now: () => NOW }),
    );
    expect(error.retryAfterSeconds).toBe(5 * 3600 + 1);
    expect(error.message).toContain("6 hours");
  });

  it("never asks for less than one second", async () => {
    const { consume } = fakeConsumer({ "scan:1m:v:vis-1": NOW - 5000 });
    const error = await catchError(
      checkScanRateLimit(visitor, { limits: LIMITS, consume, fallback: unusedFallback, now: () => NOW }),
    );
    expect(error.retryAfterSeconds).toBe(1);
    expect(error.message).toContain("1 second.");
  });

  it("throws CAPACITY_EXCEEDED when the global daily cap is spent", async () => {
    const midnight = Date.UTC(2026, 9, 25);
    const { consume } = fakeConsumer({ "scan:1d:global": midnight });
    const error = await catchError(
      checkScanRateLimit(visitor, { limits: LIMITS, consume, fallback: unusedFallback, now: () => NOW }),
    );
    expect(error.code).toBe("CAPACITY_EXCEEDED");
    expect(error.status).toBe(503);
    expect(error.retryAfterSeconds).toBe((midnight - NOW) / 1000);
  });

  it("falls back to memory for buckets the RPC failed to count", async () => {
    const fallback = vi.fn<BucketConsumer>(async () => ({ allowed: true, resetAt: NOW + 1000 }));
    const consume: BucketConsumer = async (bucket) => {
      if (bucket.key.includes(":ip:")) throw new Error("connection reset");
      return { allowed: true, resetAt: NOW + 1000 };
    };
    await checkScanRateLimit(visitor, { limits: LIMITS, consume, fallback, now: () => NOW });
    expect(fallback.mock.calls.map(([b]) => b.key)).toEqual(["scan:1m:ip:iphash1", "scan:1d:ip:iphash1"]);
    expect(log.warn).toHaveBeenCalledWith(
      "rate_limit.fallback",
      expect.objectContaining({ reason: "rpc_failed", failedBuckets: 2 }),
    );
  });
});

describe("checkScanRateLimit (in-memory path)", () => {
  it("enforces the per-minute limit and resets with the window", async () => {
    let now = NOW;
    const deps = { limits: LIMITS, consume: null, fallback: createMemoryConsumer({ now: () => now }), now: () => now };

    for (let i = 0; i < 10; i++) await checkScanRateLimit(visitor, deps);
    const error = await catchError(checkScanRateLimit(visitor, deps));
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(30); // window ends at :01:00, we're at :00:30

    now += 30_000; // next minute window
    await expect(checkScanRateLimit(visitor, deps)).resolves.toBeUndefined();
  });

  it("limits a shared IP at 3x across rotating visitor ids", async () => {
    const deps = { limits: LIMITS, consume: null, fallback: createMemoryConsumer({ now: () => NOW }), now: () => NOW };
    for (let i = 0; i < 30; i++) {
      await checkScanRateLimit({ userId: null, visitorId: `vis-${i}`, ipHash: "shared" }, deps);
    }
    const error = await catchError(checkScanRateLimit({ userId: null, visitorId: "vis-new", ipHash: "shared" }, deps));
    expect(error.code).toBe("RATE_LIMITED");
  });

  it("applies the global cap", async () => {
    const deps = {
      limits: { ...LIMITS, globalPerDay: 2 },
      consume: null,
      fallback: createMemoryConsumer({ now: () => NOW }),
      now: () => NOW,
    };
    await checkScanRateLimit({ userId: "a", visitorId: "v", ipHash: null }, deps);
    await checkScanRateLimit({ userId: "b", visitorId: "v", ipHash: null }, deps);
    const error = await catchError(checkScanRateLimit({ userId: "c", visitorId: "v", ipHash: null }, deps));
    expect(error.code).toBe("CAPACITY_EXCEEDED");
  });
});

describe("createMemoryConsumer", () => {
  const bucket = (key: string, limit = 1): RateLimitBucket => ({ key, limit, windowSeconds: 60 });

  it("aligns windows to the epoch like the RPC", async () => {
    const consume = createMemoryConsumer({ now: () => NOW });
    expect(await consume(bucket("a"))).toEqual({ allowed: true, resetAt: Date.UTC(2026, 9, 24, 12, 1, 0) });
    expect((await consume(bucket("a"))).allowed).toBe(false);
  });

  it("stays bounded, evicting expired windows first, then the least recently used", async () => {
    let now = NOW;
    const consume = createMemoryConsumer({ now: () => now, maxKeys: 3 });
    await consume({ key: "short", limit: 1, windowSeconds: 1 });
    await consume(bucket("old"));
    await consume(bucket("hot"));

    now += 1000; // "short" has expired
    await consume(bucket("new")); // evicts "short" only
    expect((await consume(bucket("old"))).allowed).toBe(false); // still counted
    await consume(bucket("hot")); // "new" is now least recently used

    await consume(bucket("newer")); // evicts "new"
    expect((await consume(bucket("new"))).allowed).toBe(true); // forgotten, counts afresh
  });
});

describe("createRpcConsumer", () => {
  function fakeAdmin(result: { data: unknown; error: unknown }) {
    const rpc = vi.fn(() => ({ abortSignal: vi.fn(async () => result) }));
    return { client: { rpc } as unknown as AdminClient, rpc };
  }

  it("calls consume_rate_limit and parses the row", async () => {
    const { client, rpc } = fakeAdmin({
      data: [{ allowed: false, remaining: 0, reset_at: "2026-10-24T12:01:00+00:00" }],
      error: null,
    });
    const state = await createRpcConsumer(client)({ key: "k", limit: 10, windowSeconds: 60 });
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", { p_key: "k", p_limit: 10, p_window_seconds: 60 });
    expect(state).toEqual({ allowed: false, resetAt: Date.UTC(2026, 9, 24, 12, 1, 0) });
  });

  it("rejects on RPC errors and malformed rows", async () => {
    const failing = fakeAdmin({ data: null, error: { message: "permission denied" } });
    await expect(createRpcConsumer(failing.client)({ key: "k", limit: 1, windowSeconds: 60 })).rejects.toThrow(
      "consume_rate_limit failed",
    );
    const empty = fakeAdmin({ data: [], error: null });
    await expect(createRpcConsumer(empty.client)({ key: "k", limit: 1, windowSeconds: 60 })).rejects.toThrow(
      "unexpected shape",
    );
  });
});

describe("enforceScanRateLimit", () => {
  it("uses env limits and the in-memory limiter when Supabase isn't configured", async () => {
    const subject = { userId: null, visitorId: "enforce-visitor", ipHash: null };
    for (let i = 0; i < 10; i++) await enforceScanRateLimit(subject);
    const error = await catchError(enforceScanRateLimit(subject));
    expect(error.code).toBe("RATE_LIMITED");
  });

  it("uses the RPC when the admin client exists", async () => {
    const abortSignal = vi.fn(async () => ({
      data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    }));
    const rpc = vi.fn(() => ({ abortSignal }));
    admin.client = { rpc };
    await enforceScanRateLimit({ userId: "user-rpc", visitorId: "v", ipHash: "h" });
    expect(rpc).toHaveBeenCalledTimes(5);
  });
});
