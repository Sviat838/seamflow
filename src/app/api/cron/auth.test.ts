import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ env: { CRON_SECRET: undefined as string | undefined } }));

vi.mock("@/lib/env", () => ({ serverEnv: () => mocks.env }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { checkCronAuth, rejectUnlessCron } from "./auth";

const SECRET = "s3cret-cron-token";

beforeEach(() => {
  mocks.env.CRON_SECRET = SECRET;
});

describe("checkCronAuth", () => {
  it("accepts exactly the bearer token", () => {
    expect(checkCronAuth(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  it("rejects a missing, wrong, partial or differently cased header", () => {
    expect(checkCronAuth(null, SECRET)).toBe("unauthorized");
    expect(checkCronAuth("Bearer nope", SECRET)).toBe("unauthorized");
    expect(checkCronAuth(SECRET, SECRET)).toBe("unauthorized");
    expect(checkCronAuth(`Bearer ${SECRET}x`, SECRET)).toBe("unauthorized");
    expect(checkCronAuth(`bearer ${SECRET}`, SECRET)).toBe("unauthorized");
  });

  it("fails closed when no secret is configured", () => {
    expect(checkCronAuth("Bearer anything", undefined)).toBe("not_configured");
    expect(checkCronAuth("Bearer ", "")).toBe("not_configured");
  });
});

describe("rejectUnlessCron", () => {
  const headers = (authorization?: string) => new Headers(authorization ? { authorization } : {});

  it("lets the cron through", () => {
    expect(rejectUnlessCron(headers(`Bearer ${SECRET}`), "req-1")).toBeNull();
  });

  it("answers 401 to anyone else", async () => {
    const response = rejectUnlessCron(headers("Bearer guess"), "req-1");
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({ error: { code: "UNAUTHORIZED", requestId: "req-1" } });
  });

  it("answers 503 when CRON_SECRET is unset, even with a header", async () => {
    mocks.env.CRON_SECRET = undefined;
    const response = rejectUnlessCron(headers("Bearer undefined"), "req-1");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
  });
});
