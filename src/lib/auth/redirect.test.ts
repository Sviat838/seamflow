import { describe, expect, it } from "vitest";
import { nextAfterAuth, onboardingPath, originFromHeaders, sanitizeNextPath, signInPath } from "./redirect";

describe("sanitizeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/history", "/history"],
    ["/s/abc123?ref=share#top", "/s/abc123?ref=share#top"],
    ["/a/../b", "/b"],
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
  ])("keeps same-origin path %j", (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    42,
    "",
    "history",
    "//evil.com",
    "//evil.com/path",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    " /history",
    `/${"a".repeat(1100)}`,
  ])("falls back for unsafe value %j", (input) => {
    expect(sanitizeNextPath(input)).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(sanitizeNextPath("//evil.com", "/home")).toBe("/home");
  });
});

describe("nextAfterAuth", () => {
  it("keeps ordinary destinations", () => {
    expect(nextAfterAuth("/cases/HDX-2026-1024-7731?tab=audit")).toBe("/cases/HDX-2026-1024-7731?tab=audit");
    expect(nextAfterAuth("/sign-in-help")).toBe("/sign-in-help");
  });

  it.each(["/sign-in", "/sign-in?next=%2Fcases", "/onboarding", "/onboarding/step", "/auth/callback?code=x", "//evil.com"])(
    "sends %j to / so auth steps can't loop",
    (next) => {
      expect(nextAfterAuth(next)).toBe("/");
    },
  );
});

describe("signInPath / onboardingPath", () => {
  it("encode a sanitized next", () => {
    expect(signInPath("/certificates?x=1")).toBe("/sign-in?next=%2Fcertificates%3Fx%3D1");
    expect(onboardingPath("/settings")).toBe("/onboarding?next=%2Fsettings");
  });

  it("fall back to / for missing or unsafe values", () => {
    expect(signInPath()).toBe("/sign-in?next=%2F");
    expect(onboardingPath("https://evil.com")).toBe("/onboarding?next=%2F");
    expect(onboardingPath("/onboarding")).toBe("/onboarding?next=%2F");
  });
});

describe("originFromHeaders", () => {
  it("prefers forwarded host and proto", () => {
    const headers = new Headers({
      host: "internal:3000",
      "x-forwarded-host": "seamflow.app",
      "x-forwarded-proto": "https",
    });
    expect(originFromHeaders(headers)).toBe("https://seamflow.app");
  });

  it("uses the first value of comma-separated forwarded headers", () => {
    const headers = new Headers({ "x-forwarded-host": "a.example, b.example", "x-forwarded-proto": "https,http" });
    expect(originFromHeaders(headers)).toBe("https://a.example");
  });

  it("defaults to http on localhost and https elsewhere", () => {
    expect(originFromHeaders(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(originFromHeaders(new Headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(originFromHeaders(new Headers({ host: "Seamflow.App" }))).toBe("https://seamflow.app");
  });

  it("ignores an unknown proto", () => {
    const headers = new Headers({ host: "seamflow.app", "x-forwarded-proto": "javascript" });
    expect(originFromHeaders(headers)).toBe("https://seamflow.app");
  });

  it.each(["evil.com/path", "user@evil.com", "evil .com", ""])("rejects malformed host %j", (host) => {
    expect(originFromHeaders(new Headers({ "x-forwarded-host": host }))).toBeNull();
  });

  it("returns null without any host", () => {
    expect(originFromHeaders(new Headers())).toBeNull();
  });
});
