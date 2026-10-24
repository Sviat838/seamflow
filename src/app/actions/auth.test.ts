import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  cookieStore: { getAll: vi.fn(), delete: vi.fn(), get: vi.fn() },
  createServerSupabase: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  authenticateWithPassword: vi.fn(),
  finishSignIn: vi.fn(),
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
  unstable_rethrow: (error: unknown) => {
    if (error instanceof RedirectError) throw error;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/auth/password", () => ({ authenticateWithPassword: mocks.authenticateWithPassword }));
vi.mock("@/lib/auth/after-sign-in", () => ({ finishSignIn: mocks.finishSignIn }));

import { AppError } from "@/lib/errors";
import { passwordAuthAction, signInWithGoogle, signOut } from "./auth";

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
  mocks.cookieStore.get = vi.fn().mockReturnValue({ value: "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c34" });
  mocks.authenticateWithPassword.mockResolvedValue({ userId: "8d1f3a52-6c0e-4b7a-9e2d-5f4c3b2a1e0d" });
  mocks.finishSignIn.mockResolvedValue({ hasCompany: true });
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

describe("passwordAuthAction", () => {
  const valid = { mode: "sign_up", email: "Dana@Ballpark.example", password: "longenough", next: "/certificates" };

  it("signs up, claims visitor scans and sends new accounts to onboarding", async () => {
    mocks.finishSignIn.mockResolvedValue({ hasCompany: false });
    const url = await redirectOf(passwordAuthAction(null, form(valid)));
    expect(url).toBe("/onboarding?next=%2Fcertificates");
    expect(mocks.authenticateWithPassword).toHaveBeenCalledWith(
      { mode: "sign_up", email: "dana@ballpark.example", password: "longenough" },
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    expect(mocks.finishSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "8d1f3a52-6c0e-4b7a-9e2d-5f4c3b2a1e0d",
        visitorId: "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c34",
        method: "password",
      }),
    );
  });

  it("sends users with a company straight to a safe next", async () => {
    expect(await redirectOf(passwordAuthAction(null, form({ ...valid, mode: "sign_in" })))).toBe("/certificates");
    expect(await redirectOf(passwordAuthAction(null, form({ ...valid, next: "https://evil.com" })))).toBe("/");
  });

  it("returns field errors with the typed email, without calling Supabase", async () => {
    const state = await passwordAuthAction(null, form({ ...valid, password: "short" }));
    expect(state).toMatchObject({
      email: "Dana@Ballpark.example",
      mode: "sign_up",
      field: "password",
      error: { code: "INVALID_REQUEST", message: "Use at least 8 characters." },
    });
    expect(mocks.authenticateWithPassword).not.toHaveBeenCalled();
  });

  it("returns form-level errors from auth", async () => {
    mocks.authenticateWithPassword.mockRejectedValue(new AppError("RATE_LIMITED", "Too many sign-in attempts."));
    const state = await passwordAuthAction(null, form({ ...valid, mode: "sign_in" }));
    expect(state).toMatchObject({ mode: "sign_in", field: null, error: { code: "RATE_LIMITED" } });
    expect(mocks.finishSignIn).not.toHaveBeenCalled();
  });
});
