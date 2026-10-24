// Input validation for company actions. Pure: no server-only imports.
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { OnboardingInput } from "@/lib/types";
import { COMPANY_NAME_MAX_LENGTH, COMPANY_NAME_MIN_LENGTH, normalizeText } from "./slug";

export const JOB_TITLE_MAX_LENGTH = 80;

// Postgres char_length counts code points; String.length counts UTF-16 units (an emoji is 2).
const codePoints = (value: string) => Array.from(value).length;

const onboardingSchema = z.object({
  companyName: z
    .string("Enter your company name.")
    .transform(normalizeText)
    .refine(
      (name) => codePoints(name) >= COMPANY_NAME_MIN_LENGTH,
      `Company name must be at least ${COMPANY_NAME_MIN_LENGTH} characters.`,
    )
    .refine(
      (name) => codePoints(name) <= COMPANY_NAME_MAX_LENGTH,
      `Company name must be ${COMPANY_NAME_MAX_LENGTH} characters or fewer.`,
    ),
  jobTitle: z
    .string("Job title must be text.")
    .nullish()
    .transform((value) => (value ? normalizeText(value) : "") || null)
    .refine(
      (title) => title === null || codePoints(title) <= JOB_TITLE_MAX_LENGTH,
      `Job title must be ${JOB_TITLE_MAX_LENGTH} characters or fewer.`,
    ),
});

export interface ValidOnboardingInput {
  companyName: string;
  jobTitle: string | null;
}

/** Normalized onboarding input. Throws AppError INVALID_REQUEST with a message fit for the form. */
export function parseOnboardingInput(input: unknown): ValidOnboardingInput {
  const result = onboardingSchema.safeParse(input);
  if (!result.success) {
    throw new AppError("INVALID_REQUEST", result.error.issues[0]?.message ?? "Check the form and try again.", {
      cause: result.error,
    });
  }
  return result.data;
}

/** Reads the onboarding form: fields `companyName` and optional `jobTitle`. */
export function parseOnboardingForm(formData: FormData): OnboardingInput {
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  };
  return parseOnboardingInput({ companyName: field("companyName") ?? undefined, jobTitle: field("jobTitle") });
}

/** Actions are public endpoints: a non-boolean listing flag is a malformed request, not "false". */
export function parseListingFlag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AppError("INVALID_REQUEST", "The listing setting must be on or off.");
  return value;
}
