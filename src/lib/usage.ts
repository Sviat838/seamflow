import "server-only";
import { getViewerContext, type ViewerContext } from "@/lib/auth/viewer";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import { FREE_CLASSIFICATION_LIMIT, type PlanTier, type Usage } from "@/lib/types";

/** Whose scans count towards the Free plan, per docs/APP.md. */
type QuotaScope =
  | { kind: "company"; companyId: string }
  | { kind: "user"; userId: string }
  | { kind: "visitor"; visitorId: string };

function planOf({ viewer }: ViewerContext): PlanTier {
  if (viewer.company?.plan === "business") return "business";
  return viewer.isAuthenticated ? "free" : "anonymous";
}

function scopeOf({ viewer, visitorId }: ViewerContext): QuotaScope {
  if (viewer.company) return { kind: "company", companyId: viewer.company.id };
  if (viewer.userId) return { kind: "user", userId: viewer.userId };
  return { kind: "visitor", visitorId };
}

/**
 * Classifications used so far (every persisted scan, cached re-verdicts included). Null when it
 * can't be counted: without a database (nothing is stored, so nothing is metered) or when the
 * count query fails.
 */
async function countUsed(scope: QuotaScope): Promise<number | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  // head: true asks PostgREST for the count only, no rows.
  const base = admin.from("scans").select("id", { count: "exact", head: true });
  const query =
    scope.kind === "company"
      ? base.eq("company_id", scope.companyId)
      : scope.kind === "user"
        ? base.eq("user_id", scope.userId)
        : // Scans an account has claimed count for that account, not the browser.
          base.eq("visitor_id", scope.visitorId).is("user_id", null);
  const { count, error } = await query;
  if (error) {
    log.warn("usage.count_failed", { scope: scope.kind, error: error.message });
    return null;
  }
  return count ?? 0;
}

function toUsage(plan: PlanTier, used: number): Usage {
  if (plan === "business") return { plan, used, limit: null, remaining: null };
  return { plan, used, limit: FREE_CLASSIFICATION_LIMIT, remaining: Math.max(0, FREE_CLASSIFICATION_LIMIT - used) };
}

/**
 * The viewer's plan and how much of it is used. Business is unlimited. Without a database the
 * Free numbers read as untouched (nothing is stored, so nothing is metered).
 * Request-time: reads the viewer's cookies unless `ctx` is passed.
 */
export async function getUsage(ctx?: ViewerContext): Promise<Usage> {
  const context = ctx ?? (await getViewerContext());
  const plan = planOf(context);
  if (!getAdminClient()) return toUsage(plan, 0);
  const used = await countUsed(scopeOf(context));
  if (used === null) {
    throw new AppError("INTERNAL", "We couldn't load your usage right now. Please try again.", { retryable: true });
  }
  return toUsage(plan, used);
}

/**
 * Throws QUOTA_EXCEEDED (402) once the Free plan's FREE_CLASSIFICATION_LIMIT is used up.
 * Business plans skip the count. Fails open when the count can't be read: rate limits and the
 * global daily cap still bound the cost, and a DB blip shouldn't lock every visitor out.
 * Concurrent uploads can overshoot by a few; the limit is a plan boundary, not a security control.
 */
export async function assertWithinQuota(ctx: ViewerContext): Promise<void> {
  const plan = planOf(ctx);
  if (plan === "business") return;
  const used = await countUsed(scopeOf(ctx));
  if (used === null || used < FREE_CLASSIFICATION_LIMIT) return;

  throw new AppError(
    "QUOTA_EXCEEDED",
    plan === "anonymous"
      ? `This browser has used all ${FREE_CLASSIFICATION_LIMIT} free classifications. Sign in to continue, or contact us about the Business plan.`
      : `Your Free plan's ${FREE_CLASSIFICATION_LIMIT} classifications have all been used. Contact us about the Business plan to continue.`,
  );
}
