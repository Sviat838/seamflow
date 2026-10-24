// Input parsing shared by the HTTP API and server actions. Pure, so both stay thin.
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { MAX_IMAGE_BYTES, type UpdateScanRequest } from "@/lib/types";

const scanIdSchema = z.uuid();
// Matches the DB default: 9 random bytes, base64url.
const SHARE_SLUG = /^[A-Za-z0-9_-]{12}$/;

// Matches the DB default: "HDX-" + UTC date (YYYY-MMDD) + "-" + a sequence of 4+ digits.
const CASE_NUMBER = /^HDX-\d{4}-\d{4}-\d{4,}$/;

export const isScanId = (value: unknown): value is string => scanIdSchema.safeParse(value).success;
export const isShareSlug = (value: unknown): value is string =>
  typeof value === "string" && SHARE_SLUG.test(value);
export const isCaseNumber = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 32 && CASE_NUMBER.test(value);

// The DB caps file_name at 120 characters.
const MAX_FILE_NAME_LENGTH = 120;
// C0/C1 controls plus bidi overrides, which can make "gpj.exe" render as "exe.jpg".
const UNSAFE_FILE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * The uploaded file's base name, safe to store and show: no directories, no control or bidi
 * characters, at most 120 characters. Null when nothing usable is left.
 */
export function sanitizeFileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  // Some browsers (and hand-rolled clients) send a full path; keep only the last segment.
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFC").replace(UNSAFE_FILE_NAME_CHARS, "").trim();
  if (!clean) return null;
  const chars = Array.from(clean);
  return chars.length <= MAX_FILE_NAME_LENGTH ? clean : chars.slice(0, MAX_FILE_NAME_LENGTH).join("").trimEnd();
}

export function imageTooLarge(): AppError {
  return new AppError(
    "IMAGE_TOO_LARGE",
    `That image is over the ${MAX_IMAGE_BYTES / (1024 * 1024)} MB limit. Try a smaller one.`,
  );
}

/** Parses the create-scan form: `image` (File) and optional `public`. */
export function parseCreateScanForm(form: FormData): { file: File; isPublic: boolean } {
  // Server actions are public endpoints; a hand-rolled call can pass anything here.
  if (!(form instanceof FormData)) throw new AppError("INVALID_REQUEST", "Send the image as form data.");
  const image = form.get("image");
  // Browsers submit an empty, nameless File when no file was picked.
  if (!(image instanceof File) || image.size === 0) {
    throw new AppError("INVALID_REQUEST", "Choose an image to scan.");
  }
  const flag = form.get("public");
  // "on" is what a plain checkbox sends, so native forms work without extra JS.
  if (flag !== null && flag !== "true" && flag !== "false" && flag !== "on") {
    throw new AppError("INVALID_REQUEST", 'The "public" field must be "true" or "false".');
  }
  return { file: image, isPublic: flag === "true" || flag === "on" };
}

const updateScanSchema = z
  .strictObject({
    feedback: z.enum(["correct", "incorrect"]).nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((patch) => patch.feedback !== undefined || patch.isPublic !== undefined);

export function parseUpdateScanRequest(input: unknown): UpdateScanRequest {
  const parsed = updateScanSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "INVALID_REQUEST",
      'Send "feedback" ("correct", "incorrect" or null) and/or "isPublic" (true or false).',
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

export function parseListScansQuery(params: URLSearchParams): { limit?: number; cursor?: string } {
  const parsed = listQuerySchema.safeParse({
    limit: params.get("limit") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    throw new AppError("INVALID_REQUEST", '"limit" must be a whole number from 1 to 50.', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
