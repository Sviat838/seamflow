import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findAccessibleScan: vi.fn(), getFeedSnapshot: vi.fn() }));

vi.mock("@/lib/scans/access", () => ({ findAccessibleScan: mocks.findAccessibleScan }));
vi.mock("@/lib/feed/snapshot", () => ({ getFeedSnapshot: mocks.getFeedSnapshot }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from "./route";

const SNAPSHOT = { items: [], verdictsToday: 0, hotDogShareToday: null, ambiguousAllTime: 0, p50LatencyMs: null, generatedAt: "x" };
const get = (query = "") => GET(new NextRequest(`http://localhost/api/v1/feed${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getFeedSnapshot.mockResolvedValue(SNAPSHOT);
  mocks.findAccessibleScan.mockResolvedValue(null);
});

describe("GET /api/v1/feed", () => {
  it("returns the snapshot, never cached", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(SNAPSHOT);
    expect(mocks.getFeedSnapshot).toHaveBeenCalledWith({ limit: undefined, highlightScanId: null });
    expect(mocks.findAccessibleScan).not.toHaveBeenCalled();
  });

  it("highlights a case the viewer can access", async () => {
    mocks.findAccessibleScan.mockResolvedValue({ row: { id: "scan-1" } });
    await get("?case=HDX-2026-1024-7001&limit=20");
    expect(mocks.findAccessibleScan).toHaveBeenCalledWith("HDX-2026-1024-7001");
    expect(mocks.getFeedSnapshot).toHaveBeenCalledWith({ limit: 20, highlightScanId: "scan-1" });
  });

  it("ignores someone else's case and malformed case numbers", async () => {
    await get("?case=HDX-2026-1024-7002");
    expect(mocks.getFeedSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ highlightScanId: null }));

    await get("?case=not-a-case");
    expect(mocks.findAccessibleScan).toHaveBeenCalledTimes(1);
    expect(mocks.getFeedSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ highlightScanId: null }));
  });
});
