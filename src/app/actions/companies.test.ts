import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { ViewerCompany } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  completeOnboarding: vi.fn(),
  setCompanyListing: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-request-id": "req-1" }) }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/companies/service", () => ({
  completeOnboarding: mocks.completeOnboarding,
  setCompanyListing: mocks.setCompanyListing,
}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { completeOnboardingAction, setCompanyListingAction } from "./companies";

const company: ViewerCompany = {
  id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
  name: "Ballpark Holdings",
  slug: "ballpark-holdings",
  plan: "free",
  role: "owner",
  isListed: true,
};

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeOnboardingAction", () => {
  it("parses the form and returns the result", async () => {
    mocks.completeOnboarding.mockResolvedValue({ kind: "created", company });

    const result = await completeOnboardingAction(null, form({ companyName: " Ballpark  Holdings ", jobTitle: "CEO" }));

    expect(result).toEqual({ ok: true, data: { kind: "created", company } });
    expect(mocks.completeOnboarding).toHaveBeenCalledWith({ companyName: "Ballpark Holdings", jobTitle: "CEO" });
  });

  it("returns validation errors without calling the service", async () => {
    const result = await completeOnboardingAction(null, form({ companyName: "x" }));
    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Company name must be at least 2 characters.", requestId: "req-1" },
    });
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it("returns service errors as values", async () => {
    mocks.completeOnboarding.mockRejectedValue(
      new AppError("CONFLICT", "This company is already registered on HDX. Ask its admin to invite you."),
    );
    const result = await completeOnboardingAction(null, form({ companyName: "Ballpark Holdings" }));
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT", requestId: "req-1" } });
  });
});

describe("setCompanyListingAction", () => {
  it("updates the listing and refreshes the page", async () => {
    mocks.setCompanyListing.mockResolvedValue({ ...company, isListed: false });
    await expect(setCompanyListingAction(false)).resolves.toEqual({ ok: true, data: { ...company, isListed: false } });
    expect(mocks.setCompanyListing).toHaveBeenCalledWith(false);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("returns errors as values without refreshing", async () => {
    mocks.setCompanyListing.mockRejectedValue(new AppError("FORBIDDEN", "Only the company owner can change the public listing."));
    await expect(setCompanyListingAction(true)).resolves.toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
