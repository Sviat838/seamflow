// Hot Dog Definition Policy v3.2: the single source for verdict clauses and the HDX Rating rubric.
// Used by the classifier prompt, the UI (policy table, verdict pages, certificates) and validation.
// Safe to import anywhere.

import type { Verdict } from "@/lib/types";

export const POLICY_NAME = "Hot Dog Definition Policy";
export const POLICY_VERSION = "3.2";
export const POLICY_EFFECTIVE = "Jul 1, 2026";
/** Shown in reports next to the model id. */
export const POLICY_ENGINE = "HDX policy engine 3.2.1";

export interface PolicyClause {
  id: string;
  title: string;
  verdict: Verdict;
  /** The rule as the classifier applies it. */
  rule: string;
  /** Example submission for the public "Selected rulings" table. */
  example: string;
  /** One-line basis, as printed in the rulings table. */
  basis: string;
}

export const POLICY_CLAUSES = [
  {
    id: "2.1",
    title: "Canonical form",
    verdict: "hot_dog",
    rule: "A frankfurter or wiener seated lengthwise in a split bun.",
    example: "Frankfurter in a split bun",
    basis: "Canonical form.",
  },
  {
    id: "2.2",
    title: "Sausage variety",
    verdict: "hot_dog",
    rule: "Any encased sausage (bratwurst, kielbasa, chorizo, plant-based) in a bun or roll.",
    example: "Bratwurst in a roll",
    basis: "Sausage variety is immaterial.",
  },
  {
    id: "2.3",
    title: "Toppings and condiments",
    verdict: "hot_dog",
    rule: "Toppings, condiments and garnishes never disqualify an otherwise qualifying hot dog.",
    example: "Chili cheese dog",
    basis: "Condiments are non-disqualifying.",
  },
  {
    id: "2.4",
    title: "Corn dogs",
    verdict: "hot_dog",
    rule: "A sausage fully enrobed in cooked batter, usually on a stick.",
    example: "Corn dog",
    basis: "Batter constitutes a continuous bun.",
  },
  {
    id: "2.5",
    title: "Representations",
    verdict: "hot_dog",
    rule: "Drawings, renders, toys, costumes and other depictions of a qualifying hot dog.",
    example: "Hot dog plush toy",
    basis: "Classified by the item depicted.",
  },
  {
    id: "3.1",
    title: "Pastry-wrapped sausages",
    verdict: "not_hot_dog",
    rule: "Sausage rolls, pigs in blankets and other sausages wrapped in pastry or dough.",
    example: "Sausage roll",
    basis: "Laminated pastry is not a bun.",
  },
  {
    id: "3.2",
    title: "Unaccompanied sausage",
    verdict: "not_hot_dog",
    rule: "A sausage without a bun, on a plate, grill, fork or stick.",
    example: "Unaccompanied sausage",
    basis: "A bun is required.",
  },
  {
    id: "3.3",
    title: "Sandwiches",
    verdict: "not_hot_dog",
    rule: "Submarines, hoagies, burgers and other sandwiches without an encased sausage.",
    example: "Submarine sandwich",
    basis: "No encased meat present.",
  },
  {
    id: "3.4",
    title: "Empty buns",
    verdict: "not_hot_dog",
    rule: "A bun or roll without a sausage.",
    example: "Empty hot dog bun",
    basis: "A sausage is required.",
  },
  {
    id: "3.5",
    title: "Flatbreads",
    verdict: "not_hot_dog",
    rule: "Pizza, tacos, wraps and other flatbreads, regardless of toppings.",
    example: "Pizza slice",
    basis: "Flatbread. See Appendix B.",
  },
  {
    id: "3.6",
    title: "Animals",
    verdict: "not_hot_dog",
    rule: "Dogs and other animals, regardless of temperature.",
    example: "A dog on a warm day",
    basis: "Canine, not frankfurter.",
  },
  {
    id: "3.9",
    title: "General exclusion",
    verdict: "not_hot_dog",
    rule: "Any subject not covered above, including other foods, objects, people and scenes.",
    example: "Landscape photograph",
    basis: "No sausage in a bun present.",
  },
] as const satisfies readonly PolicyClause[];

export type PolicyClauseId = (typeof POLICY_CLAUSES)[number]["id"];
export const POLICY_CLAUSE_IDS = POLICY_CLAUSES.map((c) => c.id) as PolicyClauseId[];

export function getClause(id: string): PolicyClause | undefined {
  return POLICY_CLAUSES.find((c) => c.id === id);
}

/** Default clause when an older scan has none recorded. */
export function defaultClauseFor(verdict: Verdict): PolicyClauseId {
  return verdict === "hot_dog" ? "2.1" : "3.9";
}

/** "Hot Dog Definition Policy v3.2, §2.1 — Canonical form" */
export function formatClause(id: string, opts: { short?: boolean } = {}): string {
  const clause = getClause(id);
  const ref = `§${id}${clause ? ` — ${clause.title}` : ""}`;
  return opts.short ? `v${POLICY_VERSION}, ${ref}` : `${POLICY_NAME} v${POLICY_VERSION}, ${ref}`;
}

/**
 * HDX Rating (0–100), HOT DOG verdicts only: how canonical the hot dog is under this policy.
 * Four criteria worth 25 points each. Image quality never changes the verdict, only presentation.
 */
export const RATING_RUBRIC = [
  { key: "bun", label: "Bun", description: "Split, intact, proportionate to the sausage, seated lengthwise." },
  { key: "sausage", label: "Sausage", description: "Encased, evenly cooked, fully seated, sensible overhang." },
  { key: "condiments", label: "Condiments", description: "Applied with intent: even lines, no landslides." },
  { key: "presentation", label: "Presentation", description: "Clear view of a single, servable hot dog." },
] as const;

/** Bands for the rating chip and leaderboard copy. */
export function ratingBand(rating: number): "exemplary" | "compliant" | "marginal" {
  if (rating >= 85) return "exemplary";
  if (rating >= 60) return "compliant";
  return "marginal";
}
