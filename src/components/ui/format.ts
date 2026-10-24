// Display formatters shared by every page. Fixed locale and UTC so server and client render
// the same string (no hydration mismatches) and the product reads like one report.

import { ratingBand } from "@/lib/policy";
import type { RegionCode, Usage, Verdict } from "@/lib/types";

const LOCALE = "en-US";

const countFormat = new Intl.NumberFormat(LOCALE);
const dateFormat = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** 0.992 -> "99.2%". Clamped to 0..100 so a stray value never reads as 100.4%. */
export function formatConfidence(confidence: number, digits = 1): string {
  return `${formatConfidenceValue(confidence, digits)}%`;
}

/** 0.992 -> "99.2" (feed rows print the number without the sign). */
export function formatConfidenceValue(confidence: number, digits = 1): string {
  const pct = Math.min(100, Math.max(0, confidence * 100));
  return pct.toFixed(digits);
}

/** 0.314 -> "31.4%". */
export function formatPercent(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

/** 48213906 -> "48,213,906". */
export function formatCount(n: number): string {
  return countFormat.format(n);
}

/** 412 -> "412 ms", 1530 -> "1.5 s"; null -> "—". */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** 2516582 -> "2.4 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ISO -> "14:32:07" (UTC); with { ms: true } -> "14:32:07.530". */
export function formatUtcTime(value: string | number | Date, opts: { ms?: boolean } = {}): string {
  const date = toDate(value);
  if (!date) return "—";
  const base = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return opts.ms ? `${base}.${pad(date.getUTCMilliseconds(), 3)}` : base;
}

/** ISO -> "Oct 24, 2026" (UTC). */
export function formatDate(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "—";
}

/** ISO -> "Oct 24, 2026 · 14:32:07 UTC". */
export function formatDateTimeUtc(value: string | number | Date, opts: { ms?: boolean } = {}): string {
  const date = toDate(value);
  return date ? `${formatDate(date)} · ${formatUtcTime(date, opts)} UTC` : "—";
}

export function verdictLabel(verdict: Verdict): "HOT DOG" | "NOT HOT DOG" {
  return verdict === "hot_dog" ? "HOT DOG" : "NOT HOT DOG";
}

const REGION_LABELS: Record<RegionCode, string> = {
  "EU-C": "EU-Central",
  "EU-W": "EU-West",
  "EU-N": "EU-North",
  "US-E": "US-East",
  "US-C": "US-Central",
  "US-W": "US-West",
  "SA-E": "South America-East",
  "AP-NE": "Asia Pacific-Northeast",
  "AP-SE": "Asia Pacific-Southeast",
  "AP-S": "Asia Pacific-South",
  "AF-S": "Africa-South",
};

/** "EU-C" -> "EU-Central". */
export function regionLabel(code: string | null | undefined): string {
  if (!code) return "Unknown region";
  return REGION_LABELS[code as RegionCode] ?? code;
}

/** "Dana Kessler" -> "DK"; falls back to the email's first letter, then "?". */
export function initials(name: string | null | undefined, fallback?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const alt = fallback?.trim();
  return alt ? alt[0].toUpperCase() : "?";
}

/** 92 -> "Exemplary". */
export function ratingBandLabel(rating: number): string {
  const band = ratingBand(rating);
  return band[0].toUpperCase() + band.slice(1);
}

/** "3 of 20 classifications used" or "Business plan · unlimited". */
export function usageSummary(usage: Usage): string {
  if (usage.limit == null) return "Business plan · unlimited";
  return `${formatCount(usage.used)} of ${formatCount(usage.limit)} classifications used`;
}

/** 0..1 share of the Free allowance used, for progress bars. */
export function usageRatio(usage: Usage): number {
  if (usage.limit == null || usage.limit <= 0) return 0;
  return Math.min(1, Math.max(0, usage.used / usage.limit));
}
