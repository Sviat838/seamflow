import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAdminClient: vi.fn(),
  enforceAuthRateLimit: vi.fn(),
  createUser: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mocks.createServerSupabase }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/rate-limit", () => ({ enforceAuthRateLimit: mocks.enforceAuthRateLimit }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_SECRET: "test-secret" }) }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { authenticateWithPassword } from "./password";

const USER_ID = "8d1f3a52-6c0e-4b7a-9e2d-5f4c3b2a1e0d";
const ctx = { headers: new Headers({ "x-forwarded-for": "203.0.113.7" }), requestId: "req-1" };

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceAuthRateLimit.mockResolvedValue(undefined);
  mocks.createUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID }, session: {} }, error: null });
  mocks.createServerSupabase.mockResolvedValue({ auth: { signInWithPassword: mocks.signInWithPassword } });
  mocks.getAdminClient.mockReturnValue({ auth: { admin: { createUser: mocks.createUser } } });
});

describe("authenticateWithPassword", () => {
  it("signs up with the email pre-confirmed, then signs in to set the session cookie", async () => {
    const result = await authenticateWithPassword({ mode: "sign_up", email: "a@b.co", password: "longenough" }, ctx);
    expect(result).toEqual({ userId: USER_ID });
    expect(mocks.createUser).toHaveBeenCalledWith({ email: "a@b.co", password: "longenough", email_confirm: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "longenough" });
    expect(mocks.createUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.signInWithPassword.mock.invocationCallOrder[0]);
  });

  it("rate limits by hashed IP and hashed email, never the raw values", async () => {
    await authenticateWithPassword({ mode: "sign_in", email: "a@b.co", password: "x" }, ctx);
    const [attempt, keys] = mocks.enforceAuthRateLimit.mock.calls[0];
    expect(attempt).toBe("sign_in");
    expect(keys.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(keys.emailHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(keys)).not.toContain("203.0.113.7");
    expect(JSON.stringify(keys)).not.toContain("a@b.co");
  });

  it("signs in without creating a user", async () => {
    await authenticateWithPassword({ mode: "sign_in", email: "a@b.co", password: "x" }, ctx);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("stops before any auth call when rate limited", async () => {
    mocks.enforceAuthRateLimit.mockRejectedValue(new AppError("RATE_LIMITED", "slow down"));
    const error = await rejection(authenticateWithPassword({ mode: "sign_up", email: "a@b.co", password: "longenough" }, ctx));
    expect(error.code).toBe("RATE_LIMITED");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("reports an already registered email", async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: "email_exists", status: 422 } });
    const error = await rejection(authenticateWithPassword({ mode: "sign_up", email: "a@b.co", password: "longenough" }, ctx));
    expect(error).toMatchObject({ code: "CONFLICT", field: "email" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("reports a wrong password", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "invalid_credentials", status: 400 } });
    const error = await rejection(authenticateWithPassword({ mode: "sign_in", email: "a@b.co", password: "x" }, ctx));
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: "Wrong email or password." });
  });

  it("is unavailable without Supabase", async () => {
    mocks.createServerSupabase.mockResolvedValue(null);
    expect((await rejection(authenticateWithPassword({ mode: "sign_in", email: "a@b.co", password: "x" }, ctx))).code).toBe(
      "INTERNAL",
    );
    mocks.createServerSupabase.mockResolvedValue({ auth: { signInWithPassword: mocks.signInWithPassword } });
    mocks.getAdminClient.mockReturnValue(null);
    const error = await rejection(authenticateWithPassword({ mode: "sign_up", email: "a@b.co", password: "longenough" }, ctx));
    expect(error.code).toBe("INTERNAL");
    expect(mocks.enforceAuthRateLimit).not.toHaveBeenCalled();
  });
});
