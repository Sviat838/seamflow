import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  isCaseNumber,
  isScanId,
  isShareSlug,
  parseCreateScanForm,
  parseListScansQuery,
  parseUpdateScanRequest,
  sanitizeFileName,
} from "./validation";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_APP_ERROR";
  }
  return undefined;
}

const image = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "dog.jpg", { type: "image/jpeg" });

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("ids and slugs", () => {
  it("accepts real ids and slugs only", () => {
    expect(isScanId(crypto.randomUUID())).toBe(true);
    expect(isScanId("../etc/passwd")).toBe(false);
    expect(isShareSlug("AbCdEfGh_-12")).toBe(true);
    expect(isShareSlug("AbCdEfGh_-1")).toBe(false);
    expect(isShareSlug("AbCdEfGh+/12")).toBe(false);
  });
});

describe("isCaseNumber", () => {
  it("accepts the DB's case number format only", () => {
    expect(isCaseNumber("HDX-2026-1024-7731")).toBe(true);
    expect(isCaseNumber("HDX-2026-1024-1234567")).toBe(true);
    expect(isCaseNumber("HDX-2026-1024-773")).toBe(false);
    expect(isCaseNumber("hdx-2026-1024-7731")).toBe(false);
    expect(isCaseNumber("HDX-2026-1024-7731,id.neq.0")).toBe(false);
    expect(isCaseNumber(`HDX-2026-1024-${"9".repeat(40)}`)).toBe(false);
    expect(isCaseNumber(7731)).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("keeps ordinary names as they are", () => {
    expect(sanitizeFileName("frankfurter_lot14.jpg")).toBe("frankfurter_lot14.jpg");
    expect(sanitizeFileName("  Hot dog (2).JPG ")).toBe("Hot dog (2).JPG");
  });

  it("drops directories from Windows and POSIX paths", () => {
    expect(sanitizeFileName("C:\\fakepath\\dog.png")).toBe("dog.png");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
  });

  it("strips control and bidi characters", () => {
    expect(sanitizeFileName("dog\u0000\n\t.jpg")).toBe("dog.jpg");
    expect(sanitizeFileName("photo\u202Egpj.exe")).toBe("photogpj.exe");
  });

  it("caps the length at 120 characters without splitting emoji", () => {
    expect(Array.from(sanitizeFileName("a".repeat(300) + ".jpg")!)).toHaveLength(120);
    expect(Array.from(sanitizeFileName("🌭".repeat(130))!)).toHaveLength(120);
  });

  it("returns null when nothing usable is left", () => {
    expect(sanitizeFileName("")).toBeNull();
    expect(sanitizeFileName("dir/")).toBeNull();
    expect(sanitizeFileName("\u0001\u0002")).toBeNull();
    expect(sanitizeFileName(null)).toBeNull();
    expect(sanitizeFileName(42)).toBeNull();
  });
});

describe("parseCreateScanForm", () => {
  it("reads the image and the public flag", () => {
    const file = image();
    expect(parseCreateScanForm(form({ image: file }))).toEqual({ file, isPublic: false });
    expect(parseCreateScanForm(form({ image: file, public: "true" })).isPublic).toBe(true);
    expect(parseCreateScanForm(form({ image: file, public: "false" })).isPublic).toBe(false);
    expect(parseCreateScanForm(form({ image: file, public: "on" })).isPublic).toBe(true);
  });

  it("rejects a missing, empty, or text image and a bad flag", () => {
    expect(codeOf(() => parseCreateScanForm(form({})))).toBe("INVALID_REQUEST");
    expect(codeOf(() => parseCreateScanForm(form({ image: "hot dog" })))).toBe("INVALID_REQUEST");
    expect(codeOf(() => parseCreateScanForm(form({ image: new File([], "") })))).toBe("INVALID_REQUEST");
    expect(codeOf(() => parseCreateScanForm(form({ image: image(), public: "yes" })))).toBe("INVALID_REQUEST");
    expect(codeOf(() => parseCreateScanForm({ image: image() } as unknown as FormData))).toBe("INVALID_REQUEST");
  });
});

describe("parseUpdateScanRequest", () => {
  it("accepts feedback, clearing it, and the public flag", () => {
    expect(parseUpdateScanRequest({ feedback: "correct" })).toEqual({ feedback: "correct" });
    expect(parseUpdateScanRequest({ feedback: null })).toEqual({ feedback: null });
    expect(parseUpdateScanRequest({ isPublic: true, feedback: "incorrect" })).toEqual({
      isPublic: true,
      feedback: "incorrect",
    });
  });

  it.each([{}, null, "x", { feedback: "meh" }, { isPublic: "true" }, { isPublic: true, userId: "u" }])(
    "rejects %j",
    (body) => {
      expect(codeOf(() => parseUpdateScanRequest(body))).toBe("INVALID_REQUEST");
    },
  );
});

describe("parseListScansQuery", () => {
  it("parses limit and cursor", () => {
    expect(parseListScansQuery(new URLSearchParams(""))).toEqual({});
    expect(parseListScansQuery(new URLSearchParams("limit=5&cursor=abc"))).toEqual({ limit: 5, cursor: "abc" });
  });

  it.each(["limit=0", "limit=51", "limit=2.5", "limit=ten"])("rejects %s", (query) => {
    expect(codeOf(() => parseListScansQuery(new URLSearchParams(query)))).toBe("INVALID_REQUEST");
  });
});
