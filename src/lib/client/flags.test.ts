import { describe, expect, it } from "vitest";
import { CLASSIFICATION_FLAGS } from "@/lib/types";
import { FLAG_DESCRIPTIONS, FLAG_LABELS } from "./flags";

describe("flag copy", () => {
  it("labels exactly the classifier's flags", () => {
    expect(Object.keys(FLAG_LABELS).sort()).toEqual([...CLASSIFICATION_FLAGS].sort());
    expect(Object.keys(FLAG_DESCRIPTIONS).sort()).toEqual([...CLASSIFICATION_FLAGS].sort());
  });

  it.each(CLASSIFICATION_FLAGS)("has a chip-sized label and a one-line tooltip for %s", (flag) => {
    expect(FLAG_LABELS[flag].length).toBeGreaterThan(0);
    expect(FLAG_LABELS[flag].length).toBeLessThanOrEqual(24);
    expect(FLAG_DESCRIPTIONS[flag].length).toBeGreaterThan(0);
    expect(FLAG_DESCRIPTIONS[flag]).not.toContain("\n");
  });
});
