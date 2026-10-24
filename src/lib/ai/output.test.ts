import { describe, expect, it } from "vitest";
import type { ClassificationFlag, Verdict } from "@/lib/types";
import { inferClause, OUTPUT_LIMITS, parseClassification, parseReview } from "./output";

const hotDog = {
  detectedItems: ["bratwurst", "split roll"],
  reasoning: "A grilled bratwurst is seated in a split roll. Sausage variety is immaterial under §2.2.",
  flags: [],
  policyClause: "2.2",
  verdict: "hot_dog",
  confidence: 0.94,
  summary: "Bratwurst admitted to the hot dog programme on standard terms.",
  rating: 81,
  ratingNote: "Roll slightly oversized for the sausage.",
};

const notHotDog = {
  ...hotDog,
  detectedItems: ["pizza slice"],
  reasoning: "A slice of flatbread with pepperoni. Flatbreads are excluded under §3.5.",
  policyClause: "3.5",
  verdict: "not_hot_dog",
  rating: null,
  ratingNote: null,
};

const json = (value: unknown) => JSON.stringify(value);

function parsed(value: unknown) {
  const result = parseClassification(json(value));
  if (!result.ok) throw new Error(`expected a classification, got: ${result.reason}`);
  return result;
}

describe("parseClassification", () => {
  it("accepts a consistent classification without an issue", () => {
    const result = parsed(hotDog);
    expect(result.issue).toBeUndefined();
    expect(result.value).toMatchObject({ policyClause: "2.2", rating: 81, ratingNote: hotDog.ratingNote });
  });

  it("accepts a clause written with the section sign", () => {
    const result = parsed({ ...hotDog, policyClause: " §2.4 ", flags: ["corn_dog"] });
    expect(result.value.policyClause).toBe("2.4");
    expect(result.issue).toBeUndefined();
  });

  it("repairs an unknown clause and reports why", () => {
    const result = parsed({ ...notHotDog, policyClause: "4.1" });
    expect(result.value.policyClause).toBe("3.9");
    expect(result.issue).toBe('policyClause "4.1" is not a clause of Policy v3.2');
  });

  it("repairs a missing clause", () => {
    const result = parsed({ ...hotDog, policyClause: undefined });
    expect(result.value.policyClause).toBe("2.1");
    expect(result.issue).toContain("is not a clause");
  });

  it("keeps the verdict and replaces a clause of the other verdict", () => {
    const result = parsed({ ...notHotDog, policyClause: "2.1", flags: ["actual_dog"] });
    expect(result.value).toMatchObject({ verdict: "not_hot_dog", policyClause: "3.6" });
    expect(result.issue).toBe("policyClause 2.1 (Canonical form) is a hot_dog clause but the verdict is not_hot_dog");
  });

  it("nulls the rating and note for NOT HOT DOG", () => {
    const result = parsed({ ...notHotDog, rating: 55, ratingNote: "Pepperoni evenly distributed." });
    expect(result.value).toMatchObject({ rating: null, ratingNote: null });
    expect(result.issue).toBeUndefined();
  });

  it.each([
    [83.6, 84],
    [140, 100],
    [-5, 0],
  ])("rounds and clamps a rating of %s to %s", (rating, expected) => {
    expect(parsed({ ...hotDog, rating }).value.rating).toBe(expected);
  });

  it.each([null, "high", Number.NaN, undefined])("flags a hot dog rating of %s as an issue and leaves it null", (rating) => {
    const result = parsed({ ...hotDog, rating });
    expect(result.value).toMatchObject({ rating: null, ratingNote: null });
    expect(result.issue).toBe("rating must be an integer from 0 to 100 for a hot_dog verdict");
  });

  it("trims the rating note and drops an empty one", () => {
    expect(parsed({ ...hotDog, ratingNote: "   " }).value.ratingNote).toBeNull();
    expect(parsed({ ...hotDog, ratingNote: null }).value.ratingNote).toBeNull();
    const long = parsed({ ...hotDog, ratingNote: `  Bun   ${"exemplary ".repeat(40)}` }).value.ratingNote;
    expect(long?.startsWith("Bun exemplary")).toBe(true);
    expect(long?.length).toBe(OUTPUT_LIMITS.ratingNote);
  });

  it("joins several issues into one rejection note", () => {
    const result = parsed({ ...hotDog, policyClause: "3.1", rating: null });
    expect(result.issue).toBe(
      "policyClause 3.1 (Pastry-wrapped sausages) is a not_hot_dog clause but the verdict is hot_dog; rating must be an integer from 0 to 100 for a hot_dog verdict",
    );
  });

  it("rejects output it can't repair", () => {
    expect(parseClassification("{")).toEqual({ ok: false, reason: "output was not valid JSON" });
    const result = parseClassification(json({ ...hotDog, verdict: "maybe" }));
    expect(result.ok).toBe(false);
  });
});

describe("inferClause", () => {
  it.each<[Verdict, ClassificationFlag[], string]>([
    ["hot_dog", [], "2.1"],
    ["hot_dog", ["corn_dog"], "2.4"],
    ["hot_dog", ["illustration"], "2.5"],
    ["hot_dog", ["costume_or_toy", "partial_view"], "2.5"],
    ["not_hot_dog", [], "3.9"],
    ["not_hot_dog", ["actual_dog"], "3.6"],
    ["not_hot_dog", ["sausage_without_bun"], "3.2"],
    ["not_hot_dog", ["bun_without_sausage"], "3.4"],
    ["not_hot_dog", ["illustration"], "3.9"],
  ])("%s with %j -> §%s", (verdict, flags, expected) => {
    expect(inferClause(verdict, flags)).toBe(expected);
  });
});

describe("parseReview", () => {
  const ruling = "The Board has examined the submitted image. The subject is a bratwurst in a split roll (§2.2). The original verdict is overturned.";

  it("returns an overturned decision with the Board's classification", () => {
    const result = parseReview(json({ ...hotDog, decision: "overturned", ruling }), "not_hot_dog");
    expect(result).toEqual({
      ok: true,
      value: { decision: "overturned", ruling, classification: expect.objectContaining({ verdict: "hot_dog", policyClause: "2.2", rating: 81 }) },
    });
  });

  it("returns an upheld decision when the verdict is unchanged", () => {
    const result = parseReview(json({ ...notHotDog, decision: "upheld", ruling: "  The original verdict stands.  " }), "not_hot_dog");
    expect(result).toMatchObject({ ok: true, value: { decision: "upheld", ruling: "The original verdict stands." } });
  });

  it("rejects a decision that contradicts the verdicts", () => {
    const result = parseReview(json({ ...hotDog, decision: "upheld", ruling }), "not_hot_dog");
    expect(result).toEqual({
      ok: false,
      reason: 'decision "upheld" contradicts the verdicts (original not_hot_dog, Board hot_dog): "upheld" means the same verdict',
    });
  });

  it("rejects a missing ruling or decision", () => {
    expect(parseReview(json({ ...hotDog, decision: "overturned", ruling: " " }), "not_hot_dog").ok).toBe(false);
    expect(parseReview(json({ ...hotDog, decision: "pending", ruling }), "not_hot_dog").ok).toBe(false);
  });

  it("passes a repairable classification issue through", () => {
    const result = parseReview(json({ ...hotDog, policyClause: "3.3", decision: "overturned", ruling }), "not_hot_dog");
    expect(result).toMatchObject({ ok: true, value: { classification: { policyClause: "2.1" } } });
    expect(result.ok && result.issue).toContain("policyClause 3.3");
  });

  it("clips an overlong ruling", () => {
    const result = parseReview(json({ ...hotDog, decision: "overturned", ruling: "Whereas ".repeat(200) }), "not_hot_dog");
    expect(result.ok && result.value.ruling.length).toBe(OUTPUT_LIMITS.ruling);
  });
});
