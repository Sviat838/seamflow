import { z } from "zod";
import { defaultClauseFor, getClause, POLICY_CLAUSE_IDS, POLICY_VERSION, type PolicyClauseId } from "@/lib/policy";
import {
  CLASSIFICATION_FLAGS,
  type Classification,
  type ClassificationFlag,
  type ReviewStatus,
  type Verdict,
} from "@/lib/types";

export const OUTPUT_LIMITS = {
  summary: 200,
  reasoning: 600,
  detectedItems: 8,
  detectedItemLength: 40,
  ratingNote: 140,
  ruling: 600,
} as const;

/**
 * `issue` means the reply was usable only after a local repair (e.g. a clause that contradicts the
 * verdict). Callers re-ask once with the issue, and fall back to the repaired value if that fails.
 */
export type ParseResult<T> = { ok: true; value: T; issue?: string } | { ok: false; reason: string };

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

const requiredText = z.string().transform(collapse).pipe(z.string().min(1, "must not be empty"));

// Lenient on purpose: structured outputs already constrain the shape, so this rejects only what
// can't be fixed locally (bad verdict, missing text, non-numeric confidence) and normalizes the rest.
const rawOutputSchema = z.object({
  verdict: z.enum(["hot_dog", "not_hot_dog"]),
  confidence: z.number(),
  summary: requiredText,
  reasoning: requiredText,
  detectedItems: z.array(z.unknown()).default([]),
  flags: z.array(z.unknown()).default([]),
  // Checked against the verdict below, so a bad value is repaired rather than rejected outright.
  policyClause: z.unknown().optional(),
  rating: z.unknown().optional(),
  ratingNote: z.unknown().optional(),
});

const knownFlags = new Set<string>(CLASSIFICATION_FLAGS);

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
    .join("; ");
}

function parseJson(text: string): { ok: true; json: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "output was not valid JSON" };
  }
}

/** Accepts "2.1" and "§2.1"; null for anything that isn't a clause of the policy. */
function toClauseId(value: unknown): PolicyClauseId | null {
  if (typeof value !== "string") return null;
  const id = value.trim().replace(/^§\s*/, "");
  return POLICY_CLAUSE_IDS.find((clauseId) => clauseId === id) ?? null;
}

/** The clause a verdict most likely rests on, from the flags alone. Used when the model's clause can't stand. */
export function inferClause(verdict: Verdict, flags: readonly ClassificationFlag[]): PolicyClauseId {
  const has = (flag: ClassificationFlag) => flags.includes(flag);
  if (verdict === "hot_dog") {
    if (has("corn_dog")) return "2.4";
    if (has("illustration") || has("costume_or_toy")) return "2.5";
  } else {
    if (has("actual_dog")) return "3.6";
    if (has("sausage_without_bun")) return "3.2";
    if (has("bun_without_sausage")) return "3.4";
  }
  return defaultClauseFor(verdict);
}

function toRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Validates, clamps, filters and trims one classification object from the model. */
function normalizeClassification(json: unknown): ParseResult<Classification> {
  const parsed = rawOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: describeIssues(parsed.error) };

  const raw = parsed.data;
  const strings = (items: unknown[]) => items.filter((item): item is string => typeof item === "string");
  const issues: string[] = [];

  const detectedItems = [
    ...new Set(
      strings(raw.detectedItems)
        .map((item) => clip(collapse(item).toLowerCase(), OUTPUT_LIMITS.detectedItemLength))
        .filter(Boolean),
    ),
  ].slice(0, OUTPUT_LIMITS.detectedItems);

  const flags = [...new Set(strings(raw.flags))].filter((flag): flag is ClassificationFlag =>
    knownFlags.has(flag),
  );

  // The verdict is the product's answer and comes after the reasoning, so it wins a conflict:
  // a clause that contradicts it is replaced, never the other way round.
  let policyClause = toClauseId(raw.policyClause);
  const clause = policyClause ? getClause(policyClause) : undefined;
  if (!clause) {
    issues.push(`policyClause ${JSON.stringify(raw.policyClause ?? null)} is not a clause of Policy v${POLICY_VERSION}`);
  } else if (clause.verdict !== raw.verdict) {
    issues.push(`policyClause ${clause.id} (${clause.title}) is a ${clause.verdict} clause but the verdict is ${raw.verdict}`);
    policyClause = null;
  }
  policyClause ??= inferClause(raw.verdict, flags);

  // Ratings exist only for hot dogs. A missing one is re-asked once, then left null: never invented.
  const rating = raw.verdict === "hot_dog" ? toRating(raw.rating) : null;
  if (raw.verdict === "hot_dog" && rating === null) {
    issues.push("rating must be an integer from 0 to 100 for a hot_dog verdict");
  }
  const note = rating !== null && typeof raw.ratingNote === "string" ? collapse(raw.ratingNote) : "";

  return {
    ok: true,
    value: {
      verdict: raw.verdict,
      confidence: Math.min(1, Math.max(0, raw.confidence)),
      summary: clip(raw.summary, OUTPUT_LIMITS.summary),
      reasoning: clip(raw.reasoning, OUTPUT_LIMITS.reasoning),
      detectedItems,
      flags,
      policyClause,
      rating,
      ratingNote: note ? clip(note, OUTPUT_LIMITS.ratingNote) : null,
    },
    ...(issues.length > 0 ? { issue: issues.join("; ") } : {}),
  };
}

/** Parses the classifier's JSON text into a Classification: validated, clamped, filtered, and trimmed. */
export function parseClassification(text: string): ParseResult<Classification> {
  const parsed = parseJson(text);
  return parsed.ok ? normalizeClassification(parsed.json) : parsed;
}

export type AppealDecision = Exclude<ReviewStatus, "pending">;

export interface ReviewResult {
  decision: AppealDecision;
  ruling: string;
  /** The Board's own classification of the case; its verdict is the final verdict. */
  classification: Classification;
}

const reviewFieldsSchema = z.object({
  decision: z.enum(["upheld", "overturned"]),
  ruling: requiredText,
});

/**
 * Parses a Review Board reply. The decision must agree with the verdicts (upheld = same verdict);
 * a contradiction is rejected outright, since the ruling text would contradict the outcome too.
 */
export function parseReview(text: string, originalVerdict: Verdict): ParseResult<ReviewResult> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;

  const classification = normalizeClassification(parsed.json);
  if (!classification.ok) return classification;

  const fields = reviewFieldsSchema.safeParse(parsed.json);
  if (!fields.success) return { ok: false, reason: describeIssues(fields.error) };

  const { verdict } = classification.value;
  const expected: AppealDecision = verdict === originalVerdict ? "upheld" : "overturned";
  if (fields.data.decision !== expected) {
    return {
      ok: false,
      reason: `decision "${fields.data.decision}" contradicts the verdicts (original ${originalVerdict}, Board ${verdict}): "upheld" means the same verdict`,
    };
  }

  return {
    ok: true,
    value: {
      decision: expected,
      ruling: clip(fields.data.ruling, OUTPUT_LIMITS.ruling),
      classification: classification.value,
    },
    ...(classification.issue ? { issue: classification.issue } : {}),
  };
}
