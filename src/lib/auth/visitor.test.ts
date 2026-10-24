import { describe, expect, it } from "vitest";
import { isUuid, parseVisitorId, visitorCookieOptions } from "./visitor";

const ID = "3f2b8c1e-9d4a-4e6b-8f1c-2a7d5e9b0c34";

describe("isUuid", () => {
  it("accepts canonical UUIDs in any case", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
  });

  it.each([undefined, null, 1, "", "not-a-uuid", `${ID}x`, ` ${ID}`, ID.replaceAll("-", "")])(
    "rejects %j",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});

describe("parseVisitorId", () => {
  it("normalizes to lowercase", () => {
    expect(parseVisitorId(ID.toUpperCase())).toBe(ID);
  });

  it("returns null for missing or tampered values", () => {
    expect(parseVisitorId(undefined)).toBeNull();
    expect(parseVisitorId("'; drop table scans; --")).toBeNull();
  });
});

describe("visitorCookieOptions", () => {
  it("is a one-year httpOnly Lax cookie on /", () => {
    expect(visitorCookieOptions(false)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 31_536_000,
    });
  });

  it("is Secure in production", () => {
    expect(visitorCookieOptions(true).secure).toBe(true);
  });
});
