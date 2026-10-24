import { describe, expect, it } from "vitest";
import { toCertifiedProduct, toLeaderboardEntry, toViewerCompany, toViewerProfile, type LeaderboardRow } from "./mappers";
import { COMPANY_ID, companyRecord } from "./testing";

describe("toViewerCompany", () => {
  it("maps the row with the given role", () => {
    expect(toViewerCompany(companyRecord(), "owner")).toEqual({
      id: COMPANY_ID,
      name: "Ballpark Holdings",
      slug: "ballpark-holdings",
      plan: "free",
      role: "owner",
      isListed: true,
    });
  });

  it("only recognises the business plan", () => {
    expect(toViewerCompany(companyRecord({ plan: "business" }), "member").plan).toBe("business");
    expect(toViewerCompany(companyRecord({ plan: "enterprise" }), "member").plan).toBe("free");
  });
});

describe("toViewerProfile", () => {
  it("joins the company and role", () => {
    const profile = toViewerProfile({ job_title: "QA lead", company_role: "member", companies: companyRecord() });
    expect(profile.jobTitle).toBe("QA lead");
    expect(profile.company).toMatchObject({ id: COMPANY_ID, role: "member" });
  });

  it("defaults a missing role to member (least privilege)", () => {
    expect(toViewerProfile({ job_title: null, company_role: null, companies: companyRecord() }).company?.role).toBe(
      "member",
    );
  });

  it("reads a missing row or company as not onboarded", () => {
    expect(toViewerProfile(null)).toEqual({ jobTitle: null, company: null });
    expect(toViewerProfile({ job_title: "CEO", company_role: null, companies: null })).toEqual({
      jobTitle: "CEO",
      company: null,
    });
  });
});

describe("toLeaderboardEntry", () => {
  const row: LeaderboardRow = {
    company_id: COMPANY_ID,
    name: "Ballpark Holdings",
    slug: "ballpark-holdings",
    score: 91.26,
    rated_hot_dogs: 12,
    certified_hot_dogs: 11,
    total_scans: 30,
    hot_dog_share: 0.4,
    last_activity: "2026-10-24T10:15:56.123456+00:00",
  };

  it("ranks by position and never exposes the company id", () => {
    const entry = toLeaderboardEntry(row, 2);
    expect(entry).toEqual({
      rank: 3,
      name: "Ballpark Holdings",
      slug: "ballpark-holdings",
      score: 91.3,
      ratedHotDogs: 12,
      certifiedHotDogs: 11,
      totalScans: 30,
      hotDogShare: 0.4,
      lastActivity: "2026-10-24T10:15:56.123Z",
    });
    expect(entry).not.toHaveProperty("companyId");
  });

  it("coerces numeric strings and clamps out-of-range values", () => {
    const entry = toLeaderboardEntry(
      { ...row, score: "104.5" as unknown as number, total_scans: "7" as unknown as number, hot_dog_share: 1.5 },
      0,
    );
    expect(entry.score).toBe(100);
    expect(entry.totalScans).toBe(7);
    expect(entry.hotDogShare).toBe(1);
  });
});

describe("toCertifiedProduct", () => {
  it("maps the certificate and its scan rating", () => {
    expect(
      toCertifiedProduct({
        number: "HDX-C-0088301",
        code: "7KQ2-M9XD",
        product_name: "Stadium Frank",
        sku: "SF-001",
        created_at: "2026-10-24T10:15:56+00:00",
        scans: { rating: 94, rating_note: "Textbook bun alignment." },
      }),
    ).toEqual({
      certificateNumber: "HDX-C-0088301",
      code: "7KQ2-M9XD",
      productName: "Stadium Frank",
      sku: "SF-001",
      rating: 94,
      ratingNote: "Textbook bun alignment.",
      issuedAt: "2026-10-24T10:15:56.000Z",
    });
  });
});
