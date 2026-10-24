import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthResponse } from "@/lib/types";
import { GET } from "./route";

const env = vi.hoisted(() => ({ ANTHROPIC_API_KEY: "sk-ant-secret-value" as string | undefined }));
const admin = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/env", () => ({ serverEnv: () => env }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => admin.client }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function fakeAdmin(result: Promise<{ error: unknown }>) {
  const chain = { select: () => chain, limit: () => chain, abortSignal: () => result };
  return { from: () => chain };
}

async function call() {
  const res = await GET(new Request("http://localhost/api/health", { headers: { "x-request-id": "req_h" } }));
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as HealthResponse };
}

beforeEach(() => {
  env.ANTHROPIC_API_KEY = "sk-ant-secret-value";
  admin.client = null;
});

describe("GET /api/health", () => {
  it("is ok when the model key and the database are both fine", async () => {
    admin.client = fakeAdmin(Promise.resolve({ error: null }));
    const { res, text, body } = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Request-Id")).toBe("req_h");
    expect(body).toMatchObject({ status: "ok", checks: { anthropic: "configured", database: "ok" } });
    expect(Date.parse(body.time)).not.toBeNaN();
    expect(text).not.toContain("sk-ant-secret-value");
  });

  it("is degraded (still 200) without Supabase or an Anthropic key", async () => {
    env.ANTHROPIC_API_KEY = undefined;
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "degraded", checks: { anthropic: "missing", database: "not_configured" } });
  });

  it("reports the database as unavailable on errors and timeouts", async () => {
    admin.client = fakeAdmin(Promise.resolve({ error: { message: "Invalid API key" } }));
    expect((await call()).body.checks.database).toBe("unavailable");

    admin.client = fakeAdmin(Promise.reject(new DOMException("timed out", "TimeoutError")));
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "degraded", checks: { database: "unavailable" } });
  });
});
