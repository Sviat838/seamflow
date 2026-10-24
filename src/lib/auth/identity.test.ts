import { describe, expect, it } from "vitest";
import type { ViewerCompany } from "@/lib/types";
import { anonymousViewer, viewerFromClaims, withProfile } from "./identity";

const USER_ID = "8d1f3a52-6c0e-4b7a-9e2d-5f4c3b2a1e0d";

describe("viewerFromClaims", () => {
  it("maps Google metadata (full_name, avatar_url)", () => {
    expect(
      viewerFromClaims({
        sub: USER_ID,
        email: "jian@example.com",
        user_metadata: { full_name: "  Jian Yang ", avatar_url: "https://lh3.googleusercontent.com/a/x" },
      }),
    ).toEqual({
      isAuthenticated: true,
      userId: USER_ID,
      email: "jian@example.com",
      displayName: "Jian Yang",
      avatarUrl: "https://lh3.googleusercontent.com/a/x",
      jobTitle: null,
      company: null,
      needsOnboarding: true,
    });
  });

  it("falls back to name and picture", () => {
    const viewer = viewerFromClaims({
      sub: USER_ID,
      user_metadata: { name: "Erlich", picture: "https://example.com/p.png" },
    });
    expect(viewer.displayName).toBe("Erlich");
    expect(viewer.avatarUrl).toBe("https://example.com/p.png");
    expect(viewer.email).toBeNull();
  });

  it("drops non-https avatars and non-string metadata", () => {
    const viewer = viewerFromClaims({
      sub: USER_ID,
      user_metadata: { full_name: 42, name: "   ", avatar_url: "javascript:alert(1)", picture: "http://x.test/a.png" },
    });
    expect(viewer.displayName).toBeNull();
    expect(viewer.avatarUrl).toBeNull();
  });

  it("truncates very long display names", () => {
    const viewer = viewerFromClaims({ sub: USER_ID, user_metadata: { full_name: "x".repeat(500) } });
    expect(viewer.displayName).toHaveLength(100);
  });

  it("treats a non-UUID subject as anonymous", () => {
    expect(viewerFromClaims({ sub: "service" })).toEqual(anonymousViewer());
  });
});

describe("anonymousViewer", () => {
  it("returns a fresh object each time", () => {
    expect(anonymousViewer()).not.toBe(anonymousViewer());
    expect(anonymousViewer()).toEqual({
      isAuthenticated: false,
      userId: null,
      email: null,
      displayName: null,
      avatarUrl: null,
      jobTitle: null,
      company: null,
      needsOnboarding: false,
    });
  });
});

describe("withProfile", () => {
  const company: ViewerCompany = {
    id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
    name: "Ballpark Holdings",
    slug: "ballpark-holdings",
    plan: "free",
    role: "owner",
    isListed: true,
  };
  const signedIn = viewerFromClaims({ sub: USER_ID, email: "dana@ballparkholdings.com" });

  it("adds the job title and company, and clears needsOnboarding", () => {
    expect(withProfile(signedIn, { jobTitle: "QA lead", company })).toMatchObject({
      userId: USER_ID,
      jobTitle: "QA lead",
      company,
      needsOnboarding: false,
    });
  });

  it("needs onboarding without a company, or when the profile is unknown", () => {
    expect(withProfile(signedIn, { jobTitle: "CEO", company: null })).toMatchObject({
      jobTitle: "CEO",
      needsOnboarding: true,
    });
    expect(withProfile(signedIn, null)).toMatchObject({ company: null, needsOnboarding: true });
  });

  it("leaves anonymous viewers alone", () => {
    expect(withProfile(anonymousViewer(), { jobTitle: "CEO", company })).toEqual(anonymousViewer());
  });
});
