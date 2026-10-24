import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer, ViewerCompany } from "@/lib/types";
import { createFakeAdmin, filterValue, type QueryHandler } from "@/lib/appeals/testing";
import { listAuditEvents, listViewerAuditEvents, toAuditEvent, toAuditTimestamp } from "./queries";

const mocks = vi.hoisted(() => ({ getViewerContext: vi.fn(), getAdminClient: vi.fn() }));

vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SCAN_ID = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const USER_ID = "0b6a1f3e-8c2d-4e5f-9a7b-1c2d3e4f5a6b";
const OTHER_USER_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const VISITOR_ID = "6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d";
const COMPANY: ViewerCompany = {
  id: "7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d",
  name: "Hooli",
  slug: "hooli",
  plan: "free",
  role: "owner",
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
const signedIn: Viewer = { ...anonymous, isAuthenticated: true, userId: USER_ID, displayName: "Dana Kessler" };

const eventRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  event: "uploaded",
  actor: "Dana Kessler · Web console",
  detail: "dog.jpg received from Dana Kessler via Web console.",
  occurred_at: "2026-10-24T10:15:56.123456+00:00",
  hash: "a".repeat(64),
  prev_hash: null,
  ...overrides,
});

function asViewer(viewer: Viewer) {
  mocks.getViewerContext.mockResolvedValue({ viewer, visitorId: VISITOR_ID });
}

function withDb(handler: QueryHandler) {
  const fake = createFakeAdmin(handler);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  asViewer(signedIn);
});

describe("toAuditTimestamp", () => {
  it("keeps microseconds in UTC, the precision the chain hash covers", () => {
    expect(toAuditTimestamp("2026-10-24T10:15:56.123456+00:00")).toBe("2026-10-24T10:15:56.123456Z");
    expect(toAuditTimestamp("2026-10-24 10:15:56.1+00")).toBe("2026-10-24T10:15:56.100000Z");
    expect(toAuditTimestamp("2026-10-24T10:15:56Z")).toBe("2026-10-24T10:15:56.000000Z");
  });

  it("converts other offsets through Date, and leaves garbage alone", () => {
    expect(toAuditTimestamp("2026-10-24T12:15:56.5+02:00")).toBe("2026-10-24T10:15:56.500Z");
    expect(toAuditTimestamp("yesterday")).toBe("yesterday");
  });
});

describe("toAuditEvent", () => {
  it("maps a row and skips event types this build doesn't know", () => {
    expect(toAuditEvent(eventRow({ prev_hash: "b".repeat(64) }))).toEqual([
      {
        event: "uploaded",
        actor: "Dana Kessler · Web console",
        detail: "dog.jpg received from Dana Kessler via Web console.",
        occurredAt: "2026-10-24T10:15:56.123456Z",
        hash: "a".repeat(64),
        prevHash: "b".repeat(64),
      },
    ]);
    expect(toAuditEvent(eventRow({ event: "teleported" }))).toEqual([]);
  });
});

describe("listAuditEvents", () => {
  it("returns the case's trail in chain order for its owner", async () => {
    const fake = withDb((q) =>
      q.table === "scans"
        ? { data: { id: SCAN_ID, user_id: USER_ID, visitor_id: null, company_id: null, is_public: false }, error: null }
        : { data: [eventRow(), eventRow({ id: 2, event: "screened", actor: "HDX intake" })], error: null },
    );

    const events = await listAuditEvents(SCAN_ID);

    expect(events.map((e) => e.event)).toEqual(["uploaded", "screened"]);
    const query = fake.queries.find((q) => q.table === "audit_events");
    expect(filterValue(query!, "eq", "scan_id")).toBe(SCAN_ID);
    expect(filterValue(query!, "order", "id")).toEqual({ ascending: true });
  });

  it("is empty for a case the viewer can't open, without reading its events", async () => {
    const fake = withDb(() => ({
      data: { id: SCAN_ID, user_id: OTHER_USER_ID, visitor_id: null, company_id: null, is_public: true },
      error: null,
    }));
    expect(await listAuditEvents(SCAN_ID)).toEqual([]);
    expect(fake.queries.some((q) => q.table === "audit_events")).toBe(false);
  });

  it("is empty for malformed ids or without a database", async () => {
    const fake = withDb(() => ({ data: null, error: null }));
    expect(await listAuditEvents("not-a-uuid")).toEqual([]);
    expect(fake.queries).toHaveLength(0);
    mocks.getAdminClient.mockReturnValue(null);
    expect(await listAuditEvents(SCAN_ID)).toEqual([]);
  });

  it("throws a retryable error when the read fails", async () => {
    withDb((q) =>
      q.table === "scans"
        ? { data: { id: SCAN_ID, user_id: USER_ID, visitor_id: null, company_id: null, is_public: false }, error: null }
        : { data: null, error: { message: "timeout" } },
    );
    await expect(listAuditEvents(SCAN_ID)).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});

describe("listViewerAuditEvents", () => {
  const rows = [{ ...eventRow({ id: 9, event: "classified" }), scans: { case_number: "HDX-2026-1024-7001" } }];

  it("lists the company's and the user's own events newest first, with case numbers", async () => {
    asViewer({ ...signedIn, company: COMPANY, needsOnboarding: false });
    const fake = withDb(() => ({ data: rows, error: null }));

    const events = await listViewerAuditEvents();

    expect(events).toEqual([expect.objectContaining({ event: "classified", caseNumber: "HDX-2026-1024-7001" })]);
    const [query] = fake.queries;
    expect(query.columns).toContain("scans!inner(case_number)");
    expect(query.calls).toContainEqual([
      "or",
      `company_id.eq.${COMPANY.id},user_id.eq.${USER_ID}`,
      { referencedTable: "scans" },
    ]);
    expect(filterValue(query, "order", "id")).toEqual({ ascending: false });
    expect(query.calls).toContainEqual(["limit", 100]);
  });

  it("falls back to the user's own scans, then to the visitor's unclaimed ones", async () => {
    let fake = withDb(() => ({ data: [], error: null }));
    await listViewerAuditEvents({ limit: 5000 });
    expect(filterValue(fake.queries[0], "eq", "scans.user_id")).toBe(USER_ID);
    expect(fake.queries[0].calls).toContainEqual(["limit", 500]);

    asViewer(anonymous);
    fake = withDb(() => ({ data: [], error: null }));
    await listViewerAuditEvents();
    expect(filterValue(fake.queries[0], "eq", "scans.visitor_id")).toBe(VISITOR_ID);
    expect(filterValue(fake.queries[0], "is", "scans.user_id")).toBeNull();
  });

  it("reads the viewer even without a database", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect(await listViewerAuditEvents()).toEqual([]);
    expect(mocks.getViewerContext).toHaveBeenCalled();
  });
});
