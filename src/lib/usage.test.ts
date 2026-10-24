import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANY_ID, createFakeAdmin, USER_ID, VISITOR_ID, type QueryHandler } from "@/lib/scans/testing";
import { FREE_CLASSIFICATION_LIMIT, type Viewer, type ViewerCompany } from "@/lib/types";
import { assertWithinQuota, getUsage } from "./usage";

const mocks = vi.hoisted(() => ({
  getViewerContext: vi.fn(),
  getAdminClient: vi.fn(),
}));

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
const notOnboarded: Viewer = { ...anonymous, isAuthenticated: true, userId: USER_ID, needsOnboarding: true };
const company = (plan: ViewerCompany["plan"]): ViewerCompany => ({
  id: COMPANY_ID,
  name: "Hooli Foods",
  slug: "hooli-foods",
  plan,
  role: "member",
  isListed: true,
});
const member = (plan: ViewerCompany["plan"]): Viewer => ({ ...notOnboarded, company: company(plan), needsOnboarding: false });
const ctx = (viewer: Viewer) => ({ viewer, visitorId: VISITOR_ID });

function withCount(count: number | null, error: unknown = null) {
  const handler: QueryHandler = () => ({ data: null, error, count });
  const fake = createFakeAdmin(handler);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUsage", () => {
  it("counts an anonymous visitor's unclaimed scans with a head-only count", async () => {
    const fake = withCount(7);

    expect(await getUsage(ctx(anonymous))).toEqual({ plan: "anonymous", used: 7, limit: 20, remaining: 13 });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]).toMatchObject({
      table: "scans",
      op: "select",
      options: { count: "exact", head: true },
      filters: [
        ["eq", "visitor_id", VISITOR_ID],
        ["is", "user_id", null],
      ],
    });
  });

  it("counts per user before onboarding, and per company after", async () => {
    const fake = withCount(3);

    expect(await getUsage(ctx(notOnboarded))).toEqual({ plan: "free", used: 3, limit: 20, remaining: 17 });
    expect(fake.queries[0].filters).toEqual([["eq", "user_id", USER_ID]]);

    expect(await getUsage(ctx(member("free")))).toMatchObject({ plan: "free", used: 3 });
    expect(fake.queries[1].filters).toEqual([["eq", "company_id", COMPANY_ID]]);
  });

  it("shows Business as unlimited", async () => {
    withCount(250);
    expect(await getUsage(ctx(member("business")))).toEqual({
      plan: "business",
      used: 250,
      limit: null,
      remaining: null,
    });
  });

  it("never reports negative remaining", async () => {
    withCount(FREE_CLASSIFICATION_LIMIT + 4);
    expect(await getUsage(ctx(notOnboarded))).toMatchObject({ used: 24, remaining: 0 });
  });

  it("reads the viewer itself when no context is passed", async () => {
    withCount(1);
    mocks.getViewerContext.mockResolvedValue(ctx(anonymous));
    expect(await getUsage()).toMatchObject({ plan: "anonymous", used: 1 });
    expect(mocks.getViewerContext).toHaveBeenCalledTimes(1);
  });

  it("reads as untouched without a database", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect(await getUsage(ctx(anonymous))).toEqual({ plan: "anonymous", used: 0, limit: 20, remaining: 20 });
    expect(await getUsage(ctx(notOnboarded))).toEqual({ plan: "free", used: 0, limit: 20, remaining: 20 });
  });

  it("fails with a retryable INTERNAL error when the count can't be read", async () => {
    withCount(null, { message: "timeout" });
    await expect(getUsage(ctx(anonymous))).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});

describe("assertWithinQuota", () => {
  it("allows the last free classification and blocks the one after", async () => {
    withCount(FREE_CLASSIFICATION_LIMIT - 1);
    await expect(assertWithinQuota(ctx(member("free")))).resolves.toBeUndefined();

    withCount(FREE_CLASSIFICATION_LIMIT);
    await expect(assertWithinQuota(ctx(member("free")))).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      status: 402,
      message: expect.stringContaining("Business plan"),
    });
  });

  it("tells anonymous visitors they can sign in", async () => {
    withCount(FREE_CLASSIFICATION_LIMIT);
    await expect(assertWithinQuota(ctx(anonymous))).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      message: expect.stringContaining("Sign in"),
    });
  });

  it("never counts for Business plans", async () => {
    const fake = withCount(10_000);
    await expect(assertWithinQuota(ctx(member("business")))).resolves.toBeUndefined();
    expect(fake.queries).toHaveLength(0);
  });

  it("doesn't block without a database or when the count fails", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    await expect(assertWithinQuota(ctx(anonymous))).resolves.toBeUndefined();

    withCount(null, { message: "timeout" });
    await expect(assertWithinQuota(ctx(anonymous))).resolves.toBeUndefined();
  });
});
