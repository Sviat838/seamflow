import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getUsage: vi.fn() }));

vi.mock("@/lib/usage", () => ({ getUsage: mocks.getUsage }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const request = () => new NextRequest("http://localhost/api/v1/usage", { headers: { "x-request-id": "req_usage" } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/usage", () => {
  it("returns the viewer's usage, uncached", async () => {
    const usage = { plan: "free", used: 4, limit: 20, remaining: 16 };
    mocks.getUsage.mockResolvedValue(usage);

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ usage });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Request-Id")).toBe("req_usage");
  });

  it("maps failures to the error body", async () => {
    mocks.getUsage.mockRejectedValue(new AppError("INTERNAL", "We couldn't load your usage right now.", { retryable: true }));

    const res = await GET(request());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatchObject({ code: "INTERNAL", requestId: "req_usage" });
  });
});
