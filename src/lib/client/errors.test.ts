import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/types";
import {
  CLIENT_ERROR_CODES,
  errorCopy,
  formatRetryAfter,
  isRetryableCode,
  ScanRequestError,
  toScanRequestError,
  type ClientErrorCode,
} from "./errors";

const ALL_CODES: ClientErrorCode[] = [...API_ERROR_CODES, ...CLIENT_ERROR_CODES];

describe("errorCopy", () => {
  it.each(ALL_CODES)("has a title and body for %s, with and without a retry hint", (code) => {
    for (const copy of [errorCopy(code), errorCopy(code, { retryAfterSeconds: 90 })]) {
      expect(copy.title.trim().length).toBeGreaterThan(0);
      expect(copy.body.trim().length).toBeGreaterThan(0);
      expect(`${copy.title} ${copy.body}`).not.toMatch(/undefined|null|NaN/);
    }
  });

  it("gives every code its own title", () => {
    const titles = new Set(ALL_CODES.map((code) => errorCopy(code).title));
    expect(titles.size).toBe(ALL_CODES.length);
  });

  it("works as errorCopy(error.code, error) with an ApiError", () => {
    const apiError = { code: "RATE_LIMITED" as const, message: "Slow down", requestId: "req_1", retryAfterSeconds: 30 };
    expect(errorCopy(apiError.code, apiError)).toEqual({
      title: "Throughput threshold reached",
      body: "You've used your scan allowance for now. Capacity frees up in 30 seconds.",
    });
  });

  it("falls back to a generic body when no wait time is known", () => {
    expect(errorCopy("RATE_LIMITED").body).toMatch(/wait a moment/);
    expect(errorCopy("RATE_LIMITED", { retryAfterSeconds: 0 }).body).toMatch(/wait a moment/);
    expect(errorCopy("CAPACITY_EXCEEDED").body).toMatch(/tomorrow/);
    expect(errorCopy("CAPACITY_EXCEEDED", { retryAfterSeconds: 3 * 3600 }).body).toMatch(/about 3 hours/);
  });

  it("falls back to INTERNAL for codes from a newer server", () => {
    expect(errorCopy("SOMETHING_NEW" as ApiErrorCode)).toEqual(errorCopy("INTERNAL"));
  });
});

describe("formatRetryAfter", () => {
  it.each([
    [0.2, "1 second"],
    [1, "1 second"],
    [42, "42 seconds"],
    [60, "about a minute"],
    [61, "about 2 minutes"],
    [59 * 60, "about 59 minutes"],
    [3600, "about an hour"],
    [5 * 3600 + 100, "about 5 hours"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatRetryAfter(seconds)).toBe(expected);
  });
});

describe("isRetryableCode", () => {
  it("offers a retry for transient failures only", () => {
    const transient: ClientErrorCode[] = ["NETWORK_ERROR", "AI_TIMEOUT", "AI_UNAVAILABLE", "RATE_LIMITED", "INTERNAL"];
    const badImage: ClientErrorCode[] = ["INVALID_IMAGE", "UNSUPPORTED_MEDIA_TYPE", "IMAGE_TOO_LARGE", "UNPROCESSABLE_IMAGE"];
    expect(transient.every(isRetryableCode)).toBe(true);
    expect(badImage.some(isRetryableCode)).toBe(false);
    expect(isRetryableCode("CAPACITY_EXCEEDED")).toBe(false);
  });
});

describe("toScanRequestError", () => {
  it("passes ScanRequestErrors through", () => {
    const error = new ScanRequestError("AI_TIMEOUT", "Too slow", { requestId: "req_2" });
    expect(toScanRequestError(error)).toBe(error);
  });

  it("maps AbortError to ABORTED", () => {
    const result = toScanRequestError(new DOMException("aborted", "AbortError"));
    expect(result.code).toBe("ABORTED");
  });

  it("wraps anything else as INTERNAL with a user-safe message", () => {
    const cause = new Error("secret internals");
    const result = toScanRequestError(cause);
    expect(result.code).toBe("INTERNAL");
    expect(result.message).not.toContain("secret");
    expect(result.cause).toBe(cause);
  });
});
