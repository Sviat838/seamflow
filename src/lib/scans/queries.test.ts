import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer, ViewerCompany } from "@/lib/types";
import { decodeCursor, encodeCursor } from "./cursor";
import { getCaseForViewer, getGlobalStats, getPublicScanBySlug, getScanForViewer, listViewerScans } from "./queries";
import {
  CASE_NUMBER,
  certificateRecord,
  COMPANY_ID,
  createFakeAdmin,
  OTHER_USER_ID,
  scanRecord,
  SCAN_ID,
  USER_ID,
  VISITOR_ID,
  type QueryHandler,
} from "./testing";

const mocks = vi.hoisted(() => ({
  getViewerContext: vi.fn(),
  getAdminClient: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient, SCANS_BUCKET: "scans" }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife, cacheTag: mocks.cacheTag }));

const HOOLI: ViewerCompany = {
  id: COMPANY_ID,
  name: "Hooli Foods",
  slug: "hooli-foods",
  plan: "free",
  role: "member",
  isListed: true,
};
const anonymous: Viewer = {
  isAuthenticated: false,
  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  jobTitle: null,
  company: null,
  needsOnboarding: false,
};
const signedIn: Viewer = { ...anonymous, isAuthenticated: true, userId: USER_ID, needsOnboarding: true };
/** Same company as the scans' submitter (USER_ID), but a different person. */
const colleague: Viewer = { ...signedIn, userId: OTHER_USER_ID, company: HOOLI, needsOnboarding: false };
const DAY_AGO = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

function asViewer(viewer: Viewer) {
  mocks.getViewerContext.mockResolvedValue({ viewer, visitorId: VISITOR_ID });
}

function withAdmin(handler: QueryHandler) {
  const fake = createFakeAdmin(handler);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

/** Rows with strictly decreasing timestamps, newest first, like the real ORDER BY. */
function rows(count: number) {
  return Array.from({ length: count }, (_, i) =>
    scanRecord({
      id: `00000000-0000-4000-8000-${String(100 - i).padStart(12, "0")}`,
      created_at: `2026-10-24T10:00:${String(59 - i).padStart(2, "0")}.000001+00:00`,
      image_path: i % 2 === 0 ? `${USER_ID}/${i}.jpg` : null,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  asViewer(signedIn);
});

describe("getScanForViewer", () => {
  it("returns the owner's private scan with a signed image URL", async () => {
    withAdmin(() => ({ data: scanRecord(), error: null }));

    const scan = await getScanForViewer(SCAN_ID);

    expect(scan).toMatchObject({ id: SCAN_ID, isOwner: true, imageUrl: `https://signed.test/${USER_ID}/${SCAN_ID}.jpg` });
  });

  it("hides private scans from everyone else", async () => {
    withAdmin(() => ({ data: scanRecord({ user_id: OTHER_USER_ID }), error: null }));
    expect(await getScanForViewer(SCAN_ID)).toBeNull();
  });

  it("shows public scans to strangers, marked as not theirs, without names", async () => {
    withAdmin(() => ({ data: scanRecord({ user_id: OTHER_USER_ID, is_public: true }), error: null }));
    expect(await getScanForViewer(SCAN_ID)).toMatchObject({
      isOwner: false,
      isPublic: true,
      fileName: null,
      submittedBy: null,
    });
  });

  it("shows a company scan to a colleague, with the submitter's display name and certificate", async () => {
    asViewer(colleague);
    const fake = withAdmin((q) =>
      q.table === "profiles"
        ? { data: [{ id: USER_ID, display_name: "Dana Kessler" }], error: null }
        : { data: scanRecord({ company_id: COMPANY_ID, certificates: certificateRecord() }), error: null },
    );

    const scan = await getScanForViewer(SCAN_ID);

    expect(scan).toMatchObject({
      isOwner: true,
      submittedBy: "Dana Kessler",
      certificate: { number: "HDX-C-0088301", code: "7KQ2-M9XD" },
    });
    expect(fake.queries[0].columns).toContain("certificates(*)");
  });

  it("doesn't sign images past the retention window", async () => {
    const fake = withAdmin(() => ({ data: scanRecord({ created_at: DAY_AGO }), error: null }));

    const scan = await getScanForViewer(SCAN_ID);

    expect(scan).toMatchObject({ imageUrl: null, imageDeleted: true });
    expect(fake.storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns null for garbage ids without querying, and without a database", async () => {
    const fake = withAdmin(() => ({ data: scanRecord(), error: null }));
    expect(await getScanForViewer("'; drop table scans; --")).toBeNull();
    expect(fake.queries).toHaveLength(0);

    mocks.getAdminClient.mockReturnValue(null);
    expect(await getScanForViewer(SCAN_ID)).toBeNull();
  });

  it("surfaces database errors as a retryable INTERNAL error", async () => {
    withAdmin(() => ({ data: null, error: { message: "timeout" } }));
    await expect(getScanForViewer(SCAN_ID)).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});

describe("getCaseForViewer", () => {
  it("returns the owner's case by its number", async () => {
    const fake = withAdmin(() => ({ data: scanRecord(), error: null }));

    const scan = await getCaseForViewer(CASE_NUMBER);

    expect(fake.queries[0].filters).toEqual([["eq", "case_number", CASE_NUMBER]]);
    expect(scan).toMatchObject({ caseNumber: CASE_NUMBER, isOwner: true });
  });

  it("returns a colleague's case to a company member", async () => {
    asViewer(colleague);
    withAdmin((q) =>
      q.table === "profiles" ? { data: [], error: null } : { data: scanRecord({ company_id: COMPANY_ID }), error: null },
    );
    expect(await getCaseForViewer(CASE_NUMBER)).toMatchObject({ isOwner: true, submittedBy: null });
  });

  it("hides cases from everyone else, even public ones", async () => {
    asViewer(colleague);
    withAdmin(() => ({ data: scanRecord({ is_public: true }), error: null }));
    expect(await getCaseForViewer(CASE_NUMBER)).toBeNull();
  });

  it("rejects malformed case numbers without querying", async () => {
    const fake = withAdmin(() => ({ data: scanRecord(), error: null }));
    for (const bad of ["HDX-2026-1024", "hdx-2026-1024-7731", "HDX-2026-1024-7731,id.neq.0", SCAN_ID]) {
      expect(await getCaseForViewer(bad)).toBeNull();
    }
    expect(fake.queries).toHaveLength(0);
  });

  it("surfaces database errors as a retryable INTERNAL error", async () => {
    withAdmin(() => ({ data: null, error: { message: "timeout" } }));
    await expect(getCaseForViewer(CASE_NUMBER)).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});

describe("getPublicScanBySlug", () => {
  it("only looks up public scans", async () => {
    asViewer(anonymous);
    const fake = withAdmin(() => ({ data: scanRecord({ is_public: true }), error: null }));

    const scan = await getPublicScanBySlug("AbCdEfGh_-12");

    expect(fake.queries[0].filters).toEqual([
      ["eq", "share_slug", "AbCdEfGh_-12"],
      ["eq", "is_public", true],
    ]);
    expect(scan).toMatchObject({ isOwner: false, shareSlug: "AbCdEfGh_-12" });
  });

  it("rejects malformed slugs without querying", async () => {
    const fake = withAdmin(() => ({ data: null, error: null }));
    expect(await getPublicScanBySlug("short")).toBeNull();
    expect(await getPublicScanBySlug("AbCdEfGh_-12,is_public.eq.false")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });
});

describe("listViewerScans", () => {
  it("lists a signed-in user's scans by user_id, newest first, with one signing call", async () => {
    const fake = withAdmin(() => ({ data: rows(3), error: null }));

    const result = await listViewerScans();

    const query = fake.queries[0];
    expect(query.filters).toEqual([
      ["eq", "user_id", USER_ID],
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
      ["limit", 21],
    ]);
    expect(result.nextCursor).toBeNull();
    expect(result.scans).toHaveLength(3);
    expect(fake.storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(fake.storage.createSignedUrls.mock.calls[0][0]).toEqual([`${USER_ID}/0.jpg`, `${USER_ID}/2.jpg`]);
    expect(result.scans.map((s) => s.imageUrl)).toEqual([
      `https://signed.test/${USER_ID}/0.jpg`,
      null,
      `https://signed.test/${USER_ID}/2.jpg`,
    ]);
  });

  it("lists a company member's company scans plus their own", async () => {
    asViewer(colleague);
    const fake = withAdmin((q) =>
      q.table === "profiles"
        ? { data: [{ id: USER_ID, display_name: "Dana Kessler" }], error: null }
        : { data: [scanRecord({ company_id: COMPANY_ID }), scanRecord({ id: OTHER_USER_ID, user_id: OTHER_USER_ID })], error: null },
    );

    const result = await listViewerScans();

    expect(fake.queries[0].filters[0]).toEqual(["or", `company_id.eq.${COMPANY_ID},user_id.eq.${OTHER_USER_ID}`]);
    // One batched profile lookup for colleagues; the viewer's own scans need none.
    const lookups = fake.queries.filter((q) => q.table === "profiles");
    expect(lookups).toHaveLength(1);
    expect(lookups[0].filters).toEqual([["in", "id", [USER_ID]]]);
    expect(result.scans.map((s) => [s.isOwner, s.submittedBy])).toEqual([
      [true, "Dana Kessler"],
      [true, null],
    ]);
  });

  it("skips signing images past the retention window", async () => {
    const fake = withAdmin(() => ({
      data: [scanRecord({ created_at: DAY_AGO, image_path: "old.jpg" }), scanRecord({ image_path: "new.jpg" })],
      error: null,
    }));

    const result = await listViewerScans();

    expect(fake.storage.createSignedUrls.mock.calls[0][0]).toEqual(["new.jpg"]);
    expect(result.scans.map((s) => s.imageUrl)).toEqual([null, "https://signed.test/new.jpg"]);
  });

  it("lists an anonymous visitor's unclaimed scans only", async () => {
    asViewer(anonymous);
    const fake = withAdmin(() => ({ data: [], error: null }));

    await listViewerScans({ limit: 5 });

    expect(fake.queries[0].filters.slice(0, 2)).toEqual([
      ["eq", "visitor_id", VISITOR_ID],
      ["is", "user_id", null],
    ]);
    expect(fake.queries[0].filters).toContainEqual(["limit", 6]);
  });

  it("returns a cursor for the next page and applies it as a keyset filter", async () => {
    const fake = withAdmin(() => ({ data: rows(3), error: null }));

    const first = await listViewerScans({ limit: 2 });
    expect(first.scans).toHaveLength(2);
    expect(decodeCursor(first.nextCursor!)).toEqual({ createdAt: rows(3)[1].created_at, id: rows(3)[1].id });

    await listViewerScans({ limit: 2, cursor: first.nextCursor });
    const { createdAt, id } = decodeCursor(first.nextCursor!);
    expect(fake.queries[1].filters).toContainEqual([
      "or",
      `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`,
    ]);
  });

  it("clamps the page size and rejects forged cursors", async () => {
    const fake = withAdmin(() => ({ data: [], error: null }));
    await listViewerScans({ limit: 500 });
    expect(fake.queries[0].filters).toContainEqual(["limit", 51]);

    await expect(listViewerScans({ cursor: "forged" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      listViewerScans({ cursor: encodeCursor({ createdAt: "2026-10-24T10:00:00Z", id: "x),id.gt.(0" }) }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("is empty without a database, but still reads the viewer so pages stay request-time", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect(await listViewerScans()).toEqual({ scans: [], nextCursor: null });
    expect(mocks.getViewerContext).toHaveBeenCalledTimes(1);
  });
});

describe("getGlobalStats", () => {
  it("is tagged for invalidation and maps the RPC result", async () => {
    const fake = withAdmin(() => ({ data: null, error: null }));
    fake.rpc.mockResolvedValueOnce({
      data: [
        {
          total_scans: 12,
          hot_dog_scans: 5,
          not_hot_dog_scans: 7,
          scans_last_24h: 4,
          scans_today: 3,
          hot_dog_scans_today: 2,
          feedback_correct: 9,
          feedback_incorrect: 1,
          p50_latency_ms: 2140,
        },
      ],
      error: null,
    });

    const stats = await getGlobalStats();

    expect(fake.rpc).toHaveBeenCalledWith("get_global_stats");
    expect(mocks.cacheTag).toHaveBeenCalledWith("stats");
    expect(mocks.cacheLife).toHaveBeenCalledWith("minutes");
    expect(stats).toMatchObject({
      totalScans: 12,
      hotDogScans: 5,
      accuracy: 0.9,
      scansToday: 3,
      hotDogScansToday: 2,
      p50LatencyMs: 2140,
    });
  });

  it("returns zeros without a database", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect(await getGlobalStats()).toMatchObject({ totalScans: 0, accuracy: null });
  });

  it("degrades to zeros when the RPC fails, without a short-lived cache profile", async () => {
    const fake = withAdmin(() => ({ data: null, error: null }));
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    expect(await getGlobalStats()).toMatchObject({ totalScans: 0 });
    // "seconds" would make stats a request-time hole and fail builds that prerender them.
    expect(mocks.cacheLife.mock.calls).toEqual([["minutes"]]);
  });
});
