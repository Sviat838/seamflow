import { describe, expect, it } from "vitest";
import { POLICY_CLAUSE_IDS, POLICY_CLAUSES, RATING_RUBRIC, ratingBand } from "@/lib/policy";
import { CLASSIFICATION_FLAGS } from "@/lib/types";
import { OUTPUT_SCHEMA, REVIEW_OUTPUT_SCHEMA, REVIEW_SYSTEM_PROMPT, SYSTEM_PROMPT, withRepairNote } from "./prompt";

describe.each([
  ["classifier", SYSTEM_PROMPT],
  ["review board", REVIEW_SYSTEM_PROMPT],
])("%s system prompt", (_name, prompt) => {
  it("lists every clause of the policy with its verdict group, title and rule", () => {
    const hotDogGroup = prompt.slice(prompt.indexOf('verdict "hot_dog":'), prompt.indexOf('verdict "not_hot_dog":'));
    for (const clause of POLICY_CLAUSES) {
      expect(prompt).toContain(`- §${clause.id} ${clause.title}: ${clause.rule}`);
      expect(hotDogGroup.includes(`§${clause.id} `)).toBe(clause.verdict === "hot_dog");
    }
  });

  it("only cites clauses that exist", () => {
    const cited = new Set([...prompt.matchAll(/§(\d+\.\d+)/g)].map((match) => match[1]));
    expect([...cited].filter((id) => !(POLICY_CLAUSE_IDS as string[]).includes(id))).toEqual([]);
  });

  it("includes the rating rubric", () => {
    for (const criterion of RATING_RUBRIC) expect(prompt).toContain(`- ${criterion.label}: ${criterion.description}`);
  });

  it("names only real flags", () => {
    const quoted = [...prompt.matchAll(/add "([a-z_]+)"/g)].map((match) => match[1]);
    expect(quoted.length).toBeGreaterThan(5);
    expect(quoted.filter((flag) => !(CLASSIFICATION_FLAGS as readonly string[]).includes(flag))).toEqual([]);
  });

  it("states the same rating bands as ratingBand()", () => {
    expect(prompt).toContain("85 and above is exemplary, 60 to 84 compliant, below 60 marginal");
    expect([ratingBand(85), ratingBand(84), ratingBand(60), ratingBand(59)]).toEqual([
      "exemplary",
      "compliant",
      "compliant",
      "marginal",
    ]);
  });
});

describe("output schemas", () => {
  it("constrain the clause to policy ids and require every property", () => {
    for (const schema of [OUTPUT_SCHEMA, REVIEW_OUTPUT_SCHEMA]) {
      expect(schema.properties.policyClause.enum).toEqual(POLICY_CLAUSE_IDS);
      expect(schema.required).toEqual(Object.keys(schema.properties));
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it("put the clause before the verdict, and the review decision after the classification", () => {
    expect(Object.keys(OUTPUT_SCHEMA.properties).indexOf("policyClause")).toBeLessThan(
      Object.keys(OUTPUT_SCHEMA.properties).indexOf("verdict"),
    );
    expect(Object.keys(REVIEW_OUTPUT_SCHEMA.properties).slice(-2)).toEqual(["decision", "ruling"]);
  });
});

describe("withRepairNote", () => {
  it("leaves the first attempt untouched and explains a rejection", () => {
    expect(withRepairNote("Classify.", null)).toBe("Classify.");
    expect(withRepairNote("Classify.", "verdict: invalid")).toContain("A previous attempt was rejected (verdict: invalid).");
  });
});
