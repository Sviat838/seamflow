import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { readViewerProfile } from "@/lib/companies/profile";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/types";
import { anonymousViewer, viewerFromClaims, withProfile, type ViewerProfileFields } from "./identity";
import { onboardingPath, signInPath } from "./redirect";
import { VISITOR_COOKIE, parseVisitorId, visitorCookieOptions } from "./visitor";

export interface ViewerContext {
  /** Safe to pass to Client Components. */
  viewer: Viewer;
  /** Server-only. Never serialize it to the client. */
  visitorId: string;
}

async function readClaimsViewer(): Promise<Viewer> {
  const supabase = await createServerSupabase();
  if (!supabase) return anonymousViewer();
  try {
    // getClaims() verifies the JWT signature; getSession() would trust whatever the cookie says.
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      log.warn("auth.claims_rejected", { error });
      return anonymousViewer();
    }
    return data ? viewerFromClaims(data.claims) : anonymousViewer();
  } catch (error) {
    // An Auth outage must not take pages down; the viewer just looks signed out.
    log.error("auth.claims_failed", { error });
    return anonymousViewer();
  }
}

/** Job title and company for a signed-in user; null when unknown (no database, or the read failed). */
async function readProfile(userId: string): Promise<ViewerProfileFields | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  try {
    return await readViewerProfile(admin, userId);
  } catch (error) {
    // Same rule as Auth: a database blip degrades the viewer instead of failing every page.
    log.error("auth.profile_failed", { userId, error });
    return null;
  }
}

async function readViewer(): Promise<Viewer> {
  const viewer = await readClaimsViewer();
  return viewer.userId ? withProfile(viewer, await readProfile(viewer.userId)) : viewer;
}

async function readVisitorId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = parseVisitorId(cookieStore.get(VISITOR_COOKIE)?.value);
  if (existing) return existing;

  // Normally unreachable: src/proxy.ts sets sf_vid on the request before any server code runs.
  const visitorId = crypto.randomUUID();
  try {
    cookieStore.set(VISITOR_COOKIE, visitorId, visitorCookieOptions());
  } catch {
    // Server Components can't set cookies; the id is still valid for this render.
  }
  return visitorId;
}

/**
 * The verified signed-in user (with job title and company, from one profiles query) or anonymous
 * viewer, plus the sf_vid visitor id, creating the cookie when the context allows it (Route
 * Handlers, Server Actions). Works without Supabase.
 *
 * Request-time only: it reads cookies, so call it behind <Suspense> in Server Components and
 * never inside 'use cache'. Deduplicated per render with React cache(); Server Actions read fresh.
 */
export const getViewerContext = cache(async (): Promise<ViewerContext> => {
  const [viewer, visitorId] = await Promise.all([readViewer(), readVisitorId()]);
  return { viewer, visitorId };
});

/**
 * Gate for signed-in pages. Redirects to /sign-in?next=... when signed out and, with
 * `company: true`, to /onboarding?next=... when the user hasn't picked a company yet.
 * `next` is where to come back to (a relative path; unsafe values fall back to "/").
 */
export async function requireViewer(opts: { company?: boolean; next?: string } = {}): Promise<ViewerContext> {
  const context = await getViewerContext();
  if (!context.viewer.isAuthenticated) redirect(signInPath(opts.next));
  if (opts.company && !context.viewer.company) redirect(onboardingPath(opts.next));
  return context;
}
