import { NextResponse, type NextRequest } from "next/server";
import { claimVisitorScans } from "@/lib/auth/claim";
import { nextAfterAuth, onboardingPath } from "@/lib/auth/redirect";
import { VISITOR_COOKIE, parseVisitorId } from "@/lib/auth/visitor";
import { readCompanyId } from "@/lib/companies/profile";
import { getRequestId } from "@/lib/http/request";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

const AUTH_ERROR_PATH = "/?auth_error=1";

function redirectTo(path: string, origin: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, origin));
  // Carries fresh session cookies; must never be cached by a CDN.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/** The user's company id; null when they have none, undefined when it couldn't be read. */
async function findCompanyId(userId: string, requestId: string): Promise<string | null | undefined> {
  const admin = getAdminClient();
  if (!admin) return null;
  try {
    return await readCompanyId(admin, userId);
  } catch (error) {
    log.warn("auth.callback_company_lookup_failed", { requestId, userId, error });
    return undefined;
  }
}

/**
 * OAuth (PKCE) landing: exchange the code for a session, claim anonymous scans, then go to `next`,
 * or to /onboarding?next=... when the user has no company yet.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const requestId = getRequestId(request.headers);
  const code = searchParams.get("code");

  // The provider redirects back without a code when the user cancels (error=access_denied).
  if (!code) {
    log.warn("auth.callback_missing_code", { requestId, providerError: searchParams.get("error") });
    return redirectTo(AUTH_ERROR_PATH, origin);
  }

  const supabase = await createServerSupabase();
  if (!supabase) return redirectTo(AUTH_ERROR_PATH, origin);

  let hasCompany: boolean;
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      log.warn("auth.callback_exchange_failed", { requestId, error });
      return redirectTo(AUTH_ERROR_PATH, origin);
    }
    const userId = data.user.id;
    const companyId = await findCompanyId(userId, requestId);
    const visitorId = parseVisitorId(request.cookies.get(VISITOR_COOKIE)?.value);
    if (visitorId) await claimVisitorScans(userId, visitorId, companyId);
    // Unknown (lookup failed) also goes to onboarding, which forwards users who have a company to `next`.
    hasCompany = Boolean(companyId);
    log.info("auth.signed_in", { requestId, userId, hasCompany });
  } catch (error) {
    log.error("auth.callback_failed", { requestId, error });
    return redirectTo(AUTH_ERROR_PATH, origin);
  }

  const next = nextAfterAuth(searchParams.get("next"));
  return redirectTo(hasCompany ? next : onboardingPath(next), origin);
}
