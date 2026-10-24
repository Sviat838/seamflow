import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  envError: null as Error | null,
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  serverEnv: () => {
    if (mocks.envError) throw mocks.envError;
    return mocks.env;
  },
}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { config, proxy } from "./proxy";

const VISITOR_ID = "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c34";
const AUTH_COOKIE = "sb-buuyvmasbomxzyrwfkxo-auth-token";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function request(headers: Record<string, string> = {}, path = "/") {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

// NextResponse.next({ request: { headers } }) forwards each request header as x-middleware-request-*.
function forwarded(response: Response, name: string) {
  return response.headers.get(`x-middleware-request-${name}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env = {};
  mocks.envError = null;
  mocks.getClaims.mockResolvedValue({ data: null, error: null });
  mocks.createServerClient.mockReturnValue({ auth: { getClaims: mocks.getClaims } });
});

describe("proxy: visitor cookie", () => {
  it("creates sf_vid on first visit and forwards it to this request", async () => {
    const response = await proxy(request());
    const cookie = response.cookies.get("sf_vid");
    expect(cookie?.value).toMatch(UUID);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000 });
    expect(forwarded(response, "cookie")).toContain(`sf_vid=${cookie?.value}`);
  });

  it("keeps a valid existing sf_vid untouched", async () => {
    const response = await proxy(request({ cookie: `sf_vid=${VISITOR_ID}` }));
    expect(response.cookies.get("sf_vid")).toBeUndefined();
  });

  it("replaces a tampered sf_vid", async () => {
    const response = await proxy(request({ cookie: "sf_vid=not-a-uuid" }));
    expect(response.cookies.get("sf_vid")?.value).toMatch(UUID);
  });
});

describe("proxy: request id", () => {
  it("generates one when missing and echoes it", async () => {
    const response = await proxy(request());
    const id = response.headers.get("X-Request-Id");
    expect(id).toMatch(UUID);
    expect(forwarded(response, "x-request-id")).toBe(id);
  });

  it("keeps an incoming x-request-id", async () => {
    const response = await proxy(request({ "x-request-id": "req-123" }));
    expect(response.headers.get("X-Request-Id")).toBe("req-123");
    expect(forwarded(response, "x-request-id")).toBe("req-123");
  });
});

describe("proxy: Supabase session", () => {
  it("skips Supabase when it isn't configured", async () => {
    await proxy(request({ cookie: `${AUTH_COOKIE}=token` }));
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("skips Supabase for visitors without auth cookies", async () => {
    mocks.env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk" };
    await proxy(request({ cookie: `sf_vid=${VISITOR_ID}` }));
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("writes refreshed tokens to both the forwarded request and the response", async () => {
    mocks.env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk" };
    mocks.createServerClient.mockImplementation((_url, _key, { cookies }) => ({
      auth: {
        getClaims: async () => {
          await cookies.setAll([{ name: AUTH_COOKIE, value: "fresh", options: { path: "/", httpOnly: false } }], {
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
          });
          return { data: null, error: null };
        },
      },
    }));

    const response = await proxy(request({ cookie: `sf_vid=${VISITOR_ID}; ${AUTH_COOKIE}=stale` }));

    expect(response.cookies.get(AUTH_COOKIE)?.value).toBe("fresh");
    expect(forwarded(response, "cookie")).toContain(`${AUTH_COOKIE}=fresh`);
    expect(forwarded(response, "cookie")).toContain(`sf_vid=${VISITOR_ID}`);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("doesn't fail the request when Auth throws", async () => {
    mocks.env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk" };
    mocks.getClaims.mockRejectedValue(new Error("network"));
    const response = await proxy(request({ cookie: `${AUTH_COOKIE}=stale` }));
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("doesn't fail the request when the server env is invalid", async () => {
    mocks.envError = new Error("RATE_LIMIT_PER_MINUTE: expected number");
    const response = await proxy(request({ cookie: `${AUTH_COOKIE}=stale` }));
    expect(response.cookies.get("sf_vid")?.value).toMatch(UUID);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});

describe("proxy: matcher", () => {
  // The docs call it unstable_doesProxyMatch; this Next build still exports the old name.
  const matches = (path: string) => unstable_doesMiddlewareMatch({ config, url: `http://localhost:3000${path}` });

  it.each(["/", "/history", "/s/abc123", "/api/v1/scans", "/api/health", "/auth/callback?code=x"])(
    "runs on %s",
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  it.each(["/_next/static/chunks/app.js", "/_next/image?url=x", "/favicon.ico", "/og.png", "/hero.webp", "/logo.svg"])(
    "skips %s",
    (path) => {
      expect(matches(path)).toBe(false);
    },
  );
});
