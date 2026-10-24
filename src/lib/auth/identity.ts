import type { Viewer } from "@/lib/types";
import { isUuid } from "./visitor";

/** The subset of a verified Supabase access-token payload (getClaims()) that identity needs. */
export interface VerifiedClaims {
  sub: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

/** What the profiles row (joined to companies) adds to a signed-in viewer. */
export interface ViewerProfileFields {
  jobTitle: string | null;
  company: Viewer["company"];
}

const MAX_DISPLAY_NAME_LENGTH = 100;

// A fresh object per call: a shared constant could leak mutations across requests.
export function anonymousViewer(): Viewer {
  return {
    isAuthenticated: false,
    userId: null,
    email: null,
    displayName: null,
    avatarUrl: null,
    jobTitle: null,
    company: null,
    needsOnboarding: false,
  };
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, maxLength);
  return text ? text : null;
}

// Avatars end up in <img src>; only accept https so metadata can't smuggle in other schemes.
function cleanAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Maps verified token claims to the client-safe Viewer. Google puts name/picture in user_metadata.
 * The company isn't in the token: until withProfile() adds it, the viewer needs onboarding.
 */
export function viewerFromClaims(claims: VerifiedClaims): Viewer {
  if (!isUuid(claims.sub)) return anonymousViewer();
  const meta = claims.user_metadata ?? {};
  return {
    isAuthenticated: true,
    userId: claims.sub.toLowerCase(),
    email: cleanText(claims.email, 320),
    displayName:
      cleanText(meta.full_name, MAX_DISPLAY_NAME_LENGTH) ?? cleanText(meta.name, MAX_DISPLAY_NAME_LENGTH),
    avatarUrl: cleanAvatarUrl(meta.avatar_url) ?? cleanAvatarUrl(meta.picture),
    jobTitle: null,
    company: null,
    needsOnboarding: true,
  };
}

/**
 * Adds the profile (null when unknown: no database, or the read failed) to a viewer.
 * needsOnboarding is simply "signed in without a company", so requireViewer({ company: true }) and
 * the onboarding page always agree and can't bounce the user between each other.
 */
export function withProfile(viewer: Viewer, profile: ViewerProfileFields | null): Viewer {
  if (!viewer.isAuthenticated) return viewer;
  const company = profile?.company ?? null;
  return { ...viewer, jobTitle: profile?.jobTitle ?? null, company, needsOnboarding: company === null };
}
