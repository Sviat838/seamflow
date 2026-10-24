import { describe, expect, it } from "vitest";
import { formatBytes, intakeAuditEvents, verdictSentence, type IntakeAuditInput } from "./audit";

const input: IntakeAuditInput = {
  submitter: "Dana Kessler",
  fileName: "frankfurter_lot14.jpg",
  mimeType: "image/jpeg",
  imageBytes: 2_516_582,
  sha256: "9f2c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7ae41a",
  imageStored: true,
  verdict: "hot_dog",
  confidence: 0.992,
  policyClause: "2.1",
  model: "claude-opus-5-5",
  cached: false,
};

describe("intakeAuditEvents", () => {
  it("matches the board's audit trail wording", () => {
    expect(intakeAuditEvents(input)).toEqual([
      {
        event: "uploaded",
        actor: "Dana Kessler · Web console",
        detail: "frankfurter_lot14.jpg received from Dana Kessler via Web console.",
      },
      {
        event: "screened",
        actor: "HDX intake",
        detail:
          "Image screened: JPEG verified from file contents, 2.4 MB, SHA-256 9f2c…e41a. Image retained 24 hours, then deleted automatically. No raw IP address stored.",
      },
      {
        event: "classified",
        actor: "claude-opus-5-5 · HDX policy engine 3.2.1",
        detail: "HOT DOG at 99.2% confidence under Policy v3.2, §2.1.",
      },
    ]);
  });

  it("doesn't claim retention for images that weren't stored, or a name that wasn't sent", () => {
    const [uploaded, screened] = intakeAuditEvents({
      ...input,
      submitter: "Anonymous visitor",
      fileName: null,
      imageStored: false,
      mimeType: "image/webp",
      imageBytes: 900,
    });
    expect(uploaded.detail).toBe("Image received from Anonymous visitor via Web console.");
    expect(screened.detail).toContain("WebP verified from file contents, 900 B");
    expect(screened.detail).toContain("Image not retained.");
    expect(screened.detail).not.toContain("retained 24 hours");
  });

  it("says when a verdict was reused", () => {
    const classified = intakeAuditEvents({ ...input, cached: true })[2];
    expect(classified.detail).toBe(
      "HOT DOG at 99.2% confidence under Policy v3.2, §2.1. Verdict reused from an identical earlier submission.",
    );
  });

  it("fits the audit table's column limits", () => {
    const long = intakeAuditEvents({ ...input, submitter: "x".repeat(100), fileName: "y".repeat(120) });
    for (const event of long) expect(event.detail.length).toBeLessThanOrEqual(500);
  });
});

describe("formatting", () => {
  it("formats sizes and verdicts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(340 * 1024)).toBe("340 KB");
    expect(formatBytes(4 * 1024 * 1024)).toBe("4.0 MB");
    expect(verdictSentence("not_hot_dog", 0.987, "3.5")).toBe("NOT HOT DOG at 98.7% confidence under Policy v3.2, §3.5.");
  });
});
