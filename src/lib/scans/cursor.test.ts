import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { decodeCursor, encodeCursor } from "./cursor";

const cursor = { createdAt: "2026-10-24T10:15:56.123456+00:00", id: "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b" };

describe("scan cursor", () => {
  it("round-trips and keeps microsecond precision", () => {
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it.each([
    "",
    "not-base64-json",
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify(["yesterday", cursor.id])).toString("base64url"),
    Buffer.from(JSON.stringify([cursor.createdAt, "1 or 1=1"])).toString("base64url"),
    // A filter-injection attempt hidden in the timestamp.
    Buffer.from(JSON.stringify([`${cursor.createdAt}),id.gt.0`, cursor.id])).toString("base64url"),
  ])("rejects %j with INVALID_REQUEST", (value) => {
    expect(() => decodeCursor(value)).toThrow(AppError);
    try {
      decodeCursor(value);
    } catch (error) {
      expect((error as AppError).code).toBe("INVALID_REQUEST");
    }
  });
});
