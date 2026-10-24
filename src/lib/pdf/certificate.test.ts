import { describe, expect, it } from "vitest";
import { SAMPLE_CERTIFICATE } from "@/lib/certificates/sample";
import type { PublicCertificate } from "@/lib/types";
import { determinationText, formatConfidence, renderCertificatePdf, wrapUrlLabel } from "./certificate";

const ORIGIN = "https://hdx.test";

const REVOKED_NOT_HOT_DOG: PublicCertificate = {
  ...SAMPLE_CERTIFICATE,
  number: "HDX-C-0088214",
  code: "4TPW-R8KC",
  status: "revoked",
  productName: null,
  sku: null,
  issuedTo: "Individual submitter",
  revokedAt: "2026-10-26T09:00:00.000Z",
  revokedReason: "Verdict overturned on appeal: the flatbread was in fact a split bun",
  verdict: "not_hot_dog",
  confidence: 0.987,
  policyClause: "3.5",
  rating: null,
  ratingNote: null,
  fingerprint: null,
  model: null,
  isSample: false,
};

const words = (word: string, length: number) => `${word} `.repeat(length).slice(0, length);

// The longest values the database allows, revoked, on a long preview host.
const WORST_CASE: PublicCertificate = {
  ...SAMPLE_CERTIFICATE,
  isSample: false,
  status: "revoked",
  revokedAt: "2026-10-26T09:00:00.000Z",
  revokedReason: words("Overturned", 300),
  issuedTo: words("Consolidated", 120),
  productName: words("Frankfurter", 80),
  sku: `SKU-${"X".repeat(36)}`,
  ratingNote: words("Exceptional", 200),
  policyClause: "2.3",
};

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
const pageCount = (bytes: Uint8Array) => latin1(bytes).match(/\/Type \/Page\b/g)?.length ?? 0;

describe("renderCertificatePdf", () => {
  it("renders the sample record as a one-page PDF", async () => {
    const pdf = await renderCertificatePdf(SAMPLE_CERTIFICATE, { origin: ORIGIN });

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
    // The link annotation (and the QR) carry the real verify URL for this origin.
    expect(latin1(pdf)).toContain(`(${ORIGIN}/v/7KQ2-M9XD)`);
    expect(latin1(pdf)).toContain("HDX Certificate HDX-C-0088213");
  }, 20_000);

  it("renders a revoked NOT HOT DOG certificate with no product, rating, fingerprint or model", async () => {
    const pdf = await renderCertificatePdf(REVOKED_NOT_HOT_DOG, { origin: `${ORIGIN}/` });

    expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
    expect(latin1(pdf)).toContain(`(${ORIGIN}/v/4TPW-R8KC)`);
    expect(latin1(pdf)).toContain("REVOKED");
  }, 20_000);

  it("keeps the longest allowed values on one page", async () => {
    const pdf = await renderCertificatePdf(WORST_CASE, { origin: "https://hdx-seamflow-preview-branch-name.vercel.app" });
    expect(pageCount(pdf)).toBe(1);
  }, 20_000);
});

describe("wrapUrlLabel", () => {
  it("keeps short URLs on one line", () => {
    expect(wrapUrlLabel("hdx.app/v/7KQ2-M9XD")).toEqual(["hdx.app/v/7KQ2-M9XD"]);
    expect(wrapUrlLabel("localhost:3000/v/4TPW-R8KC")).toEqual(["localhost:3000/v/4TPW-R8KC"]);
  });

  it("breaks long hosts after dots and dashes, never inside the path", () => {
    expect(wrapUrlLabel("seamflow-git-main-sviat.vercel.app/v/7KQ2-M9XD")).toEqual([
      "seamflow-git-main-sviat.",
      "vercel.app/v/7KQ2-M9XD",
    ]);
    const lines = wrapUrlLabel("hdx-seamflow-preview-branch-name.vercel.app/v/7KQ2-M9XD");
    expect(lines.join("")).toBe("hdx-seamflow-preview-branch-name.vercel.app/v/7KQ2-M9XD");
    expect(lines.at(-1)).toContain("/v/7KQ2-M9XD");
  });
});

describe("formatConfidence", () => {
  it("prints one decimal and never rounds up to 100%", () => {
    expect(formatConfidence(0.992)).toBe("99.2%");
    expect(formatConfidence(0.9996)).toBe("99.9%");
    expect(formatConfidence(1)).toBe("100.0%");
    expect(formatConfidence(Number.NaN)).toBe("0.0%");
    expect(formatConfidence(-1)).toBe("0.0%");
  });
});

describe("determinationText", () => {
  it("cites the clause and its rule for a valid certificate", () => {
    const { lead, finding, tail } = determinationText(SAMPLE_CERTIFICATE);
    expect(lead).toContain("determines that it is ");
    expect(finding).toBe("a hot dog");
    expect(tail).toBe(
      " under §2.1 (Canonical form): a frankfurter or wiener seated lengthwise in a split bun. The determination is binary and final, subject to appeal.",
    );
  });

  it("states the withdrawal, date and reason for a revoked certificate", () => {
    const { lead, finding, tail } = determinationText(REVOKED_NOT_HOT_DOG);
    expect(lead).toContain("determined that it is ");
    expect(finding).toBe("not a hot dog");
    expect(tail).toBe(
      " under §3.5 (Flatbreads). That determination was withdrawn on Oct 26, 2026 after an appeal to the Hot Dog Review Board, and this certificate is revoked. Reason: Verdict overturned on appeal: the flatbread was in fact a split bun.",
    );
  });

  it("falls back to the bare clause id when the clause is unknown", () => {
    expect(determinationText({ ...SAMPLE_CERTIFICATE, policyClause: "9.9" }).tail).toBe(
      " under §9.9. The determination is binary and final, subject to appeal.",
    );
  });
});
