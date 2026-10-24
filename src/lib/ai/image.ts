// Pure image checks (no server-only import) so they can run anywhere, including tests.
import { AppError } from "@/lib/errors";
import { MAX_IMAGE_BYTES, type AcceptedImageType } from "@/lib/types";

const ACCEPTED_LIST = "JPEG, PNG, WebP or GIF";

const toBytes = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF87A = toBytes("GIF87a");
const GIF89A = toBytes("GIF89a");
const RIFF = toBytes("RIFF");
const WEBP = toBytes("WEBP");

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Detects the real type from magic bytes, ignoring the declared Content-Type. */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, GIF87A) || startsWith(bytes, GIF89A)) return "image/gif";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";
  return null;
}

/** Each format's fixed header; a file that ends before it is cut off. */
const HEADER_BYTES: Record<AcceptedImageType, number> = {
  "image/jpeg": 4, // SOI + first marker
  "image/png": 33, // signature + IHDR chunk
  "image/gif": 13, // signature + logical screen descriptor
  "image/webp": 20, // RIFF header + first chunk header
};

/**
 * Bytes that start like an accepted format but stop before its signature is complete:
 * an interrupted upload or a cut-off file, which deserves a different message than "wrong format".
 */
function looksTruncated(bytes: Uint8Array): boolean {
  // RIFF....WEBP cut off before the form type arrived.
  if (bytes.length < 12 && startsWith(bytes, RIFF)) return true;
  return [JPEG, PNG, GIF87A, GIF89A, RIFF].some(
    (signature) => bytes.length < signature.length && bytes.every((byte, i) => byte === signature[i]),
  );
}

const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

/** Names common formats we don't accept, so the error can say what to do instead. */
function describeUnsupported(bytes: Uint8Array): string {
  // ISO-BMFF "ftyp" box: HEIC from iPhones, AVIF from browsers and Android. AVIF files also list
  // the generic HEIF brand "mif1", so check for AVIF first.
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const boxEnd = Math.min(bytes.length, boxSize >= 16 ? boxSize : bytes.length, 64);
    const brands = [ascii(bytes, 8, 12)];
    for (let i = 16; i + 4 <= boxEnd; i += 4) brands.push(ascii(bytes, i, i + 4));
    if (brands.includes("avif") || brands.includes("avis")) {
      return `AVIF images aren't supported yet. Please convert the image to ${ACCEPTED_LIST} and try again.`;
    }
    if (brands.some((brand) => HEIF_BRANDS.includes(brand))) {
      return "HEIC photos (the iPhone default) aren't supported yet. Export the photo as JPEG, or set Settings > Camera > Formats to Most Compatible, and try again.";
    }
  }

  const text = ascii(bytes, 0, Math.min(bytes.length, 64)).trimStart().toLowerCase();
  let format: string | null = null;
  if (startsWith(bytes, [0x42, 0x4d])) format = "BMP";
  else if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) format = "TIFF";
  else if (text.startsWith("%pdf")) format = "PDF";
  else if (text.startsWith("<svg") || text.startsWith("<?xml")) format = "SVG";

  return format
    ? `${format} files aren't supported. Please upload a ${ACCEPTED_LIST} image.`
    : `Unsupported file type. Please upload a ${ACCEPTED_LIST} image.`;
}

/** Throws AppError: IMAGE_TOO_LARGE | UNSUPPORTED_MEDIA_TYPE | INVALID_IMAGE. Returns the sniffed type. */
export function assertValidImage(bytes: Uint8Array): AcceptedImageType {
  if (bytes.length === 0) {
    throw new AppError("INVALID_IMAGE", "The uploaded file is empty. Please choose a photo.");
  }

  const type = sniffImageType(bytes);
  if (type ? bytes.length < HEADER_BYTES[type] : looksTruncated(bytes)) {
    throw new AppError(
      "INVALID_IMAGE",
      "This image appears to be incomplete or corrupted. Please try uploading it again.",
    );
  }
  if (!type) throw new AppError("UNSUPPORTED_MEDIA_TYPE", describeUnsupported(bytes));

  // Checked after the type, so an oversized HEIC hears "export as JPEG" (which also shrinks it).
  if (bytes.length > MAX_IMAGE_BYTES) {
    const limitMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    throw new AppError(
      "IMAGE_TOO_LARGE",
      `This image is larger than ${limitMb} MB. Please upload a smaller or more compressed photo.`,
    );
  }

  return type;
}
