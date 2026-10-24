// Pure helpers for building auth redirects safely. No server-only import: unit tested directly.

const MAX_NEXT_PATH_LENGTH = 1024;
// URL parsers drop tabs/newlines and treat "\" as "/", so "/\evil.com" or "/\t/evil.com"
// would turn into a protocol-relative URL pointing at another site.
const UNSAFE_PATH_CHARS = /[\u0000-\u001f\u007f\\]/;
const PROBE_ORIGIN = "http://localhost";

/**
 * A same-origin relative path ("/s/abc?x=1") to send the user to after sign-in, or `fallback`.
 * Rejects absolute URLs, protocol-relative "//host", backslashes, and control characters.
 */
export function sanitizeNextPath(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_NEXT_PATH_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    UNSAFE_PATH_CHARS.test(value)
  ) {
    return fallback;
  }
  try {
    // Belt and braces: whatever survived the checks above must still resolve to our own origin.
    const url = new URL(value, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

// Sending someone back to an auth step after finishing it would loop.
const AUTH_STEP_PATHS = ["/sign-in", "/onboarding", "/auth"];

/** sanitizeNextPath for post-sign-in / post-onboarding destinations: auth steps fall back to "/". */
export function nextAfterAuth(value: unknown): string {
  const path = sanitizeNextPath(value);
  const pathname = path.split(/[?#]/, 1)[0];
  return AUTH_STEP_PATHS.some((step) => pathname === step || pathname.startsWith(`${step}/`)) ? "/" : path;
}

/** "/sign-in?next=..." with a safe destination. */
export function signInPath(next?: unknown): string {
  return `/sign-in?next=${encodeURIComponent(nextAfterAuth(next))}`;
}

/** "/onboarding?next=..." with a safe destination. */
export function onboardingPath(next?: unknown): string {
  return `/onboarding?next=${encodeURIComponent(nextAfterAuth(next))}`;
}

// Hostname or [IPv6], optional port. Anything else (spaces, paths, userinfo) is a spoofed header.
const HOST_PATTERN = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;
const LOCAL_HOST_PATTERN = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

function firstValue(header: string | null): string | null {
  const first = header?.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * The public origin ("https://seamflow.app") the browser used for this request, from
 * x-forwarded-host/proto (set by Vercel and most proxies) or Host. Null if the host looks invalid.
 */
export function originFromHeaders(headers: Headers): string | null {
  const host = (firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host")))?.toLowerCase();
  if (!host || !HOST_PATTERN.test(host)) return null;
  const forwardedProto = firstValue(headers.get("x-forwarded-proto"))?.toLowerCase();
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : LOCAL_HOST_PATTERN.test(host)
        ? "http"
        : "https";
  return `${proto}://${host}`;
}
