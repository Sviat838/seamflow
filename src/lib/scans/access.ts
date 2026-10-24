import "server-only";
import { getViewerContext, type ViewerContext } from "@/lib/auth/viewer";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/types";
import { SCAN_COLUMNS, scanAccess, toScanViewer, type ScanAccess, type ScanRecord } from "./mappers";
import { isCaseNumber, isScanId } from "./validation";

export interface AccessibleScan {
  admin: AdminClient;
  row: ScanRecord;
  ctx: ViewerContext;
  access: ScanAccess;
}

export interface LoadScanOptions {
  /**
   * "manage" (default): owner or same-company member, the rule for reading a case and changing it.
   * "owner": the submitter only (e.g. appeals).
   */
  require?: "manage" | "owner";
}

export const scanNotFound = () => new AppError("NOT_FOUND", "We couldn't find that scan.");

const loadFailed = (cause: unknown) =>
  new AppError("INTERNAL", "We couldn't load that scan. Please try again.", { cause, retryable: true });

/**
 * Loads a scan by id (uuid) or case number ("HDX-2026-1024-7731") for the current viewer, with the
 * full SCAN_COLUMNS row (certificate embedded) and the viewer context.
 *
 * Throws NOT_FOUND for malformed refs, missing rows, no database, or no access; FORBIDDEN when the
 * scan is public (so its existence is already known) but the viewer lacks the required access.
 * Throws INTERNAL (retryable) when the read fails.
 */
export async function loadAccessibleScan(ref: string, opts: LoadScanOptions = {}): Promise<AccessibleScan> {
  const column = isScanId(ref) ? "id" : isCaseNumber(ref) ? "case_number" : null;
  if (!column) throw scanNotFound();
  const admin = getAdminClient();
  // Without a database nothing was ever saved.
  if (!admin) throw scanNotFound();

  const [ctx, { data: row, error }] = await Promise.all([
    getViewerContext(),
    admin.from("scans").select(SCAN_COLUMNS).eq(column, ref).maybeSingle(),
  ]);
  if (error) throw loadFailed(error);
  if (!row) throw scanNotFound();

  const access = scanAccess(row, toScanViewer(ctx));
  const allowed = opts.require === "owner" ? access.isOwner : access.canManage;
  if (!allowed) {
    // A public scan is already known to exist; a private one stays indistinguishable from missing.
    if (row.is_public) {
      throw new AppError(
        "FORBIDDEN",
        opts.require === "owner" ? "Only the submitter can do that." : "Only the owner can change this scan.",
      );
    }
    throw scanNotFound();
  }
  return { admin, row, ctx, access };
}

/** Like loadAccessibleScan, but null instead of NOT_FOUND / FORBIDDEN, for read-only callers. */
export async function findAccessibleScan(ref: string, opts: LoadScanOptions = {}): Promise<AccessibleScan | null> {
  try {
    return await loadAccessibleScan(ref, opts);
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) return null;
    throw error;
  }
}

interface AccessFilterable<Q> {
  eq(column: "user_id" | "visitor_id" | "company_id", value: string): Q;
  is(column: "user_id", value: null): Q;
}

/**
 * Repeats the access rule in a write's WHERE clause, so a race (claim, company change) between the
 * check and the write can't widen what gets changed.
 */
export function scopeToAccess<Q extends AccessFilterable<Q>>(
  query: Q,
  row: Pick<ScanRecord, "user_id">,
  { access, ctx }: Pick<AccessibleScan, "access" | "ctx">,
): Q {
  if (access.isOwner) {
    return row.user_id !== null
      ? query.eq("user_id", row.user_id)
      : query.is("user_id", null).eq("visitor_id", ctx.visitorId);
  }
  const companyId = ctx.viewer.company?.id;
  if (!access.isCompanyMember || !companyId) throw scanNotFound();
  return query.eq("company_id", companyId);
}

/** How a person appears in the audit trail and on the case: name, else email, else their role. */
export function viewerLabel(viewer: Viewer): string {
  return viewer.displayName ?? viewer.email ?? (viewer.isAuthenticated ? "Signed-in user" : "Anonymous visitor");
}

/**
 * Display names of the submitters of `rows`, keyed by user id, for viewers who can manage them.
 * The viewer's own name comes from their session (same Google profile), so it needs no query.
 * Lookup failures just leave names out.
 */
export async function loadSubmitterNames(
  admin: AdminClient,
  viewer: Viewer,
  rows: Array<Pick<ScanRecord, "user_id">>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (viewer.userId && viewer.displayName) names.set(viewer.userId, viewer.displayName);
  const others = rows.flatMap((row) => (row.user_id && row.user_id !== viewer.userId ? [row.user_id] : []));
  const missing = [...new Set(others)];
  if (missing.length === 0) return names;

  const { data, error } = await admin.from("profiles").select("id, display_name").in("id", missing);
  if (error) {
    log.warn("scans.submitter_lookup_failed", { count: missing.length, error: error.message });
    return names;
  }
  for (const profile of data) {
    if (profile.display_name) names.set(profile.id, profile.display_name);
  }
  return names;
}
