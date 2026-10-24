import { describe, expect, it } from "vitest";
import { feedUrl, nextPollDelay, parseFeedSnapshot } from "./feed-polling";

const item = { key: "a1", time: "2026-10-24T14:32:07Z", region: "EU-C", verdict: "hot_dog", confidence: 0.992, highlight: true };
const snapshot = {
  items: [item],
  verdictsToday: 42,
  hotDogShareToday: 0.31,
  ambiguousAllTime: 0,
  p50LatencyMs: 412,
  generatedAt: "2026-10-24T14:32:08Z",
};

describe("nextPollDelay", () => {
  it("uses the base interval without failures", () => {
    expect(nextPollDelay(0)).toBe(5000);
    expect(nextPollDelay(-1, 1000)).toBe(1000);
  });

  it("doubles per failure and caps", () => {
    expect(nextPollDelay(1)).toBe(10_000);
    expect(nextPollDelay(2)).toBe(20_000);
    expect(nextPollDelay(3)).toBe(40_000);
    expect(nextPollDelay(4)).toBe(60_000);
    expect(nextPollDelay(500)).toBe(60_000);
  });
});

describe("feedUrl", () => {
  it("adds the case number when given", () => {
    expect(feedUrl()).toBe("/api/v1/feed");
    expect(feedUrl(null)).toBe("/api/v1/feed");
    expect(feedUrl("HDX-2026-1024-7731")).toBe("/api/v1/feed?case=HDX-2026-1024-7731");
    expect(feedUrl("a b&c")).toBe("/api/v1/feed?case=a%20b%26c");
  });
});

describe("parseFeedSnapshot", () => {
  it("accepts a bare snapshot", () => {
    expect(parseFeedSnapshot(snapshot)).toEqual(snapshot);
  });

  it("accepts a { feed } wrapper", () => {
    expect(parseFeedSnapshot({ feed: snapshot })?.verdictsToday).toBe(42);
  });

  it("drops malformed rows and normalises fields", () => {
    const parsed = parseFeedSnapshot({
      ...snapshot,
      items: [item, { ...item, key: "b", verdict: "maybe" }, { ...item, key: "c", region: 7, highlight: "yes" }, null],
      hotDogShareToday: "lots",
      p50LatencyMs: null,
      ambiguousAllTime: 3,
    });
    expect(parsed?.items.map((i) => i.key)).toEqual(["a1", "c"]);
    expect(parsed?.items[1]).toMatchObject({ region: null, highlight: false });
    expect(parsed?.hotDogShareToday).toBeNull();
    expect(parsed?.p50LatencyMs).toBeNull();
    // The product has never issued a third answer.
    expect(parsed?.ambiguousAllTime).toBe(0);
  });

  it("rejects unusable payloads", () => {
    expect(parseFeedSnapshot(null)).toBeNull();
    expect(parseFeedSnapshot({ error: { code: "INTERNAL" } })).toBeNull();
    expect(parseFeedSnapshot({ items: [], verdictsToday: "many" })).toBeNull();
  });
});
