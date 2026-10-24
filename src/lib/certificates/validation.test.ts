import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { normalizeCertificateCode, parseCertificateProductPatch } from "./validation";

describe("normalizeCertificateCode", () => {
  it("accepts the canonical form", () => {
    expect(normalizeCertificateCode("7KQ2-M9XD")).toBe("7KQ2-M9XD");
  });

  it("accepts lowercase, a missing dash and stray whitespace", () => {
    expect(normalizeCertificateCode("7kq2-m9xd")).toBe("7KQ2-M9XD");
    expect(normalizeCertificateCode("7KQ2M9XD")).toBe("7KQ2-M9XD");
    expect(normalizeCertificateCode(" 7kq2 m9xd ")).toBe("7KQ2-M9XD");
  });

  it("rejects characters outside the code alphabet", () => {
    // 0, 1, I, L, O and U are never issued.
    for (const code of ["7KQ0-M9XD", "7KQ1-M9XD", "7KQI-M9XD", "7KQL-M9XD", "7KQO-M9XD", "7KQU-M9XD"]) {
      expect(normalizeCertificateCode(code)).toBeNull();
    }
  });

  it("rejects wrong lengths and non-strings", () => {
    expect(normalizeCertificateCode("7KQ2-M9X")).toBeNull();
    expect(normalizeCertificateCode("7KQ2-M9XDD")).toBeNull();
    expect(normalizeCertificateCode("")).toBeNull();
    expect(normalizeCertificateCode("x".repeat(100))).toBeNull();
    expect(normalizeCertificateCode(undefined)).toBeNull();
    expect(normalizeCertificateCode(12345678)).toBeNull();
  });
});

describe("parseCertificateProductPatch", () => {
  it("trims, collapses whitespace and keeps only the fields sent", () => {
    expect(parseCertificateProductPatch({ productName: "  Stadium   Frank, 6 in. " })).toEqual({
      productName: "Stadium Frank, 6 in.",
    });
    expect(parseCertificateProductPatch({ sku: "BH-SF-06" })).toEqual({ sku: "BH-SF-06" });
  });

  it("treats null and blank strings as clearing the field", () => {
    expect(parseCertificateProductPatch({ productName: null, sku: "   " })).toEqual({ productName: null, sku: null });
  });

  it("enforces the database length caps with a readable message", () => {
    expect(() => parseCertificateProductPatch({ productName: "x".repeat(81) })).toThrow(
      "Product name must be 80 characters or fewer.",
    );
    expect(() => parseCertificateProductPatch({ sku: "x".repeat(41) })).toThrow("SKU must be 40 characters or fewer.");
    expect(parseCertificateProductPatch({ productName: "x".repeat(80) }).productName).toHaveLength(80);
  });

  it("rejects control characters", () => {
    expect(() => parseCertificateProductPatch({ sku: "BH\u0000SF" })).toThrow("SKU contains characters we can't print.");
  });

  it("rejects empty patches, unknown keys and wrong types as INVALID_REQUEST", () => {
    for (const input of [{}, { productName: 5 }, { productName: "x", extra: true }, null, "text", []]) {
      let error: unknown;
      try {
        parseCertificateProductPatch(input);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "INVALID_REQUEST", status: 400 });
      expect((error as AppError).message).toMatch(/productName/);
    }
  });
});
