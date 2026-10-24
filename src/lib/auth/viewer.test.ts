import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyRecord, createFakeAdmin, filterValue, type QueryResult } from "@/lib/companies/testing";
import type { Viewer } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  cookieStore: { get: vi.fn(), set: vi.fn() },
  createServerSupabase: vi.fn(),
  getAdminClient: vi.fn(),
  logError: vi.fn(),
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super("NEXT_REDIRECT");
  }
}

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: mocks.logError } }));

import { getViewerContext, requireViewer } from "./viewer";

const USER_ID = "8d1f3a52-6c0e-4b7a-9e2d-5f4c3b2a1e0d";
const VISITOR_ID = "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c34";

function supabaseWithClaims(result: unknown) {
  return { auth: { getClaims: vi.fn(async () => result) } };
}

function signedIn() {
  mocks.createServerSupabase.mockResolvedValue(
    supabaseWithClaims({
      data: { claims: { sub: USER_ID, email: "jian@example.com", user_metadata: { full_name: "Jian Yang" } } },
      error: null,
    }),
  );
}

function withProfile(result: QueryResult) {
  const fake = createFakeAdmin(() => result);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof RedirectError)) throw new Error(`expected a redirect, got ${String(error)}`);
  return error.url;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieStore.get.mockReturnValue({ name: "sf_vid", value: VISITOR_ID });
  mocks.cookieStore.set.mockReset();
  mocks.createServerSupabase.mockResolvedValue(null);
  mocks.getAdminClient.mockReturnValue(null);
});

describe("getViewerContext", () => {
  it("returns an anonymous viewer when Supabase isn't configured", async () => {
    const context = await getViewerContext();
    expect(context.viewer).toMatchObject({ isAuthenticated: false, company: null, needsOnboarding: false });
    expect(context.visitorId).toBe(VISITOR_ID);
  });

  it("returns the verified user with their company from one profiles query", async () => {
    signedIn();
    const fake = withProfile({
      data: { job_title: "QA lead", company_role: "owner", companies: companyRecord() },
      error: null,
    });

    const { viewer } = await getViewerContext();

    expect(viewer).toMatchObject({
      isAuthenticated: true,
      userId: USER_ID,
      displayName: "Jian Yang",
      jobTitle: "QA lead",
      company: { slug: "ballpark-holdings", role: "owner", plan: "free", isListed: true },
      needsOnboarding: false,
    });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]).toMatchObject({ op: "select", table: "profiles", terminal: "maybeSingle" });
    expect(fake.queries[0].columns).toContain("companies(");
    expect(filterValue(fake.queries[0], "eq", "id")).toBe(USER_ID);
  });

  it("needs onboarding when the user has no company or no profile row yet", async () => {
    signedIn();
    withProfile({ data: { job_title: null, company_role: null, companies: null }, error: null });
    expect((await getViewerContext()).viewer).toMatchObject({ company: null, needsOnboarding: true });

    withProfile({ data: null, error: null });
    expect((await getViewerContext()).viewer).toMatchObject({ company: null, needsOnboarding: true });
  });

  it("degrades to no company when the profile read fails", async () => {
    signedIn();
    withProfile({ data: null, error: { message: "boom" } });
    const { viewer } = await getViewerContext();
    expect(viewer).toMatchObject({ isAuthenticated: true, company: null, needsOnboarding: true });
    expect(mocks.logError).toHaveBeenCalledWith("auth.profile_failed", expect.any(Object));
  });

  it("doesn't query profiles for anonymous viewers", async () => {
    mocks.createServerSupabase.mockResolvedValue(supabaseWithClaims({ data: null, error: null }));
    const fake = withProfile({ data: null, error: null });
    expect((await getViewerContext()).viewer.isAuthenticated).toBe(false);
    expect(fake.queries).toHaveLength(0);
  });

  it("is anonymous when there is no session or the token is rejected", async () => {
    mocks.createServerSupabase.mockResolvedValue(supabaseWithClaims({ data: null, error: null }));
    expect((await getViewerContext()).viewer.isAuthenticated).toBe(false);

    mocks.createServerSupabase.mockResolvedValue(supabaseWithClaims({ data: null, error: new Error("bad jwt") }));
    expect((await getViewerContext()).viewer.isAuthenticated).toBe(false);
  });

  it("is anonymous when Auth throws", async () => {
    mocks.createServerSupabase.mockResolvedValue({
      auth: { getClaims: vi.fn().mockRejectedValue(new Error("network")) },
    });
    expect((await getViewerContext()).viewer.isAuthenticated).toBe(false);
  });

  it("creates and sets a visitor id when the cookie is missing or invalid", async () => {
    mocks.cookieStore.get.mockReturnValue({ name: "sf_vid", value: "garbage" });
    const { visitorId } = await getViewerContext();
    expect(visitorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "sf_vid",
      visitorId,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("still returns an id where cookies can't be set (Server Components)", async () => {
    mocks.cookieStore.get.mockReturnValue(undefined);
    mocks.cookieStore.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });
    const { visitorId } = await getViewerContext();
    expect(visitorId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("requireViewer", () => {
  it("sends signed-out viewers to sign-in with a sanitized next", async () => {
    expect(await redirectOf(requireViewer({ next: "/cases/HDX-2026-1024-7731" }))).toBe(
      "/sign-in?next=%2Fcases%2FHDX-2026-1024-7731",
    );
    expect(await redirectOf(requireViewer({ next: "//evil.com" }))).toBe("/sign-in?next=%2F");
    expect(await redirectOf(requireViewer())).toBe("/sign-in?next=%2F");
  });

  it("sends users without a company to onboarding when a company is required", async () => {
    signedIn();
    withProfile({ data: null, error: null });
    expect(await redirectOf(requireViewer({ company: true, next: "/certificates" }))).toBe(
      "/onboarding?next=%2Fcertificates",
    );
  });

  it("lets users without a company through when no company is required", async () => {
    signedIn();
    withProfile({ data: null, error: null });
    const { viewer } = await requireViewer({ next: "/classify" });
    expect(viewer).toMatchObject({ userId: USER_ID, needsOnboarding: true });
  });

  it("returns the context for onboarded users", async () => {
    signedIn();
    withProfile({ data: { job_title: null, company_role: "member", companies: companyRecord() }, error: null });
    const { viewer, visitorId } = await requireViewer({ company: true, next: "/audit" });
    expect((viewer as Viewer).company?.role).toBe("member");
    expect(visitorId).toBe(VISITOR_ID);
  });
});
