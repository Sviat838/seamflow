import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ APP_SECRET: "test-secret" as string | undefined }));
const warn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ serverEnv: () => env }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn, error: vi.fn() } }));

// Fresh module per test: hashIp keeps a per-process fallback secret.
async function load() {
  vi.resetModules();
  return import("@/lib/http/request");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("getRequestId", () => {
  it("prefers x-request-id, then x-vercel-id", async () => {
    const { getRequestId } = await load();
    expect(getRequestId(new Headers({ "x-request-id": "req_123", "x-vercel-id": "fra1::abc" }))).toBe("req_123");
    expect(getRequestId(new Headers({ "x-vercel-id": "fra1::iad1::xyz-1700000000000-abc" }))).toBe(
      "fra1::iad1::xyz-1700000000000-abc",
    );
  });

  it("strips unsafe characters and caps the length", async () => {
    const { getRequestId } = await load();
    expect(getRequestId(new Headers({ "x-request-id": "abc<script>\"def" }))).toBe("abcscriptdef");
    expect(getRequestId(new Headers({ "x-request-id": "a".repeat(500) }))).toHaveLength(128);
  });

  it("falls back to a random UUID when nothing usable is present", async () => {
    const { getRequestId } = await load();
    expect(getRequestId(new Headers())).toMatch(UUID);
    expect(getRequestId(new Headers({ "x-request-id": "<>{}" }))).toMatch(UUID);
    expect(getRequestId(new Headers())).not.toBe(getRequestId(new Headers()));
  });
});

describe("getClientIp", () => {
  it("takes the first x-forwarded-for hop", async () => {
    const { getClientIp } = await load();
    expect(getClientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  it("strips ports, brackets and IPv4 mapping, and lowercases IPv6", async () => {
    const { getClientIp } = await load();
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.7:51234" }))).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "x-forwarded-for": "[2001:DB8::1]:443" }))).toBe("2001:db8::1");
    expect(getClientIp(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(getClientIp(new Headers({ "x-forwarded-for": "::ffff:198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing or malformed", async () => {
    const { getClientIp } = await load();
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(getClientIp(new Headers({ "x-forwarded-for": "unknown", "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
  });

  it("returns null when nothing looks like an IP", async () => {
    const { getClientIp } = await load();
    expect(getClientIp(new Headers())).toBeNull();
    expect(getClientIp(new Headers({ "x-forwarded-for": "999.1.1.1", "x-real-ip": "localhost" }))).toBeNull();
  });
});

describe("hashIp", () => {
  beforeEach(() => {
    env.APP_SECRET = "test-secret";
    warn.mockClear();
  });

  afterEach(() => {
    env.APP_SECRET = "test-secret";
  });

  it("is an HMAC-SHA256 with APP_SECRET, hex, truncated to 32 chars", async () => {
    const { hashIp } = await load();
    const expected = createHmac("sha256", "test-secret").update("203.0.113.7").digest("hex").slice(0, 32);
    expect(hashIp("203.0.113.7")).toBe(expected);
    expect(hashIp("203.0.113.7")).toMatch(/^[0-9a-f]{32}$/);
    expect(hashIp("203.0.113.8")).not.toBe(expected);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns null for a null IP", async () => {
    const { hashIp } = await load();
    expect(hashIp(null)).toBeNull();
  });

  it("uses a stable per-process secret and warns once when APP_SECRET is missing", async () => {
    env.APP_SECRET = undefined;
    const { hashIp } = await load();
    const first = hashIp("203.0.113.7");
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(hashIp("203.0.113.7")).toBe(first);
    hashIp("198.51.100.1");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("ip_hash.ephemeral_secret", expect.any(Object));
  });
});
