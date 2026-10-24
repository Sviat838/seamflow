import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import type { LeaderboardRow } from "./mappers";
import { getCompanyProfile, getLeaderboard, invalidateLeaderboard, LEADERBOARD_TAG } from "./queries";
import { COMPANY_ID, createFakeAdmin, filterValue, type QueryHandler } from "./testing";

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife, cacheTag: mocks.cacheTag, revalidateTag: mocks.revalidateTag }));

function leaderboardRow(overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    company_id: COMPANY_ID,
    name: "Ballpark Holdings",
    slug: "ballpark-holdings",
    score: 91.3,
    rated_hot_dogs: 12,
    certified_hot_dogs: 11,
    total_scans: 30,
    hot_dog_share: 0.4,
    last_activity: "2026-10-24T10:15:56+00:00",
    ...overrides,
  };
}

function withAdmin(handler?: QueryHandler, rpcResult: { data: unknown; error: unknown } = { data: [], error: null }) {
  const fake = createFakeAdmin(handler);
  fake.rpc.mockResolvedValue(rpcResult);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLeaderboard", () => {
  it("is cached under the leaderboard tag and ranks RPC rows in order", async () => {
    const fake = withAdmin(undefined, {
      data: [leaderboardRow(), leaderboardRow({ name: "Stadium Frank", slug: "stadium-frank", score: 88 })],
      error: null,
    });

    const entries = await getLeaderboard(10);

    expect(mocks.cacheTag).toHaveBeenCalledWith(LEADERBOARD_TAG);
    expect(mocks.cacheLife).toHaveBeenCalledWith("minutes");
    expect(fake.rpc).toHaveBeenCalledWith("get_company_leaderboard", { p_limit: 10 });
    expect(entries.map((e) => [e.rank, e.slug, e.score])).toEqual([
      [1, "ballpark-holdings", 91.3],
      [2, "stadium-frank", 88],
    ]);
  });

  it("clamps the limit to what the RPC allows", async () => {
    const fake = withAdmin();
    await getLeaderboard(1000);
    await getLeaderboard(0);
    await getLeaderboard(Number.NaN);
    expect(fake.rpc.mock.calls.map(([, args]) => args)).toEqual([{ p_limit: 100 }, { p_limit: 1 }, { p_limit: 50 }]);
  });

  it("is empty without a database or when the RPC fails", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    await expect(getLeaderboard()).resolves.toEqual([]);

    withAdmin(undefined, { data: null, error: { message: "timeout" } });
    await expect(getLeaderboard()).resolves.toEqual([]);
  });
});

describe("getCompanyProfile", () => {
  const company = { id: COMPANY_ID, name: "Ballpark Holdings", slug: "ballpark-holdings", created_at: "2026-10-01T08:00:00+00:00" };
  const product = {
    number: "HDX-C-0088301",
    code: "7KQ2-M9XD",
    product_name: "Stadium Frank",
    sku: "SF-001",
    created_at: "2026-10-24T10:15:56+00:00",
    scans: { rating: 94, rating_note: "Textbook bun alignment." },
  };

  function profileAdmin(rows: { company?: unknown; products?: unknown } = {}, leaderboard = [leaderboardRow()]) {
    return withAdmin(
      (query) => {
        if (query.table === "companies") return { data: rows.company === undefined ? company : rows.company, error: null };
        if (query.table === "certificates") return { data: rows.products ?? [product], error: null };
        throw new Error(`unexpected ${query.table}`);
      },
      { data: leaderboard, error: null },
    );
  }

  it("returns a listed company with its rank and valid HOT DOG certificates only", async () => {
    const fake = profileAdmin();

    const profile = await getCompanyProfile("Ballpark-Holdings");

    expect(profile).toEqual({
      name: "Ballpark Holdings",
      slug: "ballpark-holdings",
      memberSince: "2026-10-01T08:00:00.000Z",
      entry: expect.objectContaining({ rank: 1, slug: "ballpark-holdings", score: 91.3 }),
      products: [
        {
          certificateNumber: "HDX-C-0088301",
          code: "7KQ2-M9XD",
          productName: "Stadium Frank",
          sku: "SF-001",
          rating: 94,
          ratingNote: "Textbook bun alignment.",
          issuedAt: "2026-10-24T10:15:56.000Z",
        },
      ],
    });
    const [companyQuery, productQuery] = fake.queries;
    expect(filterValue(companyQuery, "eq", "slug")).toBe("ballpark-holdings");
    expect(filterValue(companyQuery, "eq", "is_listed")).toBe(true);
    expect(filterValue(productQuery, "eq", "status")).toBe("valid");
    expect(filterValue(productQuery, "eq", "scans.company_id")).toBe(COMPANY_ID);
    expect(filterValue(productQuery, "eq", "scans.verdict")).toBe("hot_dog");
    expect(productQuery.filters).toContainEqual(["limit", 50]);
    // Public data only: never case numbers, people or images.
    expect(productQuery.columns).not.toMatch(/case_number|user_id|visitor_id|image|issued_to/);
    expect(mocks.cacheTag).toHaveBeenCalledWith(LEADERBOARD_TAG);
  });

  it("has no entry until the company is ranked", async () => {
    profileAdmin({ products: [] }, []);
    await expect(getCompanyProfile("ballpark-holdings")).resolves.toMatchObject({ entry: null, products: [] });
  });

  it("is null for unlisted or unknown companies and malformed slugs", async () => {
    const fake = profileAdmin({ company: null });
    await expect(getCompanyProfile("ballpark-holdings")).resolves.toBeNull();
    await expect(getCompanyProfile("../etc")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(1);
  });

  it("throws a retryable error when the database fails", async () => {
    withAdmin(() => ({ data: null, error: { message: "boom" } }));
    const error = await getCompanyProfile("ballpark-holdings").catch((e: unknown) => e);
    expect(isAppError(error) && error.code === "INTERNAL" && error.retryable).toBe(true);
  });
});

describe("invalidateLeaderboard", () => {
  it("expires the tag immediately", () => {
    invalidateLeaderboard();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(LEADERBOARD_TAG, { expire: 0 });
  });
});
