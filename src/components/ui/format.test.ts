import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatConfidence,
  formatConfidenceValue,
  formatCount,
  formatDate,
  formatDateTimeUtc,
  formatLatency,
  formatPercent,
  formatUtcTime,
  initials,
  ratingBandLabel,
  regionLabel,
  usageRatio,
  usageSummary,
  verdictLabel,
} from "./format";

describe("number formatters", () => {
  it("formats confidence as a percentage", () => {
    expect(formatConfidence(0.992)).toBe("99.2%");
    expect(formatConfidence(0.98765, 2)).toBe("98.77%");
    expect(formatConfidenceValue(0.926)).toBe("92.6");
  });

  it("clamps confidence to 0..100", () => {
    expect(formatConfidence(1.2)).toBe("100.0%");
    expect(formatConfidence(-0.1)).toBe("0.0%");
  });

  it("formats shares and counts", () => {
    expect(formatPercent(0.314)).toBe("31.4%");
    expect(formatCount(48213906)).toBe("48,213,906");
    expect(formatCount(0)).toBe("0");
  });

  it("formats latency", () => {
    expect(formatLatency(412)).toBe("412 ms");
    expect(formatLatency(411.6)).toBe("412 ms");
    expect(formatLatency(1530)).toBe("1.5 s");
    expect(formatLatency(null)).toBe("—");
  });

  it("formats bytes", () => {
    expect(formatBytes(2516582)).toBe("2.4 MB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(null)).toBe("—");
  });
});

describe("date formatters", () => {
  const iso = "2026-10-24T14:32:07.530Z";

  it("formats UTC times", () => {
    expect(formatUtcTime(iso)).toBe("14:32:07");
    expect(formatUtcTime(iso, { ms: true })).toBe("14:32:07.530");
    expect(formatUtcTime("2026-10-24T03:04:05+02:00")).toBe("01:04:05");
  });

  it("formats dates in UTC", () => {
    expect(formatDate(iso)).toBe("Oct 24, 2026");
    expect(formatDate("2026-10-24T23:30:00-05:00")).toBe("Oct 25, 2026");
    expect(formatDateTimeUtc(iso)).toBe("Oct 24, 2026 · 14:32:07 UTC");
    expect(formatDateTimeUtc(iso, { ms: true })).toBe("Oct 24, 2026 · 14:32:07.530 UTC");
  });

  it("returns a dash for invalid input", () => {
    expect(formatUtcTime("nope")).toBe("—");
    expect(formatDate("nope")).toBe("—");
    expect(formatDateTimeUtc("nope")).toBe("—");
  });
});

describe("labels", () => {
  it("labels verdicts", () => {
    expect(verdictLabel("hot_dog")).toBe("HOT DOG");
    expect(verdictLabel("not_hot_dog")).toBe("NOT HOT DOG");
  });

  it("labels regions", () => {
    expect(regionLabel("EU-C")).toBe("EU-Central");
    expect(regionLabel("AP-NE")).toBe("Asia Pacific-Northeast");
    expect(regionLabel("XX-1")).toBe("XX-1");
    expect(regionLabel(null)).toBe("Unknown region");
  });

  it("builds initials", () => {
    expect(initials("Dana Kessler")).toBe("DK");
    expect(initials("  ada   lovelace byron ")).toBe("AB");
    expect(initials("Cher")).toBe("CH");
    expect(initials(null, "dana@example.com")).toBe("D");
    expect(initials("", null)).toBe("?");
  });

  it("labels rating bands", () => {
    expect(ratingBandLabel(92)).toBe("Exemplary");
    expect(ratingBandLabel(85)).toBe("Exemplary");
    expect(ratingBandLabel(60)).toBe("Compliant");
    expect(ratingBandLabel(12)).toBe("Marginal");
  });
});

describe("usage", () => {
  it("summarises free and business usage", () => {
    expect(usageSummary({ plan: "free", used: 3, limit: 20, remaining: 17 })).toBe("3 of 20 classifications used");
    expect(usageSummary({ plan: "business", used: 1234, limit: null, remaining: null })).toBe("Business plan · unlimited");
  });

  it("computes a clamped ratio", () => {
    expect(usageRatio({ plan: "anonymous", used: 5, limit: 20, remaining: 15 })).toBe(0.25);
    expect(usageRatio({ plan: "free", used: 25, limit: 20, remaining: 0 })).toBe(1);
    expect(usageRatio({ plan: "business", used: 25, limit: null, remaining: null })).toBe(0);
  });
});
