// Anonymous visitor cookie. Pure helpers: shared by src/proxy.ts and server code, no secrets.

/** httpOnly cookie holding the anonymous visitor's UUID. Never sent to the browser in a payload. */
export const VISITOR_COOKIE = "sf_vid";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * The visitor id from a raw cookie value, or null if it's missing or tampered with.
 * Lowercased so it compares equal to the uuid Postgres hands back in scans.visitor_id.
 */
export function parseVisitorId(value: string | null | undefined): string | null {
  return isUuid(value) ? value.toLowerCase() : null;
}

export function visitorCookieOptions(isProduction = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Plain http on localhost would drop a Secure cookie.
    secure: isProduction,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}
