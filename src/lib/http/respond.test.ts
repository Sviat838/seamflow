import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError, jsonOk, toActionError } from "@/lib/http/respond";
import type { ApiErrorBody } from "@/lib/types";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/log", () => ({ log }));

beforeEach(() => {
  log.warn.mockClear();
  log.error.mockClear();
});

describe("jsonOk", () => {
  it("returns JSON with X-Request-Id and no-store by default", async () => {
    const res = jsonOk({ hello: "world" }, { requestId: "req_1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("X-Request-Id")).toBe("req_1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("keeps caller status and headers", () => {
    const res = jsonOk({}, { status: 201, headers: { "Cache-Control": "public, max-age=60", Location: "/x" } });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("Location")).toBe("/x");
    expect(res.headers.get("X-Request-Id")).toBeNull();
  });

  it("sends no body for 204", async () => {
    const res = jsonOk(null, { status: 204, requestId: "req_2" });
    expect(res.status).toBe(204);
    expect(res.headers.get("X-Request-Id")).toBe("req_2");
    expect(await res.text()).toBe("");
  });
});

describe("jsonError", () => {
  it("maps AppError to its status and body, with Retry-After", async () => {
    const res = jsonError(
      new AppError("RATE_LIMITED", "Slow down.", { retryAfterSeconds: 41.2, cause: new Error("bucket") }),
      "req_3",
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("X-Request-Id")).toBe("req_3");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Slow down.", requestId: "req_3", retryAfterSeconds: 42 },
    } satisfies ApiErrorBody);
    expect(log.warn).toHaveBeenCalledWith(
      "request.failed",
      expect.objectContaining({ requestId: "req_3", code: "RATE_LIMITED", status: 429 }),
    );
    expect(log.error).not.toHaveBeenCalled();
  });

  it("omits Retry-After when the error has none", async () => {
    const res = jsonError(new AppError("NOT_FOUND", "No such scan."), "req_4");
    expect(res.status).toBe(404);
    expect(res.headers.has("Retry-After")).toBe(false);
    expect((await res.json()).error).not.toHaveProperty("retryAfterSeconds");
  });

  it("logs 5xx AppErrors at error level", () => {
    jsonError(new AppError("AI_UNAVAILABLE", "The model is busy."), "req_5");
    expect(log.error).toHaveBeenCalledWith("request.failed", expect.objectContaining({ status: 503 }));
  });

  it("maps ZodError to INVALID_REQUEST with the failing path", async () => {
    const parsed = z.object({ limit: z.number().max(50) }).safeParse({ limit: 99 });
    expect(parsed.success).toBe(false);
    const res = jsonError(parsed.error, "req_6");
    expect(res.status).toBe(400);
    const body: ApiErrorBody = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toContain("limit");
  });

  it("hides unknown errors behind a generic INTERNAL message but logs the cause", async () => {
    const secret = new Error("relation \"private.rate_limits\" does not exist");
    const res = jsonError(secret, "req_7");
    expect(res.status).toBe(500);
    const body: ApiErrorBody = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).not.toContain("rate_limits");
    expect(log.error).toHaveBeenCalledWith("request.failed", expect.objectContaining({ error: secret }));
  });

  it("rethrows Next.js control-flow errors instead of mapping them", () => {
    let thrown: unknown;
    try {
      redirect("/elsewhere");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(() => jsonError(thrown, "req_8")).toThrow("NEXT_REDIRECT");
    expect(() => toActionError(thrown, "req_8")).toThrow("NEXT_REDIRECT");
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe("toActionError", () => {
  it("returns the same ApiError shape as the API", () => {
    expect(toActionError(new AppError("FORBIDDEN", "Not yours."), "req_9")).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Not yours.", requestId: "req_9" },
    });
    expect(toActionError("weird", "req_10")).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});
