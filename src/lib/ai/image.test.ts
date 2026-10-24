import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { MAX_IMAGE_BYTES } from "@/lib/types";
import { assertValidImage, sniffImageType } from "./image";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? Array.from(part, (c) => c.charCodeAt(0)) : part)));

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "JFIF", [0, 1, 1]);
// Signature + IHDR chunk (length, type, 13 data bytes, CRC): the shortest header assertValidImage accepts.
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR", new Array(17).fill(0));
const GIF87 = bytes("GIF87a", [1, 0, 1, 0, 0, 0, 0]);
const GIF89 = bytes("GIF89a", [1, 0, 1, 0, 0, 0, 0]);
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ", [0, 0, 0, 0]);

/** ISO-BMFF ftyp box as HEIC/AVIF files start: size, "ftyp", major brand, version, compatible brands. */
function ftyp(major: string, ...compatible: string[]) {
  const size = 16 + compatible.length * 4;
  return bytes([0, 0, 0, size], "ftyp", major, [0, 0, 0, 0], ...compatible, [0, 0, 0, 0]);
}

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected an AppError");
}

describe("sniffImageType", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["GIF87a", GIF87, "image/gif"],
    ["GIF89a", GIF89, "image/gif"],
    ["WebP", WEBP, "image/webp"],
  ])("detects %s from magic bytes", (_, input, expected) => {
    expect(sniffImageType(input)).toBe(expected);
  });

  it("detects the generated fixtures", () => {
    expect(sniffImageType(fixture("hot-dog-drawing.png"))).toBe("image/png");
    expect(sniffImageType(fixture("landscape.jpg"))).toBe("image/jpeg");
    expect(sniffImageType(fixture("injection-mug.webp"))).toBe("image/webp");
  });

  it("works on a view into a larger buffer", () => {
    const buffer = new Uint8Array(64);
    buffer.set(PNG, 10);
    expect(sniffImageType(buffer.subarray(10))).toBe("image/png");
  });

  it.each([
    ["empty", new Uint8Array()],
    ["HEIC", ftyp("heic", "mif1", "heic")],
    ["RIFF that isn't WebP (WAV)", bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ")],
    ["GIF with an unknown version", bytes("GIF88a", [0, 0, 0, 0])],
    ["plain text", bytes("hello, this is not an image")],
    ["a truncated PNG signature", PNG.subarray(0, 4)],
  ])("returns null for %s", (_, input) => {
    expect(sniffImageType(input)).toBeNull();
  });
});

describe("assertValidImage", () => {
  it("returns the sniffed type for accepted images", () => {
    expect(assertValidImage(JPEG)).toBe("image/jpeg");
    expect(assertValidImage(PNG)).toBe("image/png");
    expect(assertValidImage(GIF89)).toBe("image/gif");
    expect(assertValidImage(WEBP)).toBe("image/webp");
  });

  it("rejects empty input as INVALID_IMAGE", () => {
    expect(errorOf(() => assertValidImage(new Uint8Array())).code).toBe("INVALID_IMAGE");
  });

  it.each([
    ["JPEG (partial signature)", JPEG.subarray(0, 2)],
    ["JPEG (signature only)", JPEG.subarray(0, 3)],
    ["PNG (partial signature)", PNG.subarray(0, 5)],
    ["PNG (signature only)", PNG.subarray(0, 8)],
    ["PNG (IHDR cut off)", PNG.subarray(0, 20)],
    ["GIF (partial signature)", bytes("GIF8")],
    ["GIF (signature only)", bytes("GIF89a")],
    ["WebP (before the form type)", bytes("RIFF", [0x24, 0, 0])],
    ["WebP (no chunk header)", WEBP.subarray(0, 12)],
  ])("rejects a truncated %s as INVALID_IMAGE", (_, input) => {
    const error = errorOf(() => assertValidImage(input));
    expect(error.code).toBe("INVALID_IMAGE");
    expect(error.status).toBe(400);
  });

  it("accepts exactly MAX_IMAGE_BYTES and rejects one byte more", () => {
    const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
    atLimit.set(JPEG);
    expect(assertValidImage(atLimit)).toBe("image/jpeg");

    const overLimit = new Uint8Array(MAX_IMAGE_BYTES + 1);
    overLimit.set(JPEG);
    const error = errorOf(() => assertValidImage(overLimit));
    expect(error.code).toBe("IMAGE_TOO_LARGE");
    expect(error.status).toBe(413);
    expect(error.message).toContain("4 MB");
  });

  it.each([
    ["HEIC (major brand heic)", ftyp("heic", "mif1", "heic")],
    ["HEIF (major brand mif1, compatible heic)", ftyp("mif1", "heic")],
  ])("explains %s with an export-as-JPEG hint", (_, input) => {
    const error = errorOf(() => assertValidImage(input));
    expect(error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(error.status).toBe(415);
    expect(error.message).toMatch(/HEIC/);
    expect(error.message).toMatch(/JPEG/);
  });

  it.each([
    ["major brand avif", ftyp("avif", "mif1", "miaf")],
    ["major brand mif1, compatible avif", ftyp("mif1", "avif", "miaf")],
  ])("names AVIF (%s)", (_, input) => {
    const error = errorOf(() => assertValidImage(input));
    expect(error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(error.message).toMatch(/^AVIF/);
  });

  it("reports the format before the size, so an oversized HEIC still gets the JPEG hint", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 10);
    huge.set(ftyp("heic", "mif1"));
    expect(errorOf(() => assertValidImage(huge)).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it.each([
    ["BMP", bytes("BM", [0x36, 0, 0, 0, 0, 0, 0, 0])],
    ["TIFF", bytes([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0])],
    ["PDF", bytes("%PDF-1.7\n")],
    ["SVG", bytes('  <svg xmlns="http://www.w3.org/2000/svg"></svg>')],
  ])("names %s in the unsupported-type message", (format, input) => {
    const error = errorOf(() => assertValidImage(input));
    expect(error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(error.message).toContain(format);
  });

  it("falls back to a generic message for unknown bytes", () => {
    const error = errorOf(() => assertValidImage(bytes("definitely not an image")));
    expect(error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(error.message).toBe("Unsupported file type. Please upload a JPEG, PNG, WebP or GIF image.");
  });
});
