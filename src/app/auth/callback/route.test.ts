import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  claimVisitorScans: vi.fn(),
  getAdminClient: vi.fn(),
  readCompanyId: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/auth/claim", () => ({ claimVisitorScans: mocks.claimVisitorScans }));
vi.mock("@/lib/companies/profile", () => ({ readCompanyId: mocks.readCompanyId }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({}) }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from "./route";

const USER_ID = "8d1f3a52-6c0e-4b7a-9e2d-5f4c3b2a1e0d";
const VISITOR_ID = "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c34";
const COMPANY_ID = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const admin = { fake: "admin" };

function callback(query: string, cookie = `sf_vid=${VISITOR_ID}`) {
  return GET(new NextRequest(`http://localhost:3000/auth/callback${query}`, { headers: { cookie } }));
}

function location(response: Response) {
  return response.headers.get("location");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: USER_ID }, session: {} }, error: null });
  mocks.createServerSupabase.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } });
  mocks.claimVisitorScans.mockResolvedValue(3);
  mocks.getAdminClient.mockReturnValue(admin);
  mocks.readCompanyId.mockResolvedValue(COMPANY_ID);
});

describe("GET /auth/callback", () => {
  it("exchanges the code, claims visitor scans into the company, and redirects to next", async () => {
    const response = await callback("?code=abc&next=%2Fs%2Fxyz%3Fref%3D1");
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(mocks.readCompanyId).toHaveBeenCalledWith(admin, USER_ID);
    expect(mocks.claimVisitorScans).toHaveBeenCalledWith(USER_ID, VISITOR_ID, COMPANY_ID);
    expect(response.status).toBe(307);
    expect(location(response)).toBe("http://localhost:3000/s/xyz?ref=1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("defaults next to /", async () => {
    expect(location(await callback("?code=abc"))).toBe("http://localhost:3000/");
  });

  it("sends users without a company to onboarding, keeping next", async () => {
    mocks.readCompanyId.mockResolvedValue(null);
    const response = await callback("?code=abc&next=%2Fcertificates");
    expect(mocks.claimVisitorScans).toHaveBeenCalledWith(USER_ID, VISITOR_ID, null);
    expect(location(response)).toBe("http://localhost:3000/onboarding?next=%2Fcertificates");
  });

  it("sends users to onboarding when the company lookup fails, letting claim look it up again", async () => {
    mocks.readCompanyId.mockRejectedValue(new Error("db down"));
    const response = await callback("?code=abc&next=%2Fcases");
    expect(mocks.claimVisitorScans).toHaveBeenCalledWith(USER_ID, VISITOR_ID, undefined);
    expect(location(response)).toBe("http://localhost:3000/onboarding?next=%2Fcases");
  });

  it("sends users to onboarding without a database", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect(location(await callback("?code=abc"))).toBe("http://localhost:3000/onboarding?next=%2F");
    expect(mocks.readCompanyId).not.toHaveBeenCalled();
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil.com"])("never redirects off-site (next=%s)", async (next) => {
    const response = await callback(`?code=abc&next=${encodeURIComponent(next)}`);
    expect(location(response)).toBe("http://localhost:3000/");

    mocks.readCompanyId.mockResolvedValue(null);
    const onboarding = await callback(`?code=abc&next=${encodeURIComponent(next)}`);
    expect(location(onboarding)).toBe("http://localhost:3000/onboarding?next=%2F");
  });

  it("doesn't send users back to an auth step", async () => {
    expect(location(await callback("?code=abc&next=%2Fonboarding"))).toBe("http://localhost:3000/");
    mocks.readCompanyId.mockResolvedValue(null);
    expect(location(await callback("?code=abc&next=%2Fsign-in"))).toBe("http://localhost:3000/onboarding?next=%2F");
  });

  it("skips claiming without a valid visitor cookie", async () => {
    await callback("?code=abc", "sf_vid=bogus");
    expect(mocks.claimVisitorScans).not.toHaveBeenCalled();
  });

  it("redirects to the auth error page without a code (user cancelled)", async () => {
    const response = await callback("?error=access_denied");
    expect(location(response)).toBe("http://localhost:3000/?auth_error=1");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to the auth error page when the exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: null }, error: new Error("bad") });
    const response = await callback("?code=abc&next=%2Fhistory");
    expect(location(response)).toBe("http://localhost:3000/?auth_error=1");
    expect(mocks.claimVisitorScans).not.toHaveBeenCalled();
  });

  it("redirects to the auth error page when the exchange throws", async () => {
    mocks.exchangeCodeForSession.mockRejectedValue(new Error("network"));
    expect(location(await callback("?code=abc"))).toBe("http://localhost:3000/?auth_error=1");
  });

  it("redirects to the auth error page when Supabase isn't configured", async () => {
    mocks.createServerSupabase.mockResolvedValue(null);
    expect(location(await callback("?code=abc"))).toBe("http://localhost:3000/?auth_error=1");
  });
});
