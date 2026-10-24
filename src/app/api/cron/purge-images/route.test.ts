import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: "cron-secret" as string | undefined },
  getAdminClient: vi.fn(),
  purgeExpiredImages: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ serverEnv: () => mocks.env }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("./purge", () => ({ purgeExpiredImages: mocks.purgeExpiredImages }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from "./route";

const call = (authorization?: string) =>
  GET(new NextRequest("http://localhost/api/cron/purge-images", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.CRON_SECRET = "cron-secret";
  mocks.getAdminClient.mockReturnValue({});
  mocks.purgeExpiredImages.mockResolvedValue({ candidates: 3, deleted: 3, failed: 0 });
});

describe("GET /api/cron/purge-images", () => {
  it("purges and returns the counts for Vercel Cron", async () => {
    const response = await call("Bearer cron-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ candidates: 3, deleted: 3, failed: 0 });
  });

  it("is 401 without the bearer token and never purges", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(mocks.purgeExpiredImages).not.toHaveBeenCalled();
  });

  it("is 503 when CRON_SECRET is unset", async () => {
    mocks.env.CRON_SECRET = undefined;
    expect((await call("Bearer cron-secret")).status).toBe(503);
    expect(mocks.purgeExpiredImages).not.toHaveBeenCalled();
  });

  it("reports zero work without a database", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    expect(await (await call("Bearer cron-secret")).json()).toEqual({ candidates: 0, deleted: 0, failed: 0 });
  });

  it("maps a failed run to a 500", async () => {
    mocks.purgeExpiredImages.mockRejectedValue(new Error("db down"));
    const response = await call("Bearer cron-secret");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "INTERNAL" } });
  });
});
