// Business-plan contact form parsing. Pure, so the form can share the field names and limits.
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { MONTHLY_VOLUMES, type LeadInput } from "@/lib/types";

/**
 * Hidden honeypot input: real visitors never see or fill it, form-filling bots usually do.
 * Render it off-screen with tabIndex={-1} and autoComplete="off", not with display:none.
 */
export const LEAD_HONEYPOT_FIELD = "website";

/** Form field names (FormData keys) for submitLeadAction. */
export const LEAD_FIELDS = ["name", "email", "company", "role", "monthlyVolume", "useCase", "source"] as const;

// Limits match the DB checks on public.leads.
export const LEAD_LIMITS = { name: 120, email: 254, company: 120, role: 120, useCase: 2000 } as const;

const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);
const optionalText = (max: number, message: string) =>
  z.preprocess(blankToNull, z.string().trim().max(max, message).nullish());

const leadSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(LEAD_LIMITS.name, "Your name is too long."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(LEAD_LIMITS.email, "That email address is too long.")
    .pipe(z.email("Enter a valid work email address.")),
  company: z.string().trim().min(1, "Enter your company.").max(LEAD_LIMITS.company, "The company name is too long."),
  role: optionalText(LEAD_LIMITS.role, "Your role is too long."),
  monthlyVolume: z.preprocess(
    blankToNull,
    z.enum(MONTHLY_VOLUMES, { message: "Choose a monthly volume from the list." }).nullish(),
  ),
  useCase: optionalText(LEAD_LIMITS.useCase, "Keep the use case under 2,000 characters."),
  // Analytics only: a malformed source must never cost us the lead.
  source: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,40}$/)
    .nullish()
    .catch(null),
});

/** A validated, trimmed lead: every optional field is null rather than blank or missing. */
export type ValidLead = { [K in keyof LeadInput]-?: Exclude<LeadInput[K], undefined> };

export function parseLeadInput(input: unknown): ValidLead {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the form and try again.", {
      cause: parsed.error,
    });
  }
  const { role, monthlyVolume, useCase, source, ...required } = parsed.data;
  return { ...required, role: role ?? null, monthlyVolume: monthlyVolume ?? null, useCase: useCase ?? null, source: source ?? null };
}

export type LeadFormResult = { isBot: true } | { isBot: false; input: LeadInput };

/** Reads the contact form. A filled honeypot short-circuits before validation, so bots learn nothing. */
export function parseLeadForm(form: FormData): LeadFormResult {
  // Server actions are public endpoints; a hand-rolled call can pass anything here.
  if (!(form instanceof FormData)) throw new AppError("INVALID_REQUEST", "Send the form as form data.");
  const trap = form.get(LEAD_HONEYPOT_FIELD);
  if (typeof trap === "string" && trap.trim() !== "") return { isBot: true };

  const field = (name: (typeof LEAD_FIELDS)[number]) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };
  return { isBot: false, input: parseLeadInput(Object.fromEntries(LEAD_FIELDS.map((name) => [name, field(name)]))) };
}
