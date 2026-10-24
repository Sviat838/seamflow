import "server-only";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { SCANS_BUCKET, type AdminClient } from "@/lib/supabase/admin";
import type { AcceptedImageType } from "@/lib/types";

/** Signed image URLs live an hour: long enough for a session, short enough to not leak far. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

const EXTENSIONS: Record<AcceptedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function scanImagePath(userId: string | null, scanId: string, mimeType: AcceptedImageType): string {
  return `${userId ?? "anon"}/${scanId}.${EXTENSIONS[mimeType]}`;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Never rejects: a failed upload only means the scan is saved without its image. */
export async function uploadScanImage(
  admin: AdminClient,
  path: string,
  bytes: Uint8Array,
  mimeType: AcceptedImageType,
  requestId: string,
): Promise<boolean> {
  try {
    const { error } = await admin.storage
      .from(SCANS_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (!error) return true;
    log.warn("scans.image_upload_failed", { requestId, error: error.message });
  } catch (error) {
    log.warn("scans.image_upload_failed", { requestId, error: message(error) });
  }
  return false;
}

/** Throws AppError INTERNAL (retryable) so callers can keep the row and let the user retry. */
export async function removeScanImage(admin: AdminClient, path: string): Promise<void> {
  const { error } = await admin.storage.from(SCANS_BUCKET).remove([path]);
  if (error) {
    throw new AppError("INTERNAL", "We couldn't delete the image. Please try again.", {
      cause: error,
      retryable: true,
    });
  }
}

/** Removes an upload that won't be referenced by any row. Best effort; for use inside after(). */
export async function discardScanImage(
  admin: AdminClient,
  upload: Promise<boolean>,
  path: string,
  requestId: string,
): Promise<void> {
  if (!(await upload)) return;
  try {
    await removeScanImage(admin, path);
  } catch (error) {
    log.warn("scans.image_cleanup_failed", { requestId, error: message(error) });
  }
}

export async function signScanImage(admin: AdminClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(SCANS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) log.warn("scans.image_sign_failed", { error: error.message });
  return data?.signedUrl ?? null;
}

/** One round trip for a page of history. Missing or failed paths are simply absent. */
export async function signScanImages(admin: AdminClient, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data, error } = await admin.storage
    .from(SCANS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    log.warn("scans.image_sign_failed", { count: paths.length, error: error.message });
    return urls;
  }
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}
