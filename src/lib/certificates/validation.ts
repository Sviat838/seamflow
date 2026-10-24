// Input parsing for certificates, shared by the verify page, the PDF route, the HTTP API and the
// server action. Pure, so it's unit tested directly.
import { z } from "zod";
import { AppError } from "@/lib/errors";

// Same alphabet as public.generate_certificate_code(): no 0/O, 1/I/L or U.
const CODE_BODY = /^[2-9A-HJKMNP-TV-Z]{8}$/;
const MAX_RAW_CODE_LENGTH = 32;

/**
 * "7kq2 m9xd", "7KQ2M9XD" or " 7KQ2-M9XD " -> "7KQ2-M9XD". Null for anything that can't be a code,
 * so callers can 404 without a database round trip.
 */
export function normalizeCertificateCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > MAX_RAW_CODE_LENGTH) return null;
  const body = input.toUpperCase().replace(/[\s-]+/g, "");
  if (!CODE_BODY.test(body)) return null;
  return `${body.slice(0, 4)}-${body.slice(4)}`;
}

export const PRODUCT_NAME_MAX = 80;
export const SKU_MAX = 40;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

// Collapses whitespace, enforces the DB length caps, and turns "" into null (clears the field).
function productField(label: string, max: number) {
  return z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .refine((value) => !CONTROL_CHARS.test(value), `${label} contains characters we can't print.`)
    .refine((value) => value.length <= max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();
}

const PATCH_SHAPE_MESSAGE = `Send "productName" (up to ${PRODUCT_NAME_MAX} characters) and/or "sku" (up to ${SKU_MAX}), or null to clear them.`;

const productPatchSchema = z
  .strictObject({
    productName: productField("Product name", PRODUCT_NAME_MAX),
    sku: productField("SKU", SKU_MAX),
  })
  .refine((patch) => patch.productName !== undefined || patch.sku !== undefined, PATCH_SHAPE_MESSAGE);

export interface CertificateProductPatch {
  productName?: string | null;
  sku?: string | null;
}

/** Validates a product patch from the API or a server action. Throws INVALID_REQUEST. */
export function parseCertificateProductPatch(input: unknown): CertificateProductPatch {
  const parsed = productPatchSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Our refinements are written for end users; zod's own (wrong type, unknown key) aren't.
    const message = issue?.code === "custom" ? issue.message : PATCH_SHAPE_MESSAGE;
    throw new AppError("INVALID_REQUEST", message, { cause: parsed.error });
  }
  return parsed.data;
}
