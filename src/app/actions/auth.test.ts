import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  cookieStore: { getAll: vi.fn(), delete: vi.fn() },
  createServerSupabase: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super("NEXT_REDIRECT");
  }
}

vi.mock("next/headers", () => ({ headers: async () => mocks.headers, cookies: async () => mocks.cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { signInWithGoogle, signOut } from "./auth";

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof RedirectError)) throw new Error(`expected a redirect, got ${String(error)}`);
  return error.url;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers = new Headers({ host: "localhost:3000" });
  mocks.signInWithOAuth.mockResolvedValue({
    data: { provider: "google", url: "https://x.supabase.co/auth/v1/authorize?provider=google" },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.cookieStore.getAll.mockReturnValue([]);
  mocks.createServerSupabase.mockResolvedValue({
    auth: { signInWithOAuth: mocks.signInWithOAuth, signOut: mocks.signOut },
  });
});

describe("signInWithGoogle", () => {
  it("redirects to Google with a callback URL built from the request origin", async () => {
    mocks.headers = new Headers({ host: "internal", "x-forwarded-host": "seamflow.app", "x-forwarded-proto": "https" });
    const url = await redirectOf(signInWithGoogle(form({ next: "/s/abc?x=1" })));

    expect(url).toBe("https://x.supabase.co/auth/v1/authorize?provider=google");
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://seamflow.app/auth/callback?next=%2Fs%2Fabc%3Fx%3D1",
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("works without form data and sanitizes next", async () => {
    await redirectOf(signInWithGoogle());
    expect(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe(
      "http://localhost:3000/auth/callback?next=%2F",
    );

    await redirectOf(signInWithGoogle(form({ next: "//evil.com" })));
    expect(mocks.signInWithOAuth.mock.calls[1][0].options.redirectTo).toBe(
      "http://localhost:3000/auth/callback?next=%2F",
    );
  });

  it("redirects to not_configured without Supabase", async () => {
    mocks.createServerSupabase.mockResolvedValue(null);
    expect(await redirectOf(signInWithGoogle())).toBe("/?auth_error=not_configured");
  });

  it("redirects to the auth error page when the provider call fails", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: null }, error: new Error("disabled") });
    expect(await redirectOf(signInWithGoogle())).toBe("/?auth_error=1");

    mocks.signInWithOAuth.mockRejectedValue(new Error("network"));
    expect(await redirectOf(signInWithGoogle())).toBe("/?auth_error=1");
  });

  it("refuses a spoofed host", async () => {
    mocks.headers = new Headers({ host: "evil.com/phish" });
    expect(await redirectOf(signInWithGoogle())).toBe("/?auth_error=1");
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("signs out this browser and redirects home", async () => {
    expect(await redirectOf(signOut())).toBe("/");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.cookieStore.delete).not.toHaveBeenCalled();
  });

  it("clears auth cookies itself when the revoke call fails", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("network") });
    mocks.cookieStore.getAll.mockReturnValue([
      { name: "sb-ref-auth-token.0", value: "a" },
      { name: "sb-ref-auth-token.1", value: "b" },
      { name: "sf_vid", value: "keep" },
    ]);
    expect(await redirectOf(signOut())).toBe("/");
    expect(mocks.cookieStore.delete.mock.calls.map(([name]) => name)).toEqual([
      "sb-ref-auth-token.0",
      "sb-ref-auth-token.1",
    ]);
  });

  it("still redirects home without Supabase", async () => {
    mocks.createServerSupabase.mockResolvedValue(null);
    expect(await redirectOf(signOut())).toBe("/");
  });
});
