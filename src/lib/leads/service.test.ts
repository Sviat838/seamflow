import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/lib/types";
import { createFakeAdmin, type QueryResult } from "@/lib/appeals/testing";
import { submitLead } from "./service";

const mocks = vi.hoisted(() => ({
  getViewerContext: vi.fn(),
  getAdminClient: vi.fn(),
  getClientIp: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/http/request", () => ({
  getClientIp: mocks.getClientIp,
  hashIp: (ip: string | null) => (ip ? `hash-of-${ip}` : null),
}));
vi.mock("@/lib/log", () => ({ log: mocks.log }));

const USER_ID = "0b6a1f3e-8c2d-4e5f-9a7b-1c2d3e4f5a6b";
const VISITOR_ID = "6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d";
const LEAD_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const anonymous: Viewer = {
  isAuthenticated: false,
  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  jobTitle: null,
  company: null,
  needsOnboarding: false,
};
const input = { name: "Dana Kessler", email: "dana@hooli.test", company: "Hooli", monthlyVolume: "1k-10k" as const };
const ok = (data: unknown): QueryResult => ({ data, error: null });
const limiter = (allowed: boolean) =>
  ok([{ allowed, remaining: 0, reset_at: new Date(Date.now() + 1_800_000).toISOString() }]);

function withDb() {
  const fake = createFakeAdmin((q) => (q.op === "insert" ? ok({ id: LEAD_ID }) : ok(null)));
  fake.rpc.mockReturnValue(limiter(true));
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewerContext.mockResolvedValue({ viewer: anonymous, visitorId: VISITOR_ID });
  mocks.getClientIp.mockReturnValue("203.0.113.7");
});

describe("submitLead", () => {
  it("stores the validated lead with the IP hash, rate limited per IP hash", async () => {
    const fake = withDb();

    expect(await submitLead(input, new Headers())).toEqual({ id: LEAD_ID });

    expect(fake.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: "lead:1h:ip:hash-of-203.0.113.7",
      p_limit: 5,
      p_window_seconds: 3600,
    });
    const insert = fake.queries.find((q) => q.table === "leads");
    expect(insert?.payload).toEqual({
      name: "Dana Kessler",
      email: "dana@hooli.test",
      company: "Hooli",
      role: null,
      monthly_volume: "1k-10k",
      use_case: null,
      source: null,
      user_id: null,
      ip_hash: "hash-of-203.0.113.7",
    });
    // No personal data in the log line.
    expect(JSON.stringify(mocks.log.info.mock.calls)).not.toContain("dana");
  });

  it("links the lead to the signed-in user and falls back to the visitor id without an IP", async () => {
    mocks.getViewerContext.mockResolvedValue({
      viewer: { ...anonymous, isAuthenticated: true, userId: USER_ID },
      visitorId: VISITOR_ID,
    });
    mocks.getClientIp.mockReturnValue(null);
    const fake = withDb();

    await submitLead(input, new Headers());

    expect(fake.rpc).toHaveBeenCalledWith("consume_rate_limit", expect.objectContaining({ p_key: `lead:1h:v:${VISITOR_ID}` }));
    expect(fake.queries.find((q) => q.table === "leads")?.payload).toMatchObject({ user_id: USER_ID, ip_hash: null });
  });

  it("validates before spending quota", async () => {
    const fake = withDb();
    await expect(submitLead({ ...input, email: "nope" }, new Headers())).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(0);
  });

  it("rejects the sixth request in an hour", async () => {
    const fake = withDb();
    fake.rpc.mockReturnValue(limiter(false));
    const error = await submitLead(input, new Headers()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
    expect(fake.queries).toHaveLength(0);
  });

  it("fails open when the limiter is down", async () => {
    const fake = withDb();
    fake.rpc.mockReturnValue({ data: null, error: { message: "timeout" } });
    expect(await submitLead(input, new Headers())).toEqual({ id: LEAD_ID });
    expect(mocks.log.warn).toHaveBeenCalledWith("leads.rate_limit_unavailable", expect.anything());
  });

  it("says so when there's nowhere to store the lead", async () => {
    mocks.getAdminClient.mockReturnValue(null);
    await expect(submitLead(input, new Headers())).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });

  it("reports a failed insert as retryable", async () => {
    const fake = createFakeAdmin(() => ({ data: null, error: { message: "check constraint" } }));
    fake.rpc.mockReturnValue(limiter(true));
    mocks.getAdminClient.mockReturnValue(fake.client);
    await expect(submitLead(input, new Headers())).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});
