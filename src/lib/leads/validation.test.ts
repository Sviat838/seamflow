import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { LEAD_HONEYPOT_FIELD, parseLeadForm, parseLeadInput } from "./validation";

const valid = { name: "Dana Kessler", email: "dana@hooli.test", company: "Hooli" };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "INVALID_REQUEST" });
    return (error as AppError).message;
  }
  throw new Error("expected a validation error");
}

describe("parseLeadInput", () => {
  it("trims, lowercases the email and nulls blank optional fields", () => {
    expect(
      parseLeadInput({
        name: "  Dana Kessler ",
        email: " Dana@Hooli.TEST ",
        company: " Hooli ",
        role: "   ",
        monthlyVolume: "10k-100k",
        useCase: "",
        source: "Plans",
      }),
    ).toEqual({
      name: "Dana Kessler",
      email: "dana@hooli.test",
      company: "Hooli",
      role: null,
      monthlyVolume: "10k-100k",
      useCase: null,
      source: "plans",
    });
  });

  it("fills missing optional fields with null", () => {
    expect(parseLeadInput(valid)).toEqual({ ...valid, role: null, monthlyVolume: null, useCase: null, source: null });
  });

  it("explains the first problem in plain words", () => {
    expect(messageOf(() => parseLeadInput({ ...valid, email: "dana@" }))).toBe("Enter a valid work email address.");
    expect(messageOf(() => parseLeadInput({ ...valid, name: " " }))).toBe("Enter your name.");
    expect(messageOf(() => parseLeadInput({ ...valid, company: "x".repeat(121) }))).toBe("The company name is too long.");
    expect(messageOf(() => parseLeadInput({ ...valid, monthlyVolume: "a lot" }))).toBe(
      "Choose a monthly volume from the list.",
    );
    expect(messageOf(() => parseLeadInput({ ...valid, useCase: "x".repeat(2001) }))).toBe(
      "Keep the use case under 2,000 characters.",
    );
    expect(messageOf(() => parseLeadInput(null))).toEqual(expect.any(String));
  });

  it("drops a malformed source instead of rejecting the lead", () => {
    expect(parseLeadInput({ ...valid, source: "<script>" }).source).toBeNull();
  });
});

describe("parseLeadForm", () => {
  it("reads the form fields", () => {
    expect(parseLeadForm(form({ ...valid, monthlyVolume: ">1m", [LEAD_HONEYPOT_FIELD]: "" }))).toEqual({
      isBot: false,
      input: { ...valid, role: null, monthlyVolume: ">1m", useCase: null, source: null },
    });
  });

  it("flags a filled honeypot before validating anything", () => {
    expect(parseLeadForm(form({ email: "not-an-email", [LEAD_HONEYPOT_FIELD]: "https://spam.test" }))).toEqual({
      isBot: true,
    });
  });

  it("rejects anything that isn't form data", () => {
    expect(messageOf(() => parseLeadForm({} as FormData))).toBe("Send the form as form data.");
  });
});
