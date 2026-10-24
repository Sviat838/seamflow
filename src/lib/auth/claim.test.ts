import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANY_ID, createFakeAdmin, filterValue, type QueryHandler } from "@/lib/companies/testing";

const mocks = vi.hoisted(() => ({ getAdminClient: vi.fn(), logError: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: mocks.logError } }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, cacheLife: vi.fn(), cacheTag: vi.fn() }));

import { claimVisitorScans } from "./claim";

const USER_ID = "8d1f3a52-6c0e-4b7a-9e2d-5f4c3b2a1e0d";
const VISITOR_ID = "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c34";

const claimed = { data: [{ id: "a" }, { id: "b" }], error: null };

function withAdmin(handler: QueryHandler) {
  const fake = createFakeAdmin(handler);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

function updates(fake: ReturnType<typeof createFakeAdmin>) {
  return fake.queries.filter((q) => q.op === "update" && q.table === "scans");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimVisitorScans", () => {
  it("assigns unowned visitor scans to the user and returns the count", async () => {
    const fake = withAdmin(() => claimed);

    await expect(claimVisitorScans(USER_ID, VISITOR_ID, null)).resolves.toBe(2);
    const [update] = updates(fake);
    expect(update.payload).toEqual({ user_id: USER_ID });
    expect(filterValue(update, "eq", "visitor_id")).toBe(VISITOR_ID);
    expect(filterValue(update, "is", "user_id")).toBeNull();
    // Scans without a company don't touch the leaderboard; no profile lookup when the caller knows.
    expect(fake.queries.some((q) => q.table === "profiles")).toBe(false);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("also attributes the scans to the user's company and expires the leaderboard", async () => {
    const fake = withAdmin(() => claimed);

    await expect(claimVisitorScans(USER_ID, VISITOR_ID, COMPANY_ID)).resolves.toBe(2);
    expect(updates(fake)[0].payload).toEqual({ user_id: USER_ID, company_id: COMPANY_ID });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("leaderboard", { expire: 0 });
  });

  it("looks the company up when the caller doesn't pass it", async () => {
    const fake = withAdmin((query) =>
      query.table === "profiles" ? { data: { company_id: COMPANY_ID }, error: null } : claimed,
    );

    await claimVisitorScans(USER_ID, VISITOR_ID);
    expect(filterValue(fake.queries[0], "eq", "id")).toBe(USER_ID);
    expect(updates(fake)[0].payload).toEqual({ user_id: USER_ID, company_id: COMPANY_ID });
  });

  it("still claims the scans when the company lookup fails", async () => {
    const fake = withAdmin((query) => (query.table === "profiles" ? { data: null, error: { message: "boom" } } : claimed));

    await expect(claimVisitorScans(USER_ID, VISITOR_ID)).resolves.toBe(2);
    expect(updates(fake)[0].payload).toEqual({ user_id: USER_ID });
  });

  it("is a no-op without the admin client", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    await expect(claimVisitorScans(USER_ID, VISITOR_ID)).resolves.toBe(0);
  });

  it("skips malformed ids without querying", async () => {
    const fake = withAdmin(() => claimed);
    await expect(claimVisitorScans(USER_ID, "nope")).resolves.toBe(0);
    expect(fake.queries).toHaveLength(0);
  });

  it("logs and returns 0 on a database error", async () => {
    withAdmin(() => ({ data: null, error: { message: "boom" } }));
    await expect(claimVisitorScans(USER_ID, VISITOR_ID, null)).resolves.toBe(0);
    expect(mocks.logError).toHaveBeenCalledWith("auth.claim_scans_failed", expect.any(Object));
  });

  it("never throws, even if the client does", async () => {
    withAdmin(() => Promise.reject(new Error("network down")));
    await expect(claimVisitorScans(USER_ID, VISITOR_ID, null)).resolves.toBe(0);
    expect(mocks.logError).toHaveBeenCalled();
  });
});
