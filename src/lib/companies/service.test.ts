import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import type { Viewer, ViewerCompany } from "@/lib/types";
import type { CompanyRecord, ProfileRecord } from "./mappers";
import { completeOnboarding, setCompanyListing } from "./service";
import {
  COMPANY_ID,
  companyRecord,
  createFakeAdmin,
  filterValue,
  uniqueViolation,
  USER_ID,
  type QueryResult,
  type RecordedQuery,
} from "./testing";

const mocks = vi.hoisted(() => ({
  getViewerContext: vi.fn(),
  getAdminClient: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, cacheLife: vi.fn(), cacheTag: vi.fn() }));

const NEW_COMPANY_ID = "7c6b5a49-3827-4615-8a4b-3c2d1e0f9a8b";

const signedIn: Viewer = {
  isAuthenticated: true,
  userId: USER_ID,
  email: "dana@ballparkholdings.com",
  displayName: "Dana Kessler",
  avatarUrl: "https://lh3.googleusercontent.com/a/x",
  jobTitle: null,
  company: null,
  needsOnboarding: true,
};

const ownerCompany: ViewerCompany = {
  id: COMPANY_ID,
  name: "Ballpark Holdings",
  slug: "ballpark-holdings",
  plan: "free",
  role: "owner",
  isListed: true,
};

/** Database state the fake admin answers from. Each test tweaks what it cares about. */
interface World {
  profiles: ProfileRecord[];
  /** Results of successive company inserts; the default inserts succeed. */
  inserts: QueryResult[];
  ownCompanies: (CompanyRecord & { created_by: string })[];
  linkedRows: number;
  attributedScans: number;
  /** Profiles linked to the company an orphan check asks about. */
  orphanMembers: number;
}

let world: World;

function connect() {
  let insertCount = 0;
  let profileReads = 0;
  const nth = <T,>(list: T[], i: number) => list[Math.min(i, list.length - 1)];
  const fake = createFakeAdmin((query: RecordedQuery) => {
    const key = `${query.op} ${query.table}`;
    if (key === "select profiles" && filterValue(query, "eq", "company_id") !== undefined) {
      return { data: null, error: null, count: world.orphanMembers };
    }
    if (key === "select profiles") {
      return { data: nth(world.profiles, profileReads++) ?? null, error: null };
    }
    if (key === "select companies" && filterValue(query, "eq", "created_by") !== undefined) {
      return { data: world.ownCompanies, error: null };
    }
    if (key === "insert companies") {
      const payload = query.payload as { name: string; slug: string };
      return (
        world.inserts[insertCount++] ?? {
          data: companyRecord({ id: NEW_COMPANY_ID, name: payload.name, slug: payload.slug }),
          error: null,
        }
      );
    }
    if (key === "upsert profiles") return { data: null, error: null };
    if (key === "update profiles") {
      return { data: Array.from({ length: world.linkedRows }, () => ({ id: USER_ID })), error: null };
    }
    if (key === "update scans") {
      return { data: Array.from({ length: world.attributedScans }, (_, i) => ({ id: `scan-${i}` })), error: null };
    }
    if (key === "delete companies") return { data: null, error: null };
    throw new Error(`unexpected query: ${key} ${JSON.stringify(query.filters)}`);
  });
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

function find(queries: RecordedQuery[], op: RecordedQuery["op"], table: string) {
  return queries.filter((q) => q.op === op && q.table === table);
}

async function appErrorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!isAppError(error)) throw new Error(`expected an AppError, got ${String(error)}`);
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewerContext.mockResolvedValue({ viewer: signedIn, visitorId: "visitor" });
  world = {
    profiles: [{ job_title: null, company_role: null, companies: null }],
    inserts: [],
    ownCompanies: [],
    linkedRows: 1,
    attributedScans: 0,
    orphanMembers: 0,
  };
});

describe("completeOnboarding", () => {
  it("creates a company with the user as owner", async () => {
    const fake = connect();
    world.attributedScans = 2;

    const result = await completeOnboarding({ companyName: "  Ballpark  Holdings ", jobTitle: " QA lead " });

    expect(result).toEqual({
      kind: "created",
      company: { ...ownerCompany, id: NEW_COMPANY_ID },
    });
    const [insert] = find(fake.queries, "insert", "companies");
    expect(insert.payload).toEqual({
      name: "Ballpark Holdings",
      slug: "ballpark-holdings",
      created_by: USER_ID,
    });
    const [ensure] = find(fake.queries, "upsert", "profiles");
    expect(ensure.payload).toEqual({ id: USER_ID, display_name: "Dana Kessler", avatar_url: signedIn.avatarUrl });
    expect(ensure.options).toEqual({ onConflict: "id", ignoreDuplicates: true });
    const [link] = find(fake.queries, "update", "profiles");
    expect(link.payload).toEqual({ company_id: NEW_COMPANY_ID, company_role: "owner", job_title: "QA lead" });
    expect(filterValue(link, "is", "company_id")).toBeNull();
    const [attribute] = find(fake.queries, "update", "scans");
    expect(attribute.payload).toEqual({ company_id: NEW_COMPANY_ID });
    expect(filterValue(attribute, "eq", "user_id")).toBe(USER_ID);
    expect(filterValue(attribute, "is", "company_id")).toBeNull();
    // Attributed scans can move a listed company on the leaderboard.
    expect(mocks.revalidateTag).toHaveBeenCalledWith("leaderboard", { expire: 0 });
  });

  it.each(["companies_name_key", "companies_slug_key"])("returns CONFLICT when %s is taken by another account", async (constraint) => {
    const fake = connect();
    world.inserts = [{ data: null, error: uniqueViolation(constraint) }];

    const error = await appErrorOf(completeOnboarding({ companyName: "ballpark holdings" }));

    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("This company name is already registered. Please choose another.");
    expect(find(fake.queries, "update", "profiles")).toHaveLength(0);
  });

  it("is idempotent once onboarded", async () => {
    const fake = connect();
    world.profiles = [{ job_title: "CEO", company_role: "owner", companies: companyRecord() }];

    await expect(completeOnboarding({ companyName: "Something Else" })).resolves.toEqual({
      kind: "created",
      company: ownerCompany,
    });
    expect(find(fake.queries, "insert", "companies")).toHaveLength(0);
    expect(find(fake.queries, "update", "profiles")).toHaveLength(0);
    // Stray scans (claimed before the link) still get attributed.
    expect(find(fake.queries, "update", "scans")).toHaveLength(1);
  });

  describe("concurrent registrations", () => {
    it("treats the user's own double submit as their company, not a conflict", async () => {
      const fake = connect();
      world.inserts = [{ data: null, error: uniqueViolation("companies_name_key") }];
      world.ownCompanies = [{ ...companyRecord(), created_by: USER_ID }];

      const result = await completeOnboarding({ companyName: "BALLPARK HOLDINGS" });

      expect(result).toEqual({ kind: "created", company: ownerCompany });
      expect(find(fake.queries, "delete", "companies")).toHaveLength(0);
    });

    it("deletes its own company and returns the winner when the profile was linked concurrently", async () => {
      const fake = connect();
      world.linkedRows = 0;
      world.profiles = [
        { job_title: null, company_role: null, companies: null },
        { job_title: null, company_role: "owner", companies: companyRecord() },
      ];

      const result = await completeOnboarding({ companyName: "Ballpark Holdings 2" });

      expect(result).toEqual({ kind: "created", company: ownerCompany });
      const [removed] = find(fake.queries, "delete", "companies");
      expect(filterValue(removed, "eq", "id")).toBe(NEW_COMPANY_ID);
      expect(find(fake.queries, "update", "scans")).toHaveLength(0);
    });

    it("keeps the company it inserted when its own double submit adopted it", async () => {
      const fake = connect();
      world.linkedRows = 0;
      world.profiles = [
        { job_title: null, company_role: null, companies: null },
        { job_title: null, company_role: "owner", companies: companyRecord({ id: NEW_COMPANY_ID }) },
      ];

      const result = await completeOnboarding({ companyName: "Ballpark Holdings" });

      expect(result.company.id).toBe(NEW_COMPANY_ID);
      expect(find(fake.queries, "delete", "companies")).toHaveLength(0);
    });

    it("keeps an unlinked company that someone else joined meanwhile", async () => {
      const fake = connect();
      world.linkedRows = 0;
      world.orphanMembers = 1;
      world.profiles = [
        { job_title: null, company_role: null, companies: null },
        { job_title: null, company_role: "owner", companies: companyRecord() },
      ];

      await completeOnboarding({ companyName: "Ballpark Holdings 2" });

      expect(find(fake.queries, "delete", "companies")).toHaveLength(0);
    });

  });

  it("requires sign-in", async () => {
    connect();
    mocks.getViewerContext.mockResolvedValue({
      viewer: { ...signedIn, isAuthenticated: false, userId: null, needsOnboarding: false },
      visitorId: "visitor",
    });
    expect((await appErrorOf(completeOnboarding({ companyName: "Acme" }))).code).toBe("UNAUTHORIZED");
  });

  it("validates before touching the database", async () => {
    const fake = connect();
    const error = await appErrorOf(completeOnboarding({ companyName: " x " }));
    expect(error.code).toBe("INVALID_REQUEST");
    expect(fake.queries).toHaveLength(0);
  });

  it("fails with a retryable error when the database fails", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect((await appErrorOf(completeOnboarding({ companyName: "Acme" }))).code).toBe("INTERNAL");

    connect();
    world.inserts = [{ data: null, error: { code: "08006", message: "connection lost" } as never }];
    const error = await appErrorOf(completeOnboarding({ companyName: "Acme" }));
    expect(error.code).toBe("INTERNAL");
    expect(error.retryable).toBe(true);
  });

  it("never reads or writes an email domain, and never checks the auth record", async () => {
    const fake = connect();
    await completeOnboarding({ companyName: "Ballpark Holdings" });
    expect(fake.getUserById).not.toHaveBeenCalled();
    expect(fake.queries.some((q) => JSON.stringify(q).includes("email_domain"))).toBe(false);
  });

  it("still succeeds when attributing scans fails", async () => {
    const fake = createFakeAdmin((query) => {
      if (query.op === "select" && query.table === "profiles") return { data: null, error: null };
      if (query.op === "select") return { data: [], error: null };
      if (query.op === "insert") return { data: companyRecord({ id: NEW_COMPANY_ID }), error: null };
      if (query.op === "update" && query.table === "profiles") return { data: [{ id: USER_ID }], error: null };
      if (query.op === "update" && query.table === "scans") return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    });
    mocks.getAdminClient.mockReturnValue(fake.client);

    await expect(completeOnboarding({ companyName: "Ballpark Holdings" })).resolves.toMatchObject({ kind: "created" });
  });
});

describe("setCompanyListing", () => {
  function asViewer(company: ViewerCompany | null) {
    mocks.getViewerContext.mockResolvedValue({
      viewer: { ...signedIn, company, needsOnboarding: company === null },
      visitorId: "visitor",
    });
  }

  it("lets the owner unlist the company and expires the leaderboard", async () => {
    asViewer(ownerCompany);
    const fake = createFakeAdmin(() => ({ data: companyRecord({ is_listed: false }), error: null }));
    mocks.getAdminClient.mockReturnValue(fake.client);

    await expect(setCompanyListing(false)).resolves.toEqual({ ...ownerCompany, isListed: false });
    expect(fake.queries[0]).toMatchObject({ op: "update", table: "companies", payload: { is_listed: false } });
    expect(filterValue(fake.queries[0], "eq", "id")).toBe(COMPANY_ID);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("leaderboard", { expire: 0 });
  });

  it("is owner only", async () => {
    asViewer({ ...ownerCompany, role: "member" });
    const fake = createFakeAdmin();
    mocks.getAdminClient.mockReturnValue(fake.client);

    expect((await appErrorOf(setCompanyListing(false))).code).toBe("FORBIDDEN");
    expect(fake.queries).toHaveLength(0);
  });

  it("needs a company and a boolean", async () => {
    asViewer(null);
    expect((await appErrorOf(setCompanyListing(true))).code).toBe("FORBIDDEN");
    expect((await appErrorOf(setCompanyListing("no" as unknown as boolean))).code).toBe("INVALID_REQUEST");
  });
});
