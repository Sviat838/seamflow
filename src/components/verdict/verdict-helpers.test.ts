import { describe, expect, it } from "vitest";
import { POLICY_CLAUSE_IDS } from "@/lib/policy";
import { clauseAnchorId, clauseHref } from "./clause";
import { verdictStatusLabel } from "./status";

describe("clause anchors", () => {
  it("builds stable ids and hrefs", () => {
    expect(clauseAnchorId("2.1")).toBe("clause-2-1");
    expect(clauseAnchorId(" 3.9 ")).toBe("clause-3-9");
    expect(clauseHref("3.5")).toBe("/policy#clause-3-5");
  });

  it("gives every policy clause a unique id", () => {
    const ids = POLICY_CLAUSE_IDS.map(clauseAnchorId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never returns an empty slug", () => {
    expect(clauseAnchorId("§")).toBe("clause-unknown");
  });
});

describe("verdictStatusLabel", () => {
  it("labels each review state", () => {
    expect(verdictStatusLabel(null)).toBe("Final · Subject to appeal");
    expect(verdictStatusLabel(undefined, { compact: true })).toBe("Final");
    expect(verdictStatusLabel("pending")).toBe("Under review");
    expect(verdictStatusLabel("upheld")).toBe("Upheld on appeal");
    expect(verdictStatusLabel("overturned")).toBe("Overturned on appeal");
    expect(verdictStatusLabel("overturned", { compact: true })).toBe("Overturned");
  });
});
