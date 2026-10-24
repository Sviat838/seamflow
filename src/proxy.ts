import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, parseVisitorId, visitorCookieOptions } from "@/lib/auth/visitor";
import { serverEnv } from "@/lib/env";
import { getRequestId } from "@/lib/http/request";
import { log } from "@/lib/log";

interface SessionUpdate {
  cookies: { name: string; value: string; options: CookieOptions }[];
  headers: Record<string, string>;
}

/**
 * Refreshes an expiring Supabase session before any server code runs (Server Components can't
 * write cookies). Mutates `request.cookies` so this request sees the new tokens, and returns
 * what the response must carry so the browser gets them too.
 */
async function refreshSupabaseSession(request: NextRequest, requestId: string): Promise<SessionUpdate> {
  const update: SessionUpdate = { cookies: [], headers: {} };
  // Anonymous visitors have no sb-* auth cookies, so there's nothing to refresh.
  if (!request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))) return update;

  try {
    // Inside the try: an invalid env var (serverEnv throws) must not fail every request on the site.
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = serverEnv();
    if (!url || !key) return update;

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          update.cookies.push(...cookiesToSet);
          Object.assign(update.headers, headers);
        },
      },
    });
    // Verifies the access token and, if it's expired, refreshes it through setAll above.
    await supabase.auth.getClaims();
  } catch (error) {
    // Never block a request on Auth; server code will just see a signed-out viewer.
    log.warn("proxy.session_refresh_failed", { requestId, error });
  }
  return update;
}

export async function proxy(request: NextRequest) {
  const requestId = getRequestId(request.headers);

  // Set on the forwarded request too, so this very request's server code sees the visitor id.
  let newVisitorId: string | null = null;
  if (!parseVisitorId(request.cookies.get(VISITOR_COOKIE)?.value)) {
    newVisitorId = crypto.randomUUID();
    request.cookies.set(VISITOR_COOKIE, newVisitorId);
  }

  const session = await refreshSupabaseSession(request, requestId);

  // Built last, from the mutated request, so forwarded cookies include every change above.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  for (const { name, value, options } of session.cookies) response.cookies.set(name, value, options);
  for (const [name, value] of Object.entries(session.headers)) response.headers.set(name, value);
  if (newVisitorId) response.cookies.set(VISITOR_COOKIE, newVisitorId, visitorCookieOptions());
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  matcher: [
    // Everything except build assets, the image optimizer, the favicon and image files.
    // /api and /auth stay included: they need the session, visitor id and request id.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
