import { describe, expect, it } from "vitest";
import {
  buildPublicCertificate,
  shortFingerprint,
  toCertificateSummary,
  type CertificateRow,
  type PublicScanFields,
} from "./mappers";

const SHA256 = "9f2c4b7d1e0a6c3f5b8d2e9a7c1f4b6d0e3a5c7f9b1d2e4f6a8c0b3d5e7f9e41a".slice(0, 64);

function certificateRow(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: "c0ffee00-0000-4000-8000-000000000001",
    scan_id: "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b",
    number: "HDX-C-0088301",
    code: "7KQ2-M9XD",
    status: "valid",
    issued_to: "Ballpark Holdings",
    product_name: "Stadium Frank, 6 in.",
    sku: "BH-SF-06",
    revoked_at: null,
    revoked_reason: null,
    verification_count: 3,
    verdict: "hot_dog",
    policy_clause: "2.1",
    confidence: 0.992,
    rating: 96,
    rating_note: null,
    company_id: null,
    last_verified_at: null,
    created_at: "2026-10-24T14:32:07.53+00:00",
    ...overrides,
  };
}

const scan: PublicScanFields = {
  verdict: "hot_dog",
  confidence: 0.992,
  policy_clause: "2.1",
  rating: 96,
  rating_note: "Textbook.",
  image_sha256: SHA256,
  model: "claude-opus-5-5",
};

describe("toCertificateSummary", () => {
  it("maps a row to the DTO with ISO timestamps", () => {
    expect(toCertificateSummary(certificateRow())).toEqual({
      number: "HDX-C-0088301",
      code: "7KQ2-M9XD",
      status: "valid",
      issuedTo: "Ballpark Holdings",
      productName: "Stadium Frank, 6 in.",
      sku: "BH-SF-06",
      issuedAt: "2026-10-24T14:32:07.530Z",
      revokedAt: null,
      revokedReason: null,
      verificationCount: 3,
    });
  });

  it("reports revoked whenever revoked_at is set", () => {
    const summary = toCertificateSummary(
      certificateRow({ status: "valid", revoked_at: "2026-10-26T09:00:00+00:00", revoked_reason: "Overturned." }),
    );
    expect(summary.status).toBe("revoked");
    expect(summary.revokedAt).toBe("2026-10-26T09:00:00.000Z");
    expect(summary.revokedReason).toBe("Overturned.");
  });

  it("never reports a negative or fractional scan count", () => {
    expect(toCertificateSummary(certificateRow({ verification_count: -2 })).verificationCount).toBe(0);
    expect(toCertificateSummary(certificateRow({ verification_count: 4.7 })).verificationCount).toBe(4);
  });
});

describe("shortFingerprint", () => {
  it("keeps the first and last four hex digits", () => {
    expect(shortFingerprint(SHA256)).toBe(`${SHA256.slice(0, 4)}…${SHA256.slice(-4)}`);
    expect(shortFingerprint(SHA256.toUpperCase())).toBe(`${SHA256.slice(0, 4)}…${SHA256.slice(-4)}`);
  });

  it("returns null for missing or non-hex values", () => {
    expect(shortFingerprint(null)).toBeNull();
    expect(shortFingerprint("")).toBeNull();
    expect(shortFingerprint("not-a-hash")).toBeNull();
  });
});

describe("buildPublicCertificate", () => {
  it("combines certificate, scan and a listed company", () => {
    const cert = buildPublicCertificate(certificateRow(), scan, { slug: "ballpark-holdings", is_listed: true });
    expect(cert).toMatchObject({
      number: "HDX-C-0088301",
      verdict: "hot_dog",
      confidence: 0.992,
      policyClause: "2.1",
      rating: 96,
      ratingNote: "Textbook.",
      fingerprint: `${SHA256.slice(0, 4)}…${SHA256.slice(-4)}`,
      companySlug: "ballpark-holdings",
      model: "claude-opus-5-5",
      isSample: false,
    });
  });

  it("hides the slug of an unlisted company and handles no company", () => {
    expect(buildPublicCertificate(certificateRow(), scan, { slug: "stealth", is_listed: false }).companySlug).toBeNull();
    expect(buildPublicCertificate(certificateRow(), scan, null).companySlug).toBeNull();
  });

  it("drops ratings from NOT HOT DOG verdicts and defaults a missing clause", () => {
    const cert = buildPublicCertificate(
      certificateRow(),
      { ...scan, verdict: "not_hot_dog", policy_clause: null, rating: 40, rating_note: "Stray." },
      null,
    );
    expect(cert.rating).toBeNull();
    expect(cert.ratingNote).toBeNull();
    expect(cert.policyClause).toBe("3.9");
  });

  it("clamps confidence and treats an empty model as unknown", () => {
    const cert = buildPublicCertificate(certificateRow(), { ...scan, confidence: 1.4, model: "" }, null);
    expect(cert.confidence).toBe(1);
    expect(cert.model).toBeNull();
  });
});
