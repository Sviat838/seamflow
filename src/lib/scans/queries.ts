import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getViewerContext } from "@/lib/auth/viewer";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { GlobalStats, ListScansResponse, Scan, Viewer } from "@/lib/types";
import { findAccessibleScan, loadSubmitterNames } from "./access";
import { decodeCursor, encodeCursor } from "./cursor";
import {
  imageRetention,
  SCAN_COLUMNS,
  scanAccess,
  toGlobalStats,
  toScan,
  toScanViewer,
  type ScanAccess,
  type ScanRecord,
} from "./mappers";
import { signScanImage, signScanImages } from "./storage";
import { isCaseNumber, isScanId, isShareSlug } from "./validation";

/** Cache tag for getGlobalStats; mutations that change counts revalidate it. */
export const STATS_TAG = "stats";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
// A hung database must not hang every render (or the build) that includes the stats strip.
const STATS_TIMEOUT_MS = 3000;

function readFailed(cause: unknown): AppError {
  return new AppError("INTERNAL", "We couldn't load scans right now. Please try again.", {
    cause,
    retryable: true,
  });
}

/** One scan as this viewer may see it: signed image only inside retention, names only for managers. */
export async function toViewerScan(
  admin: AdminClient,
  row: ScanRecord,
  viewer: Viewer,
  access: ScanAccess,
): Promise<Scan> {
  const [imageUrl, names] = await Promise.all([
    imageRetention(row).available ? signScanImage(admin, row.image_path) : null,
    access.canManage ? loadSubmitterNames(admin, viewer, [row]) : null,
  ]);
  return toScan(row, {
    isOwner: access.canManage,
    imageUrl,
    submittedBy: row.user_id ? (names?.get(row.user_id) ?? null) : null,
  });
}

/**
 * The scan if the viewer owns it, it belongs to the viewer's company, or it's public; null for
 * unknown ids, garbage, or scans the viewer can't see.
 */
export async function getScanForViewer(id: string): Promise<Scan | null> {
  if (!isScanId(id)) return null;
  const admin = getAdminClient();
  if (!admin) return null;

  const [ctx, { data: row, error }] = await Promise.all([
    getViewerContext(),
    admin.from("scans").select(SCAN_COLUMNS).eq("id", id).maybeSingle(),
  ]);
  if (error) throw readFailed(error);
  if (!row) return null;

  const access = scanAccess(row, toScanViewer(ctx));
  if (!access.canManage && !row.is_public) return null;
  return toViewerScan(admin, row, ctx.viewer, access);
}

/** A case by its number ("HDX-2026-1024-7731"), for its owner or the owner's company only. */
export async function getCaseForViewer(caseNumber: string): Promise<Scan | null> {
  if (!isCaseNumber(caseNumber)) return null;
  const found = await findAccessibleScan(caseNumber);
  return found ? toViewerScan(found.admin, found.row, found.ctx.viewer, found.access) : null;
}

/** A shared scan by its public slug. Private scans are invisible here, even to their owner. */
export async function getPublicScanBySlug(slug: string): Promise<Scan | null> {
  if (!isShareSlug(slug)) return null;
  const admin = getAdminClient();
  if (!admin) return null;

  const [ctx, { data: row, error }] = await Promise.all([
    getViewerContext(),
    admin.from("scans").select(SCAN_COLUMNS).eq("share_slug", slug).eq("is_public", true).maybeSingle(),
  ]);
  if (error) throw readFailed(error);
  if (!row) return null;

  return toViewerScan(admin, row, ctx.viewer, scanAccess(row, toScanViewer(ctx)));
}

/**
 * The viewer's history, newest first, keyset-paginated on (created_at, id): company members see
 * every company scan plus their own; other signed-in users their own; visitors their unclaimed ones.
 */
export async function listViewerScans(
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<ListScansResponse> {
  const requested =
    opts.limit !== undefined && Number.isFinite(opts.limit) ? Math.trunc(opts.limit) : DEFAULT_PAGE_SIZE;
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  // Read the viewer before any early return: history is per-viewer, so it must always be
  // request-time (and need <Suspense>), whether or not this build has a database.
  const ctx = await getViewerContext();
  const { viewer, visitorId } = ctx;
  const admin = getAdminClient();
  if (!admin) return { scans: [], nextCursor: null };

  let query = admin.from("scans").select(SCAN_COLUMNS);
  if (viewer.userId && viewer.company) {
    // Both uuids (verified JWT subject, DB id): safe to interpolate. Own scans from before
    // onboarding have no company_id, so they're included explicitly.
    query = query.or(`company_id.eq.${viewer.company.id},user_id.eq.${viewer.userId}`);
  } else if (viewer.userId) {
    query = query.eq("user_id", viewer.userId);
  } else {
    // Anonymous history is only what hasn't been claimed by an account yet.
    query = query.eq("visitor_id", visitorId).is("user_id", null);
  }
  if (cursor) {
    // Safe to interpolate: decodeCursor only accepts a strict timestamp and a uuid. A second
    // or= parameter is ANDed with the one above.
    const at = `"${cursor.createdAt}"`;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})`);
  }

  const { data: rows, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw readFailed(error);

  const page = rows.slice(0, limit);
  const scanViewer = toScanViewer(ctx);
  const entries = page.map((row) => ({ row, access: scanAccess(row, scanViewer) }));
  const now = Date.now();
  const [urls, names] = await Promise.all([
    signScanImages(
      admin,
      page.flatMap((row) => (row.image_path && imageRetention(row, now).available ? [row.image_path] : [])),
    ),
    loadSubmitterNames(
      admin,
      viewer,
      entries.flatMap(({ row, access }) => (access.canManage ? [row] : [])),
    ),
  ]);
  const last = page.at(-1);

  return {
    scans: entries.map(({ row, access }) =>
      toScan(row, {
        isOwner: access.canManage,
        imageUrl: row.image_path ? (urls.get(row.image_path) ?? null) : null,
        submittedBy: row.user_id ? (names.get(row.user_id) ?? null) : null,
        now,
      }),
    ),
    nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/** Site-wide counters. Cached and shared by every visitor; zeros without Supabase. */
export async function getGlobalStats(): Promise<GlobalStats> {
  "use cache";
  cacheTag(STATS_TAG);
  // One profile for every outcome. A shorter one on failure ("seconds", expire < 5 min) would make
  // this a request-time hole, so a DB blip during `next build` would fail any page that renders
  // stats in its static shell. "minutes" still retries within a minute of traffic.
  cacheLife("minutes");

  const admin = getAdminClient();
  if (!admin) return toGlobalStats(null);

  const { data, error } = await admin
    .rpc("get_global_stats")
    .abortSignal(AbortSignal.timeout(STATS_TIMEOUT_MS));
  if (error) {
    // Stats are decorative: show zeros rather than fail the page (or the build).
    log.error("scans.stats_failed", { error: error.message });
    return toGlobalStats(null);
  }
  return toGlobalStats(data[0]);
}
