import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import { parseListingFlag, parseOnboardingForm, parseOnboardingInput } from "./validation";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function invalidMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isAppError(error) && error.code === "INVALID_REQUEST") return error.message;
    throw error;
  }
  throw new Error("expected INVALID_REQUEST");
}

describe("parseOnboardingInput", () => {
  it("normalizes the name and job title", () => {
    expect(parseOnboardingInput({ companyName: "  Ballpark   Holdings ", jobTitle: " Head of  Quality " })).toEqual({
      companyName: "Ballpark Holdings",
      jobTitle: "Head of Quality",
    });
  });

  it("treats a missing or blank job title as null", () => {
    expect(parseOnboardingInput({ companyName: "Acme" }).jobTitle).toBeNull();
    expect(parseOnboardingInput({ companyName: "Acme", jobTitle: "   " }).jobTitle).toBeNull();
    expect(parseOnboardingInput({ companyName: "Acme", jobTitle: null }).jobTitle).toBeNull();
  });

  it("checks the name length after normalizing", () => {
    expect(invalidMessage(() => parseOnboardingInput({ companyName: "  A  " }))).toBe(
      "Company name must be at least 2 characters.",
    );
    expect(invalidMessage(() => parseOnboardingInput({ companyName: "x".repeat(81) }))).toBe(
      "Company name must be 80 characters or fewer.",
    );
    expect(parseOnboardingInput({ companyName: `${"x".repeat(80)}   ` }).companyName).toHaveLength(80);
  });

  it("counts characters the way Postgres does (code points)", () => {
    expect(invalidMessage(() => parseOnboardingInput({ companyName: "\u{1F32D}" }))).toBe(
      "Company name must be at least 2 characters.",
    );
    expect(parseOnboardingInput({ companyName: "\u{1F32D}".repeat(80) }).companyName).toHaveLength(160);
  });

  it("rejects a missing name and an overlong job title", () => {
    expect(invalidMessage(() => parseOnboardingInput({}))).toBe("Enter your company name.");
    expect(invalidMessage(() => parseOnboardingInput({ companyName: "Acme", jobTitle: "x".repeat(81) }))).toBe(
      "Job title must be 80 characters or fewer.",
    );
    expect(invalidMessage(() => parseOnboardingInput({ companyName: 42 }))).toBe("Enter your company name.");
  });
});

describe("parseOnboardingForm", () => {
  it("reads companyName and jobTitle", () => {
    expect(parseOnboardingForm(form({ companyName: "Acme", jobTitle: "CEO" }))).toEqual({
      companyName: "Acme",
      jobTitle: "CEO",
    });
    expect(parseOnboardingForm(form({ companyName: "Acme" }))).toEqual({ companyName: "Acme", jobTitle: null });
  });

  it("rejects a file where text is expected", () => {
    const data = new FormData();
    data.set("companyName", new Blob(["x"]), "x.txt");
    expect(invalidMessage(() => parseOnboardingForm(data))).toBe("Enter your company name.");
  });
});

describe("parseListingFlag", () => {
  it("accepts booleans only", () => {
    expect(parseListingFlag(true)).toBe(true);
    expect(parseListingFlag(false)).toBe(false);
    expect(invalidMessage(() => parseListingFlag("false"))).toBe("The listing setting must be on or off.");
  });
});
