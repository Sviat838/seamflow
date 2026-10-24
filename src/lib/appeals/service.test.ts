import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { Classification, Viewer } from "@/lib/types";
import { createFakeAdmin, filterValue, type QueryHandler, type QueryResult, type RecordedQuery } from "./testing";
import { decideAppeal, fileAppeal, getAppealForScan, OVERTURN_REVOCATION_REASON, REVIEW_BOARD } from "./service";

const mocks = vi.hoisted(() => ({
  getViewerContext: vi.fn(),
  getAdminClient: vi.fn(),
  reviewAppeal: vi.fn(),
  recordAuditEvents: vi.fn(),
  revokeCertificate: vi.fn(),
  invalidateLeaderboard: vi.fn(),
  revalidateTag: vi.fn(),
  after: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient, SCANS_BUCKET: "scans" }));
vi.mock("@/lib/ai", () => ({ reviewAppeal: mocks.reviewAppeal }));
vi.mock("@/lib/audit/record", () => ({ recordAuditEvents: mocks.recordAuditEvents }));
vi.mock("@/lib/certificates/service", () => ({ revokeCertificate: mocks.revokeCertificate }));
vi.mock("@/lib/companies/queries", () => ({ invalidateLeaderboard: mocks.invalidateLeaderboard }));
vi.mock("@/lib/scans/queries", () => ({ STATS_TAG: "stats" }));
vi.mock("@/lib/log", () => ({ log: mocks.log }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("next/server", () => ({ after: mocks.after }));

const SCAN_ID = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const APPEAL_ID = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const USER_ID = "0b6a1f3e-8c2d-4e5f-9a7b-1c2d3e4f5a6b";
const OTHER_USER_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const VISITOR_ID = "6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const signedIn: Viewer = {
  isAuthenticated: true,
  userId: USER_ID,
  email: "dana@hooli.test",
  displayName: "Dana Kessler",
  avatarUrl: null,
  jobTitle: null,
  company: null,
  needsOnboarding: true,
};

const ORIGINAL: Classification = {
  verdict: "hot_dog",
  confidence: 0.97,
  summary: "Hot dog confirmed.",
  reasoning: "A sausage in a split bun.",
  detectedItems: ["sausage", "bun"],
  flags: [],
  policyClause: "2.1",
  rating: 88,
  ratingNote: "Textbook bun alignment.",
};

const OVERTURNED: Classification = {
  verdict: "not_hot_dog",
  confidence: 0.94,
  summary: "Sausage roll. Not a hot dog.",
  reasoning: "The sausage is wrapped in laminated pastry, not seated in a bun.",
  detectedItems: ["sausage roll"],
  flags: [],
  policyClause: "3.1",
  rating: null,
  ratingNote: null,
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function scanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SCAN_ID,
    user_id: USER_ID,
    visitor_id: null,
    company_id: null,
    is_public: false,
    verdict: "hot_dog",
    confidence: 0.97,
    summary: "Hot dog confirmed.",
    details: { reasoning: "A sausage in a split bun.", detectedItems: ["sausage", "bun"], flags: [], cached: false },
    policy_clause: "2.1",
    rating: 88,
    rating_note: "Textbook bun alignment.",
    image_path: `${USER_ID}/${SCAN_ID}.jpg`,
    image_deleted_at: null,
    created_at: minutesAgo(30),
    ...overrides,
  };
}

function appealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPEAL_ID,
    scan_id: SCAN_ID,
    status: "pending",
    reason: "That is a sausage roll.",
    ruling: null,
    created_at: minutesAgo(0),
    decided_at: null,
    ...overrides,
  };
}

const ok = (data: unknown): QueryResult => ({ data, error: null });

interface World {
  scan?: Record<string, unknown> | null;
  appeal?: Record<string, unknown> | null;
  insertError?: unknown;
  decided?: boolean;
  scanUpdateError?: unknown;
}

/** Routes each query to a plausible PostgREST answer for one scan and its appeal. */
function db(world: World): QueryHandler {
  const scan = world.scan === undefined ? scanRow() : world.scan;
  const appeal = world.appeal === undefined ? appealRow() : world.appeal;
  return (q: RecordedQuery) => {
    if (q.table === "scans" && q.op === "select") return ok(scan);
    if (q.table === "scans" && q.op === "update") return { data: null, error: world.scanUpdateError ?? null };
    if (q.table === "appeals" && q.op === "insert") {
      return world.insertError ? { data: null, error: world.insertError } : ok(appealRow(q.payload as Record<string, unknown>));
    }
    if (q.table === "appeals" && q.op === "select") return ok(appeal);
    if (q.table === "appeals" && q.op === "update") {
      return ok(q.terminal === "maybeSingle" ? (world.decided === false ? null : { id: APPEAL_ID }) : null);
    }
    return ok(null);
  };
}

let afterCallbacks: Array<() => unknown>;
async function flushAfter() {
  for (const callback of afterCallbacks.splice(0)) await callback();
}

function withDb(world: World = {}, lease = true) {
  const fake = createFakeAdmin(db(world));
  fake.rpc.mockImplementation((_fn, args) => {
    const key = (args as { p_key: string }).p_key;
    const allowed = key.startsWith("appeal:review:") ? lease : true;
    return ok([{ allowed, remaining: 0, reset_at: new Date(Date.now() + 3_600_000).toISOString() }]);
  });
  fake.storage.download.mockResolvedValue(ok(new Blob([JPEG])));
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

const updatesTo = (fake: ReturnType<typeof createFakeAdmin>, table: string) =>
  fake.queries.filter((q) => q.table === table && q.op === "update");
const auditEvents = () =>
  mocks.recordAuditEvents.mock.calls.flatMap(([, events]) => events as Array<{ event: string; actor: string; detail: string }>);

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks = [];
  mocks.after.mockImplementation((callback: () => unknown) => afterCallbacks.push(callback));
  mocks.getViewerContext.mockResolvedValue({ viewer: signedIn, visitorId: VISITOR_ID });
  mocks.recordAuditEvents.mockResolvedValue(undefined);
  mocks.revokeCertificate.mockResolvedValue(undefined);
  mocks.reviewAppeal.mockResolvedValue({
    decision: "overturned",
    ruling: "The item is a sausage roll under §3.1.",
    classification: OVERTURNED,
    model: "claude-fable-5-1",
    latencyMs: 4200,
  });
});

describe("fileAppeal", () => {
  it("files a pending appeal, flags the scan, audits it and schedules the decision", async () => {
    const fake = withDb();

    const view = await fileAppeal(SCAN_ID, "  That is a sausage roll.  ");

    expect(view).toMatchObject({ status: "pending", reason: "That is a sausage roll.", ruling: null, decidedAt: null });
    const insert = fake.queries.find((q) => q.table === "appeals" && q.op === "insert");
    expect(insert?.payload).toEqual({
      scan_id: SCAN_ID,
      user_id: USER_ID,
      visitor_id: null,
      reason: "That is a sausage roll.",
    });
    const [flag] = updatesTo(fake, "scans");
    expect(flag.payload).toEqual({ review_status: "pending" });
    expect(filterValue(flag, "eq", "id")).toBe(SCAN_ID);
    expect(auditEvents()).toEqual([
      {
        event: "appeal_filed",
        actor: "Dana Kessler · Web console",
        detail: 'Human review requested. Reason: "That is a sausage roll."',
      },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: `appeal:1d:u:${USER_ID}`,
      p_limit: 5,
      p_window_seconds: 86_400,
    });
    expect(afterCallbacks).toHaveLength(1);
    expect(mocks.reviewAppeal).not.toHaveBeenCalled();
  });

  it("files for an anonymous owner under the visitor id", async () => {
    mocks.getViewerContext.mockResolvedValue({
      viewer: { ...signedIn, isAuthenticated: false, userId: null, email: null, displayName: null },
      visitorId: VISITOR_ID,
    });
    const fake = withDb({ scan: scanRow({ user_id: null, visitor_id: VISITOR_ID }) });

    await fileAppeal(SCAN_ID, "Hot dog.");

    const insert = fake.queries.find((q) => q.table === "appeals" && q.op === "insert");
    expect(insert?.payload).toMatchObject({ user_id: null, visitor_id: VISITOR_ID });
    expect(auditEvents()[0].actor).toBe("Anonymous visitor · Web console");
  });

  it("quotes a long reason as an excerpt that fits the audit detail", async () => {
    withDb();
    await fileAppeal(SCAN_ID, "b".repeat(1000));
    const { detail } = auditEvents()[0];
    expect(detail.length).toBeLessThanOrEqual(500);
    expect(detail.endsWith(`${"b".repeat(10)}…"`)).toBe(true);
  });

  it("rejects an empty or oversized reason before touching the database", async () => {
    const fake = withDb();
    await expect(fileAppeal(SCAN_ID, "   ")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(fileAppeal(SCAN_ID, "x".repeat(1001))).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fake.queries).toHaveLength(0);
  });

  it("hides another user's private case as NOT_FOUND", async () => {
    const fake = withDb({ scan: scanRow({ user_id: OTHER_USER_ID }) });
    await expect(fileAppeal(SCAN_ID, "Hot dog.")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.queries.some((q) => q.table === "appeals")).toBe(false);
  });

  it("returns FORBIDDEN on someone else's public case", async () => {
    withDb({ scan: scanRow({ user_id: OTHER_USER_ID, is_public: true }) });
    await expect(fileAppeal(SCAN_ID, "Hot dog.")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows one appeal per scan", async () => {
    withDb({ insertError: { code: "23505", message: "duplicate key value violates unique constraint" } });
    const error = await fileAppeal(SCAN_ID, "Hot dog.").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "CONFLICT", message: "This case is already under review." });
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("rate limits appeals per subject", async () => {
    const fake = withDb();
    fake.rpc.mockResolvedValue(ok([{ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 7_200_000).toISOString() }]));
    const error = await fileAppeal(SCAN_ID, "Hot dog.").catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "RATE_LIMITED" });
    expect((error as AppError).retryAfterSeconds).toBeGreaterThan(7000);
    expect(fake.queries.some((q) => q.table === "appeals")).toBe(false);
  });
});

describe("decideAppeal (the Review Board, in after())", () => {
  it("overturns: flips the scan, records the ruling, revokes the certificate and invalidates rankings", async () => {
    const fake = withDb();
    await fileAppeal(SCAN_ID, "That is a sausage roll.");
    vi.clearAllMocks();
    await flushAfter();

    expect(fake.storage.download).toHaveBeenCalledWith(`${USER_ID}/${SCAN_ID}.jpg`);
    expect(mocks.reviewAppeal).toHaveBeenCalledWith({
      bytes: JPEG,
      mimeType: "image/jpeg",
      original: ORIGINAL,
      reason: "That is a sausage roll.",
    });

    const [decision] = updatesTo(fake, "appeals");
    expect(decision.payload).toMatchObject({
      status: "overturned",
      ruling: "The item is a sausage roll under §3.1.",
      reviewer_model: "claude-fable-5-1",
    });
    expect((decision.payload as { decided_at: string }).decided_at).toEqual(expect.any(String));
    expect(filterValue(decision, "eq", "status")).toBe("pending");

    const scanUpdate = updatesTo(fake, "scans").at(-1);
    expect(scanUpdate?.payload).toMatchObject({
      verdict: "not_hot_dog",
      confidence: 0.94,
      summary: "Sausage roll. Not a hot dog.",
      policy_clause: "3.1",
      rating: null,
      rating_note: null,
      review_status: "overturned",
      details: expect.objectContaining({ verdict: "not_hot_dog", policyClause: "3.1", cached: false }),
    });

    expect(auditEvents()).toEqual([
      {
        event: "appeal_overturned",
        actor: REVIEW_BOARD,
        detail:
          "Verdict overturned. Final verdict: NOT HOT DOG at 94.0% confidence under Policy v3.2, §3.1. The item is a sausage roll under §3.1.",
      },
    ]);
    expect(mocks.revokeCertificate).toHaveBeenCalledWith(SCAN_ID, OVERTURN_REVOCATION_REASON);
    expect(mocks.recordAuditEvents.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revokeCertificate.mock.invocationCallOrder[0],
    );
    expect(mocks.invalidateLeaderboard).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("stats", "max");
  });

  it("upholds: keeps the verdict and only records the outcome", async () => {
    const fake = withDb();
    mocks.reviewAppeal.mockResolvedValue({
      decision: "upheld",
      ruling: "A frankfurter seated in a split bun. §2.1 applies.",
      classification: ORIGINAL,
      model: "claude-fable-5-1",
      latencyMs: 3100,
    });

    await decideAppeal(APPEAL_ID);

    expect(updatesTo(fake, "appeals")[0].payload).toMatchObject({ status: "upheld" });
    expect(updatesTo(fake, "scans").map((q) => q.payload)).toEqual([{ review_status: "upheld" }]);
    expect(auditEvents()).toEqual([
      {
        event: "appeal_upheld",
        actor: REVIEW_BOARD,
        detail:
          "Verdict upheld. Final verdict: HOT DOG at 97.0% confidence under Policy v3.2, §2.1. A frankfurter seated in a split bun. §2.1 applies.",
      },
    ]);
    expect(mocks.revokeCertificate).not.toHaveBeenCalled();
    expect(mocks.invalidateLeaderboard).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("leaves the appeal pending when the review fails, without throwing", async () => {
    const fake = withDb();
    mocks.reviewAppeal.mockRejectedValue(new AppError("AI_UNAVAILABLE", "busy"));

    await expect(decideAppeal(APPEAL_ID)).resolves.toBeUndefined();

    expect(updatesTo(fake, "appeals")).toHaveLength(0);
    expect(updatesTo(fake, "scans")).toHaveLength(0);
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
    expect(mocks.log.error).toHaveBeenCalledWith("appeals.review_failed", expect.objectContaining({ appealId: APPEAL_ID }));
  });

  it("reviews the record alone once the image is past retention", async () => {
    const fake = withDb({ scan: scanRow({ created_at: minutesAgo(25 * 60) }) });
    await decideAppeal(APPEAL_ID);
    expect(fake.storage.download).not.toHaveBeenCalled();
    expect(mocks.reviewAppeal).toHaveBeenCalledWith(expect.objectContaining({ bytes: null, mimeType: null }));
  });

  it("reviews the record alone when the image was purged or can't be downloaded", async () => {
    withDb({ scan: scanRow({ image_deleted_at: minutesAgo(1) }) });
    await decideAppeal(APPEAL_ID);
    expect(mocks.reviewAppeal).toHaveBeenLastCalledWith(expect.objectContaining({ bytes: null }));

    const fake = withDb();
    fake.storage.download.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    await decideAppeal(APPEAL_ID);
    expect(mocks.reviewAppeal).toHaveBeenLastCalledWith(expect.objectContaining({ bytes: null, mimeType: null }));
  });

  it("doesn't start a second review while another holds the lease", async () => {
    const fake = withDb({}, false);
    await decideAppeal(APPEAL_ID);
    expect(mocks.reviewAppeal).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(0);
  });

  it("skips appeals that are already decided", async () => {
    withDb({ appeal: appealRow({ status: "upheld" }) });
    await decideAppeal(APPEAL_ID);
    expect(mocks.reviewAppeal).not.toHaveBeenCalled();
  });

  it("drops its decision when a concurrent review decided first", async () => {
    const fake = withDb({ decided: false });
    await decideAppeal(APPEAL_ID);
    expect(updatesTo(fake, "scans")).toHaveLength(0);
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
    expect(mocks.revokeCertificate).not.toHaveBeenCalled();
  });

  it("puts the appeal back to pending when the scan update fails", async () => {
    const fake = withDb({ scanUpdateError: { message: "connection reset" } });
    await decideAppeal(APPEAL_ID);
    const [, revert] = updatesTo(fake, "appeals");
    expect(revert.payload).toEqual({ status: "pending", ruling: null, reviewer_model: null, decided_at: null });
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
    expect(mocks.revokeCertificate).not.toHaveBeenCalled();
  });

  it("keeps the decision when revoking the certificate fails", async () => {
    withDb();
    mocks.revokeCertificate.mockRejectedValue(new Error("db down"));
    await expect(decideAppeal(APPEAL_ID)).resolves.toBeUndefined();
    expect(auditEvents()[0].event).toBe("appeal_overturned");
    expect(mocks.log.error).toHaveBeenCalledWith("appeals.revoke_failed", expect.objectContaining({ scanId: SCAN_ID }));
    expect(mocks.invalidateLeaderboard).toHaveBeenCalled();
  });
});

describe("getAppealForScan", () => {
  it("returns the appeal for the case owner", async () => {
    withDb({ appeal: appealRow({ status: "upheld", ruling: "Upheld.", decided_at: minutesAgo(1) }) });
    const view = await getAppealForScan(SCAN_ID);
    expect(view).toMatchObject({ status: "upheld", ruling: "Upheld.", decidedAt: expect.any(String) });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("re-schedules a decision for an appeal pending over two minutes", async () => {
    withDb({ appeal: appealRow({ created_at: minutesAgo(3) }) });
    expect(await getAppealForScan(SCAN_ID)).toMatchObject({ status: "pending" });
    expect(afterCallbacks).toHaveLength(1);
    await flushAfter();
    expect(mocks.reviewAppeal).toHaveBeenCalledTimes(1);
  });

  it("leaves a fresh pending appeal to the review already running", async () => {
    withDb({ appeal: appealRow({ created_at: minutesAgo(1) }) });
    await getAppealForScan(SCAN_ID);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("is null without an appeal, without access, or without a database", async () => {
    withDb({ appeal: null });
    expect(await getAppealForScan(SCAN_ID)).toBeNull();

    const fake = withDb({ scan: scanRow({ user_id: OTHER_USER_ID }) });
    expect(await getAppealForScan(SCAN_ID)).toBeNull();
    expect(fake.queries.some((q) => q.table === "appeals")).toBe(false);

    mocks.getAdminClient.mockReturnValue(null);
    expect(await getAppealForScan(SCAN_ID)).toBeNull();
  });
});
