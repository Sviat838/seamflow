import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({ submitLead: vi.fn(), headers: new Headers({ "x-request-id": "req-1" }) }));

vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/lib/leads/service", () => ({ submitLead: mocks.submitLead }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { submitLeadAction } from "./leads";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const fields = { name: "Dana Kessler", email: "dana@hooli.test", company: "Hooli" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.submitLead.mockResolvedValue({ id: "lead-1" });
});

describe("submitLeadAction", () => {
  it("submits the parsed form with the request headers", async () => {
    expect(await submitLeadAction(null, form(fields))).toEqual({ ok: true, data: { id: "lead-1" } });
    expect(mocks.submitLead).toHaveBeenCalledWith(
      { ...fields, role: null, monthlyVolume: null, useCase: null, source: null },
      mocks.headers,
    );
  });

  it("answers a bot with a quiet success and stores nothing", async () => {
    const result = await submitLeadAction(null, form({ ...fields, website: "https://spam.test" }));
    expect(result).toEqual({ ok: true, data: { id: expect.any(String) } });
    expect(mocks.submitLead).not.toHaveBeenCalled();
  });

  it("returns errors as values", async () => {
    mocks.submitLead.mockRejectedValue(new AppError("RATE_LIMITED", "Slow down.", { retryAfterSeconds: 60 }));
    expect(await submitLeadAction(null, form(fields))).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Slow down.", requestId: "req-1", retryAfterSeconds: 60 },
    });
    expect(await submitLeadAction(null, form({ ...fields, email: "" }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Enter a valid work email address." },
    });
  });
});
