import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalStats } from "@/lib/types";
import { createFakeAdmin, filterValue } from "@/lib/appeals/testing";
import { buildFeedSnapshot, feedKey, getFeedSnapshot, type FeedRow } from "./snapshot";

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getGlobalStats: vi.fn(),
  env: { APP_SECRET: "test-secret" as string | undefined },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/scans/queries", () => ({ getGlobalStats: mocks.getGlobalStats }));
vi.mock("@/lib/env", () => ({ serverEnv: () => mocks.env }));
vi.mock("@/lib/log", () => ({ log: mocks.log }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

const ID_A = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const ID_B = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const NOW = new Date("2026-10-24T12:00:00.000Z");

const rows: FeedRow[] = [
  { id: ID_A, created_at: "2026-10-24T11:59:58.123456+00:00", region: "EU-C", verdict: "hot_dog", confidence: 0.991 },
  { id: ID_B, created_at: "2026-10-24T11:59:40+00:00", region: null, verdict: "not_hot_dog", confidence: 1.2 },
];

const stats: GlobalStats = {
  totalScans: 900,
  hotDogScans: 400,
  notHotDogScans: 500,
  scansLast24h: 120,
  feedbackCorrect: 0,
  feedbackIncorrect: 0,
  accuracy: null,
  scansToday: 80,
  hotDogScansToday: 30,
  p50LatencyMs: 1840,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.APP_SECRET = "test-secret";
  mocks.getGlobalStats.mockResolvedValue(stats);
});

describe("buildFeedSnapshot", () => {
  it("maps rows to anonymised items with today's counters", () => {
    const snapshot = buildFeedSnapshot(rows, stats, { highlightScanId: null, now: NOW, keyFor: (id) => `k-${id.slice(0, 4)}` });
    expect(snapshot).toEqual({
      items: [
        { key: "k-3e7f", time: "2026-10-24T11:59:58.123Z", region: "EU-C", verdict: "hot_dog", confidence: 0.991, highlight: false },
        { key: "k-9d8c", time: "2026-10-24T11:59:40.000Z", region: null, verdict: "not_hot_dog", confidence: 1, highlight: false },
      ],
      verdictsToday: 80,
      hotDogShareToday: 0.375,
      ambiguousAllTime: 0,
      p50LatencyMs: 1840,
      generatedAt: NOW.toISOString(),
    });
  });

  it("highlights only the viewer's own scan", () => {
    const { items } = buildFeedSnapshot(rows, stats, { highlightScanId: ID_B, now: NOW });
    expect(items.map((item) => item.highlight)).toEqual([false, true]);
  });

  it("never exposes scan ids", () => {
    const snapshot = buildFeedSnapshot(rows, stats, { highlightScanId: ID_A, now: NOW });
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain(ID_A);
    expect(json).not.toContain(ID_B);
    expect(Object.keys(snapshot.items[0]).sort()).toEqual(["confidence", "highlight", "key", "region", "time", "verdict"]);
  });

  it("has no share and zero counters without verdicts or a database", () => {
    expect(buildFeedSnapshot([], { ...stats, scansToday: 0, hotDogScansToday: 0 }, { highlightScanId: null, now: NOW }))
      .toMatchObject({ verdictsToday: 0, hotDogShareToday: null });
    expect(buildFeedSnapshot([], null, { highlightScanId: null, now: NOW })).toEqual({
      items: [],
      verdictsToday: 0,
      hotDogShareToday: null,
      ambiguousAllTime: 0,
      p50LatencyMs: null,
      generatedAt: NOW.toISOString(),
    });
  });
});

describe("feedKey", () => {
  it("is short, stable per scan and different across scans", () => {
    expect(feedKey(ID_A)).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(feedKey(ID_A)).toBe(feedKey(ID_A));
    expect(feedKey(ID_A)).not.toBe(feedKey(ID_B));
  });

  it("depends on APP_SECRET, so keys can't be recomputed from an id", () => {
    const withSecret = feedKey(ID_A);
    mocks.env.APP_SECRET = "another-secret";
    expect(feedKey(ID_A)).not.toBe(withSecret);
  });
});

describe("getFeedSnapshot", () => {
  it("reads the latest scans (default 12) with only the feed columns", async () => {
    const fake = createFakeAdmin(() => ({ data: rows, error: null }));
    mocks.getAdminClient.mockReturnValue(fake.client);

    const snapshot = await getFeedSnapshot({ highlightScanId: ID_A });

    const [query] = fake.queries;
    expect(query.columns).toBe("id, created_at, region, verdict, confidence");
    expect(filterValue(query, "order", "created_at")).toEqual({ ascending: false });
    expect(query.calls).toContainEqual(["limit", 12]);
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0].highlight).toBe(true);
    expect(snapshot.verdictsToday).toBe(80);
  });

  it("clamps the limit to 1..50", async () => {
    const fake = createFakeAdmin(() => ({ data: [], error: null }));
    mocks.getAdminClient.mockReturnValue(fake.client);
    await getFeedSnapshot({ limit: 500 });
    await getFeedSnapshot({ limit: 0 });
    await getFeedSnapshot({ limit: Number.NaN });
    expect(fake.queries.map((q) => q.calls.find(([name]) => name === "limit"))).toEqual([
      ["limit", 50],
      ["limit", 1],
      ["limit", 12],
    ]);
  });

  it("returns empty items and zeros without a database", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect(await getFeedSnapshot()).toMatchObject({ items: [], verdictsToday: 0, hotDogShareToday: null, p50LatencyMs: null });
    expect(mocks.getGlobalStats).not.toHaveBeenCalled();
  });

  it("degrades to an empty list (stats kept) when the read fails", async () => {
    const fake = createFakeAdmin(() => ({ data: null, error: { message: "timeout" } }));
    mocks.getAdminClient.mockReturnValue(fake.client);
    expect(await getFeedSnapshot()).toMatchObject({ items: [], verdictsToday: 80 });
    expect(mocks.log.error).toHaveBeenCalledWith("feed.read_failed", { error: "timeout" });
  });
});
