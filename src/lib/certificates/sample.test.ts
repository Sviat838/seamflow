import { describe, expect, it } from "vitest";
import { getClause } from "@/lib/policy";
import { SAMPLE_CERTIFICATE, SAMPLE_CERTIFICATE_CODE } from "./sample";
import { normalizeCertificateCode } from "./validation";

describe("SAMPLE_CERTIFICATE", () => {
  it("uses the design's shared data and is marked as a sample", () => {
    expect(SAMPLE_CERTIFICATE).toMatchObject({
      code: "7KQ2-M9XD",
      number: "HDX-C-0088213",
      issuedTo: "Ballpark Holdings",
      productName: "Stadium Frank, 6 in.",
      sku: "BH-SF-06",
      status: "valid",
      verdict: "hot_dog",
      confidence: 0.992,
      policyClause: "2.1",
      verificationCount: 1284,
      fingerprint: "9f2c…e41a",
      isSample: true,
    });
    expect(SAMPLE_CERTIFICATE.issuedAt.startsWith("2026-10-24")).toBe(true);
  });

  it("is internally consistent with the product rules", () => {
    expect(normalizeCertificateCode(SAMPLE_CERTIFICATE_CODE)).toBe(SAMPLE_CERTIFICATE_CODE);
    expect(getClause(SAMPLE_CERTIFICATE.policyClause)?.verdict).toBe(SAMPLE_CERTIFICATE.verdict);
    expect(SAMPLE_CERTIFICATE.rating).toBeGreaterThanOrEqual(0);
    expect(SAMPLE_CERTIFICATE.rating).toBeLessThanOrEqual(100);
    expect(SAMPLE_CERTIFICATE.ratingNote).toBeTruthy();
    expect(Object.isFrozen(SAMPLE_CERTIFICATE)).toBe(true);
  });
});
