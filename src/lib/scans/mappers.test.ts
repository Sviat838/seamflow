import { describe, expect, it } from "vitest";
import type { Classification, Viewer } from "@/lib/types";
import {
  imageRetention,
  isScanOwner,
  parseScanDetails,
  scanAccess,
  toGlobalStats,
  toReusableClassification,
  toScan,
  toScanDetails,
  toScanViewer,
  toUnsavedScan,
  toVerdictFields,
  truncate,
} from "./mappers";
import {
  CASE_NUMBER,
  certificateRecord,
  COMPANY_ID,
  OTHER_COMPANY_ID,
  OTHER_USER_ID,
  scanRecord,
  USER_ID,
  VISITOR_ID,
} from "./testing";

const PRIVATE_FIELDS = [
  "user_id",
  "visitor_id",
  "company_id",
  "ip_hash",
  "request_id",
  "image_path",
  "userId",
  "visitorId",
  "companyId",
  "imagePath",
];

const CREATED = "2026-10-24T10:15:56.123456+00:00";
const CREATED_MS = Date.parse(CREATED);
const HOUR = 60 * 60 * 1000;

describe("toScan", () => {
  it("maps a full row to the DTO", () => {
    const row = scanRecord({
      is_public: true,
      feedback: "correct",
      created_at: CREATED,
      review_status: "pending",
      certificates: certificateRecord(),
    });
    const scan = toScan(row, {
      isOwner: true,
      imageUrl: "https://signed.test/x.jpg",
      submittedBy: "Dana Kessler",
      now: CREATED_MS + HOUR,
    });
    expect(scan).toEqual({
      id: row.id,
      shareSlug: "AbCdEfGh_-12",
      verdict: "hot_dog",
      confidence: 0.97,
      summary: "Hot dog confirmed. Procurement may proceed.",
      reasoning: "A sausage in a split bun with mustard.",
      detectedItems: ["sausage", "bun", "mustard"],
      flags: ["partial_view"],
      imageUrl: "https://signed.test/x.jpg",
      isPublic: true,
      feedback: "correct",
      model: "claude-haiku-5-5",
      latencyMs: 1234,
      cached: false,
      persisted: true,
      isOwner: true,
      createdAt: "2026-10-24T10:15:56.123Z",
      caseNumber: CASE_NUMBER,
      policyClause: "2.1",
      rating: 92,
      ratingNote: "Canonical frankfurter, evenly applied mustard.",
      region: "EU-C",
      fileName: "frankfurter_lot14.jpg",
      imageBytes: 245_760,
      imageExpiresAt: "2026-10-25T10:15:56.123Z",
      imageDeleted: false,
      reviewStatus: "pending",
      certificate: {
        number: "HDX-C-0088301",
        code: "7KQ2-M9XD",
        status: "valid",
        issuedTo: "Hooli Foods",
        productName: null,
        sku: null,
        issuedAt: "2026-10-24T10:15:57.000Z",
        revokedAt: null,
        revokedReason: null,
        verificationCount: 3,
      },
      submittedBy: "Dana Kessler",
    });
  });

  it("never exposes owner, company, IP, request or storage fields", () => {
    const row = scanRecord({ visitor_id: VISITOR_ID, company_id: COMPANY_ID });
    for (const isOwner of [true, false]) {
      const scan = toScan(row, { isOwner, imageUrl: null });
      for (const field of PRIVATE_FIELDS) expect(scan).not.toHaveProperty(field);
      const json = JSON.stringify(scan);
      for (const secret of [VISITOR_ID, USER_ID, COMPANY_ID]) expect(json).not.toContain(secret);
    }
  });

  it("hides the file name and submitter from viewers who can't manage the scan", () => {
    const scan = toScan(scanRecord({ is_public: true }), { isOwner: false, imageUrl: null, submittedBy: "Dana" });
    expect(scan).toMatchObject({ fileName: null, submittedBy: null, caseNumber: CASE_NUMBER });
  });

  it("stops issuing the image once the retention window has passed or it was purged", () => {
    const row = scanRecord({ created_at: CREATED });
    const url = "https://signed.test/x.jpg";
    const expired = toScan(row, { isOwner: true, imageUrl: url, now: CREATED_MS + 24 * HOUR });
    expect(expired).toMatchObject({ imageUrl: null, imageDeleted: true, imageExpiresAt: "2026-10-25T10:15:56.123Z" });

    const purged = toScan(scanRecord({ created_at: CREATED, image_path: null, image_deleted_at: CREATED }), {
      isOwner: true,
      imageUrl: url,
      now: CREATED_MS + HOUR,
    });
    expect(purged).toMatchObject({ imageUrl: null, imageDeleted: true, imageExpiresAt: "2026-10-25T10:15:56.123Z" });
  });

  it("reports no expiry for scans saved without an image", () => {
    const scan = toScan(scanRecord({ image_path: null }), { isOwner: true, imageUrl: null });
    expect(scan).toMatchObject({ imageUrl: null, imageExpiresAt: null, imageDeleted: false });
  });

  it("falls back to the verdict's default clause and drops ratings on NOT HOT DOG rows", () => {
    const old = toScan(scanRecord({ policy_clause: null, rating: null, rating_note: null }), {
      isOwner: true,
      imageUrl: null,
    });
    expect(old).toMatchObject({ policyClause: "2.1", rating: null, ratingNote: null });

    const notHotDog = toScan(scanRecord({ verdict: "not_hot_dog", policy_clause: "2.1", rating: 80 }), {
      isOwner: true,
      imageUrl: null,
    });
    expect(notHotDog).toMatchObject({ policyClause: "3.9", rating: null, ratingNote: null });
  });

  it("lets a freshly issued certificate override the embedded one, and ignores unknown review states", () => {
    expect(toScan(scanRecord(), { isOwner: true, imageUrl: null }).certificate).toBeNull();
    const certificate = {
      number: "HDX-C-0088302",
      code: "4TPW-R8LC",
      status: "valid" as const,
      issuedTo: "Individual submitter",
      productName: null,
      sku: null,
      issuedAt: "2026-10-24T10:15:57.000Z",
      revokedAt: null,
      revokedReason: null,
      verificationCount: 0,
    };
    const scan = toScan(scanRecord({ review_status: "lost", certificates: certificateRecord() }), {
      isOwner: true,
      imageUrl: null,
      certificate,
    });
    expect(scan.certificate).toBe(certificate);
    expect(scan.reviewStatus).toBeNull();
  });

  it.each([null, "oops", 42, [], {}, { reasoning: 7, detectedItems: "bun", flags: null }])(
    "tolerates old or malformed details: %j",
    (details) => {
      const scan = toScan(scanRecord({ details }), { isOwner: true, imageUrl: null });
      expect(scan).toMatchObject({ reasoning: "", detectedItems: [], flags: [], cached: false, verdict: "hot_dog" });
    },
  );

  it("drops unknown flags and non-string items, and dedupes flags", () => {
    const details = parseScanDetails({
      reasoning: "ok",
      detectedItems: ["bun", 3, null, "sausage"],
      flags: ["corn_dog", "made_up_flag", "corn_dog", 1],
      cached: true,
    });
    expect(details).toEqual({ reasoning: "ok", detectedItems: ["bun", "sausage"], flags: ["corn_dog"], cached: true });
  });

  it("clamps confidence and keeps an unparseable timestamp as-is", () => {
    const scan = toScan(scanRecord({ confidence: 1.4, created_at: "not a date" }), { isOwner: true, imageUrl: null });
    expect(scan.confidence).toBe(1);
    expect(scan.createdAt).toBe("not a date");
  });
});

describe("imageRetention", () => {
  it("expires IMAGE_RETENTION_HOURS after creation", () => {
    const row = { image_path: "a.jpg", image_deleted_at: null, created_at: CREATED };
    expect(imageRetention(row, CREATED_MS + 23 * HOUR)).toEqual({
      expiresAt: "2026-10-25T10:15:56.123Z",
      deleted: false,
      available: true,
    });
    expect(imageRetention(row, CREATED_MS + 24 * HOUR)).toMatchObject({ deleted: true, available: false });
  });
});

describe("access", () => {
  const member = (overrides: Partial<Viewer> = {}): Viewer => ({
    isAuthenticated: true,
    userId: OTHER_USER_ID,
    email: null,
    displayName: null,
    avatarUrl: null,
    jobTitle: null,
    company: { id: COMPANY_ID, name: "Hooli Foods", slug: "hooli-foods", plan: "free", role: "member", isListed: true },
    needsOnboarding: false,
    ...overrides,
  });

  it("lets same-company members manage, but not own, a colleague's scan", () => {
    const row = { user_id: USER_ID, visitor_id: null, company_id: COMPANY_ID };
    expect(scanAccess(row, toScanViewer({ viewer: member(), visitorId: VISITOR_ID }))).toEqual({
      isOwner: false,
      isCompanyMember: true,
      canManage: true,
    });
  });

  it("denies other companies and scans without a company", () => {
    const other = member({ company: { ...member().company!, id: OTHER_COMPANY_ID } });
    const viewer = toScanViewer({ viewer: other, visitorId: VISITOR_ID });
    expect(scanAccess({ user_id: USER_ID, visitor_id: null, company_id: COMPANY_ID }, viewer).canManage).toBe(false);
    expect(scanAccess({ user_id: USER_ID, visitor_id: null, company_id: null }, viewer).canManage).toBe(false);
    // A viewer without a company never matches a null company_id.
    const loner = toScanViewer({ viewer: member({ company: null }), visitorId: VISITOR_ID });
    expect(scanAccess({ user_id: USER_ID, visitor_id: null, company_id: null }, loner).canManage).toBe(false);
  });

  it("keeps the phase-1 owner rule", () => {
    const row = { user_id: USER_ID, visitor_id: null, company_id: null };
    expect(scanAccess(row, { userId: USER_ID, visitorId: VISITOR_ID, companyId: null })).toEqual({
      isOwner: true,
      isCompanyMember: false,
      canManage: true,
    });
  });
});

describe("isScanOwner", () => {
  it("matches the signed-in user", () => {
    expect(isScanOwner({ user_id: USER_ID, visitor_id: null }, { userId: USER_ID, visitorId: VISITOR_ID })).toBe(true);
    expect(isScanOwner({ user_id: USER_ID, visitor_id: null }, { userId: OTHER_USER_ID, visitorId: VISITOR_ID })).toBe(
      false,
    );
  });

  it("matches an unclaimed anonymous scan by visitor, signed in or not", () => {
    const row = { user_id: null, visitor_id: VISITOR_ID };
    expect(isScanOwner(row, { userId: null, visitorId: VISITOR_ID })).toBe(true);
    expect(isScanOwner(row, { userId: USER_ID, visitorId: VISITOR_ID })).toBe(true);
    expect(isScanOwner(row, { userId: null, visitorId: "someone-else" })).toBe(false);
  });

  it("stops matching the visitor once an account owns the scan", () => {
    expect(isScanOwner({ user_id: OTHER_USER_ID, visitor_id: VISITOR_ID }, { userId: null, visitorId: VISITOR_ID })).toBe(
      false,
    );
  });

  it("never matches a row with no owner", () => {
    expect(isScanOwner({ user_id: null, visitor_id: null }, { userId: null, visitorId: VISITOR_ID })).toBe(false);
  });
});

describe("toVerdictFields", () => {
  it("keeps a valid clause and rounds and clamps the rating", () => {
    expect(toVerdictFields("hot_dog", { policyClause: "2.4", rating: 101.6, ratingNote: "  Corn dog.  " })).toEqual({
      policyClause: "2.4",
      rating: 100,
      ratingNote: "Corn dog.",
    });
  });

  it("replaces unknown or mismatched clauses with the verdict's default", () => {
    expect(toVerdictFields("hot_dog", { policyClause: "9.9" }).policyClause).toBe("2.1");
    expect(toVerdictFields("not_hot_dog", { policyClause: "2.1" }).policyClause).toBe("3.9");
  });

  it("only HOT DOG verdicts carry a rating and note", () => {
    expect(toVerdictFields("not_hot_dog", { policyClause: "3.5", rating: 70, ratingNote: "Pizza." })).toEqual({
      policyClause: "3.5",
      rating: null,
      ratingNote: null,
    });
    expect(toVerdictFields("hot_dog", { rating: Number.NaN, ratingNote: "x" })).toMatchObject({
      rating: null,
      ratingNote: null,
    });
  });

  it("caps the rating note at 200 characters without splitting emoji", () => {
    const note = toVerdictFields("hot_dog", { rating: 50, ratingNote: "🌭".repeat(250) }).ratingNote!;
    expect(Array.from(note)).toHaveLength(200);
    expect(truncate("ab🌭c", 3)).toBe("ab🌭");
  });
});

describe("toReusableClassification", () => {
  it("rebuilds a complete classification, preferring the columns", () => {
    const row = scanRecord({ summary: "Column summary", rating: 88 });
    expect(toReusableClassification(row)).toEqual({
      verdict: "hot_dog",
      confidence: 0.97,
      summary: "Column summary",
      reasoning: "A sausage in a split bun with mustard.",
      detectedItems: ["sausage", "bun", "mustard"],
      flags: ["partial_view"],
      policyClause: "2.1",
      rating: 88,
      ratingNote: "Canonical frankfurter, evenly applied mustard.",
    });
  });

  it("refuses rows missing what a fresh verdict would have", () => {
    expect(toReusableClassification(scanRecord({ details: {} }))).toBeNull();
    expect(toReusableClassification(scanRecord({ details: null }))).toBeNull();
    expect(toReusableClassification(scanRecord({ details: { reasoning: "x", detectedItems: "bun" } }))).toBeNull();
  });

  it("refuses phase-1 rows without a clause or a hot dog rating, and mismatched clauses", () => {
    expect(toReusableClassification(scanRecord({ policy_clause: null }))).toBeNull();
    expect(toReusableClassification(scanRecord({ rating: null }))).toBeNull();
    expect(toReusableClassification(scanRecord({ verdict: "not_hot_dog", policy_clause: "2.1", rating: null }))).toBeNull();
    expect(
      toReusableClassification(scanRecord({ verdict: "not_hot_dog", policy_clause: "3.3", rating: null, rating_note: null })),
    ).toMatchObject({ verdict: "not_hot_dog", policyClause: "3.3", rating: null });
  });
});

describe("toScanDetails / toUnsavedScan", () => {
  const classification: Classification = {
    verdict: "not_hot_dog",
    confidence: 0.88,
    summary: "Not a hot dog.",
    reasoning: "It is a shoe.",
    detectedItems: ["shoe"],
    flags: ["low_quality_image"],
    policyClause: "3.9",
    rating: null,
    ratingNote: null,
  };

  it("stores the full classification plus the cached marker", () => {
    expect(toScanDetails(classification, true)).toEqual({ ...classification, cached: true });
  });

  it("builds a non-persisted, unshared DTO", () => {
    const scan = toUnsavedScan({
      id: "id-1",
      classification,
      model: "m",
      latencyMs: 10,
      cached: false,
      createdAt: "2026-10-24T00:00:00.000Z",
      fileName: "shoe.jpg",
      region: "US-E",
      imageBytes: 1234,
      submittedBy: "Dana Kessler",
    });
    expect(scan).toMatchObject({
      id: "id-1",
      persisted: false,
      shareSlug: null,
      imageUrl: null,
      isPublic: false,
      isOwner: true,
      feedback: null,
      verdict: "not_hot_dog",
      reasoning: "It is a shoe.",
      caseNumber: null,
      policyClause: "3.9",
      rating: null,
      fileName: "shoe.jpg",
      region: "US-E",
      imageBytes: 1234,
      imageExpiresAt: null,
      imageDeleted: false,
      reviewStatus: null,
      certificate: null,
      submittedBy: "Dana Kessler",
    });
  });
});

describe("toGlobalStats", () => {
  it("maps the v2 RPC fields and computes accuracy from feedback", () => {
    expect(
      toGlobalStats({
        total_scans: 10,
        hot_dog_scans: 4,
        not_hot_dog_scans: 6,
        scans_last_24h: 3,
        scans_today: 2,
        hot_dog_scans_today: 1,
        feedback_correct: 3,
        feedback_incorrect: 1,
        p50_latency_ms: 1840.4,
      }),
    ).toEqual({
      totalScans: 10,
      hotDogScans: 4,
      notHotDogScans: 6,
      scansLast24h: 3,
      feedbackCorrect: 3,
      feedbackIncorrect: 1,
      accuracy: 0.75,
      scansToday: 2,
      hotDogScansToday: 1,
      p50LatencyMs: 1840,
    });
  });

  it("returns zeros and nulls without data", () => {
    expect(toGlobalStats(null)).toEqual({
      totalScans: 0,
      hotDogScans: 0,
      notHotDogScans: 0,
      scansLast24h: 0,
      feedbackCorrect: 0,
      feedbackIncorrect: 0,
      accuracy: null,
      scansToday: 0,
      hotDogScansToday: 0,
      p50LatencyMs: null,
    });
  });

  it("treats a null p50 (no scans this week) as unknown", () => {
    const row = { p50_latency_ms: null } as unknown as Parameters<typeof toGlobalStats>[0];
    expect(toGlobalStats(row).p50LatencyMs).toBeNull();
  });
});
