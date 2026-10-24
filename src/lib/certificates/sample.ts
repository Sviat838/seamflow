// The built-in sample record from the design (docs/design/FINAL-SPEC.md, "Shared data").
// /v/7KQ2-M9XD and its PDF render it so the landing page and printed demos always have a working
// QR to scan. It never touches the database and its scan counter never moves.
import type { PublicCertificate } from "@/lib/types";

export const SAMPLE_CERTIFICATE_CODE = "7KQ2-M9XD";

export const SAMPLE_CERTIFICATE: PublicCertificate = Object.freeze({
  number: "HDX-C-0088213",
  code: SAMPLE_CERTIFICATE_CODE,
  status: "valid",
  issuedTo: "Ballpark Holdings",
  productName: "Stadium Frank, 6 in.",
  sku: "BH-SF-06",
  issuedAt: "2026-10-24T14:32:07.530Z",
  revokedAt: null,
  revokedReason: null,
  verificationCount: 1284,
  verdict: "hot_dog",
  confidence: 0.992,
  policyClause: "2.1",
  rating: 96,
  ratingNote: "Textbook frankfurter, fully seated in a split bun; mustard applied in one even line.",
  fingerprint: "9f2c…e41a",
  // Ballpark Holdings is fictional, so there's no company profile to link to.
  companySlug: null,
  model: "claude-opus-5-5",
  isSample: true,
});
