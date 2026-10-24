import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  RECOMMENDED_MAX_DIMENSION,
  type AcceptedImageType,
} from "@/lib/types";
import { ScanRequestError } from "./errors";

export interface PrepareImageOptions {
  /** Longest edge in pixels. Defaults to RECOMMENDED_MAX_DIMENSION. */
  maxDimension?: number;
  /** Starting JPEG quality (0..1); lowered stepwise while the result is over MAX_IMAGE_BYTES. */
  quality?: number;
}

const DEFAULT_QUALITY = 0.85;
const MIN_QUALITY = 0.45;
const QUALITY_STEP = 0.1;
// Small, already-acceptable files go up as-is. Bigger ones are worth re-encoding: phones upload
// a ~400 KB JPEG far faster than a 3 MB original, and Claude downsamples anyway.
const PASSTHROUGH_MAX_BYTES = MAX_IMAGE_BYTES / 2;

/**
 * Gets a picked file ready for upload: applies EXIF rotation, downscales to `maxDimension` on the
 * long edge and re-encodes as JPEG under MAX_IMAGE_BYTES. Returns the original file when it's
 * already small enough. Throws ScanRequestError UNSUPPORTED_MEDIA_TYPE if the browser can't decode it.
 */
export async function prepareImage(file: File, opts: PrepareImageOptions = {}): Promise<File> {
  const maxDimension = opts.maxDimension ?? RECOMMENDED_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  // Ancient browsers: upload as-is and let the server validate.
  if (typeof createImageBitmap !== "function") return file;

  const bitmap = await decodeImage(file);
  if (!bitmap) throw new ScanRequestError("UNSUPPORTED_MEDIA_TYPE", unreadableMessage(file));

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);
    const fits = width === bitmap.width && height === bitmap.height;
    const usableAsIs = isAcceptedType(file.type) && fits && file.size <= MAX_IMAGE_BYTES;
    if (usableAsIs && file.size <= PASSTHROUGH_MAX_BYTES) return file;

    const blob = await encodeJpeg(bitmap, width, height, quality);
    // Re-encoding an already-compressed photo can grow it; keep whichever is smaller.
    if (usableAsIs && blob.size >= file.size) return file;
    return new File([blob], toJpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/** Scales (width, height) down to fit `maxDimension` on the long edge. Never upscales. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function toJpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "scan"}.jpg`;
}

function isAcceptedType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

async function decodeImage(file: File): Promise<ImageBitmap | null> {
  try {
    // "from-image" bakes in EXIF rotation, so sideways iPhone photos come out upright.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    // Engines that predate the "from-image" value reject it with a TypeError; retry with defaults.
    // Anything else (DOMException) means the bytes aren't decodable here, e.g. HEIC on Chrome.
    if (!(error instanceof TypeError)) return null;
  }
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

function unreadableMessage(file: File): string {
  const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  return isHeic
    ? "This browser can't read HEIC photos. Export it as JPEG (or take a screenshot of it) and try again."
    : "This file couldn't be read as an image. Please use a JPEG, PNG, WebP or GIF.";
}

interface Surface {
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  toBlob(type: string, quality: number): Promise<Blob>;
}

function createSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    // Some Safari versions expose OffscreenCanvas without a 2D context.
    if (context) return { context, toBlob: (type, quality) => canvas.convertToBlob({ type, quality }) };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw encodeFailure();
  return {
    context,
    toBlob: (type, quality) =>
      new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(encodeFailure())), type, quality);
      }),
  };
}

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number, startQuality: number): Promise<Blob> {
  const { context, toBlob } = createSurface(width, height);
  // JPEG has no alpha channel: without a backdrop, transparent PNG pixels turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  let quality = Math.min(1, Math.max(0.05, startQuality));
  const floor = Math.min(MIN_QUALITY, quality);
  for (;;) {
    const blob = await toBlob("image/jpeg", quality);
    if (blob.size <= MAX_IMAGE_BYTES) return blob;
    if (quality <= floor) {
      throw new ScanRequestError(
        "IMAGE_TOO_LARGE",
        "This image is still too large after compression. Try a smaller photo or a screenshot.",
      );
    }
    quality = Math.max(floor, Math.round((quality - QUALITY_STEP) * 100) / 100);
  }
}

function encodeFailure(): ScanRequestError {
  return new ScanRequestError("INTERNAL", "Your browser couldn't prepare this image. Please try another browser or photo.");
}
