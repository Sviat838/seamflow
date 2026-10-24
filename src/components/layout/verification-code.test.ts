import { describe, expect, it } from "vitest";
import { normalizeVerificationCode } from "./verification-code";

describe("normalizeVerificationCode", () => {
  it("accepts canonical and sloppy input", () => {
    expect(normalizeVerificationCode("7KQ2-M9XD")).toBe("7KQ2-M9XD");
    expect(normalizeVerificationCode(" 7kq2m9xd ")).toBe("7KQ2-M9XD");
    expect(normalizeVerificationCode("7kq2 m9xd")).toBe("7KQ2-M9XD");
    expect(normalizeVerificationCode("4tpw-r8hc")).toBe("4TPW-R8HC");
  });

  it("extracts the code from a pasted verification link", () => {
    expect(normalizeVerificationCode("https://hdx.app/v/7KQ2-M9XD")).toBe("7KQ2-M9XD");
    expect(normalizeVerificationCode("hdx.app/v/7kq2-m9xd?ref=label")).toBe("7KQ2-M9XD");
  });

  it("rejects wrong lengths and characters outside the alphabet", () => {
    expect(normalizeVerificationCode("")).toBeNull();
    expect(normalizeVerificationCode("7KQ2-M9X")).toBeNull();
    expect(normalizeVerificationCode("7KQ2-M9XDD")).toBeNull();
    expect(normalizeVerificationCode("0KQ2-M9XD")).toBeNull();
    expect(normalizeVerificationCode("IKQ2-M9XU")).toBeNull();
    expect(normalizeVerificationCode("7KQ2_M9XD")).toBeNull();
  });
});
