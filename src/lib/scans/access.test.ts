import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/types";
import { findAccessibleScan, loadAccessibleScan, viewerLabel } from "./access";
import {
  CASE_NUMBER,
  COMPANY_ID,
  createFakeAdmin,
  OTHER_USER_ID,
  scanRecord,
  SCAN_ID,
  USER_ID,
  VISITOR_ID,
  type QueryHandler,
} from "./testing";

const mocks = vi.hoisted(() => ({ getViewerContext: vi.fn(), getAdminClient: vi.fn() }));

vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient, SCANS_BUCKET: "scans" }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

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
const colleague: Viewer = {
  ...anonymous,
  isAuthenticated: true,
  userId: OTHER_USER_ID,
  company: { id: COMPANY_ID, name: "Hooli Foods", slug: "hooli-foods", plan: "free", role: "member", isListed: true },
};

function asViewer(viewer: Viewer) {
  mocks.getViewerContext.mockResolvedValue({ viewer, visitorId: VISITOR_ID });
}

function withAdmin(handler: QueryHandler) {
  const fake = createFakeAdmin(handler);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  asViewer(colleague);
});

describe("loadAccessibleScan", () => {
  it("loads by id or case number and reports how the viewer has access", async () => {
    const fake = withAdmin(() => ({ data: scanRecord({ company_id: COMPANY_ID }), error: null }));

    const byCase = await loadAccessibleScan(CASE_NUMBER);
    expect(fake.queries[0].filters).toEqual([["eq", "case_number", CASE_NUMBER]]);
    expect(byCase.access).toEqual({ isOwner: false, isCompanyMember: true, canManage: true });
    expect(byCase.ctx.viewer).toBe(colleague);

    await loadAccessibleScan(SCAN_ID);
    expect(fake.queries[1].filters).toEqual([["eq", "id", SCAN_ID]]);
  });

  it("can require the submitter themselves", async () => {
    withAdmin(() => ({ data: scanRecord({ company_id: COMPANY_ID }), error: null }));
    await expect(loadAccessibleScan(SCAN_ID, { require: "owner" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    withAdmin(() => ({ data: scanRecord({ company_id: COMPANY_ID, is_public: true }), error: null }));
    await expect(loadAccessibleScan(SCAN_ID, { require: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    withAdmin(() => ({ data: scanRecord({ user_id: OTHER_USER_ID }), error: null }));
    await expect(loadAccessibleScan(SCAN_ID, { require: "owner" })).resolves.toMatchObject({
      access: { isOwner: true },
    });
  });

  it("hides private scans of other companies and garbage refs, without querying for garbage", async () => {
    const fake = withAdmin(() => ({ data: scanRecord({ user_id: USER_ID, company_id: null }), error: null }));
    await expect(loadAccessibleScan(SCAN_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(loadAccessibleScan("HDX-1,id.neq.0")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.queries).toHaveLength(1);

    mocks.getAdminClient.mockReturnValue(null);
    await expect(loadAccessibleScan(SCAN_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("surfaces read failures as a retryable INTERNAL error", async () => {
    withAdmin(() => ({ data: null, error: { message: "timeout" } }));
    await expect(loadAccessibleScan(SCAN_ID)).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
    await expect(findAccessibleScan(SCAN_ID)).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("findAccessibleScan", () => {
  it("returns null instead of NOT_FOUND or FORBIDDEN", async () => {
    withAdmin(() => ({ data: scanRecord({ is_public: true }), error: null }));
    expect(await findAccessibleScan(SCAN_ID)).toBeNull();
    withAdmin(() => ({ data: null, error: null }));
    expect(await findAccessibleScan(SCAN_ID)).toBeNull();
  });
});

describe("viewerLabel", () => {
  it("prefers the display name, then email, then the viewer's role", () => {
    expect(viewerLabel({ ...colleague, displayName: "Sam Ortiz", email: "sam@hooli.test" })).toBe("Sam Ortiz");
    expect(viewerLabel({ ...colleague, email: "sam@hooli.test" })).toBe("sam@hooli.test");
    expect(viewerLabel(colleague)).toBe("Signed-in user");
    expect(viewerLabel(anonymous)).toBe("Anonymous visitor");
  });
});
