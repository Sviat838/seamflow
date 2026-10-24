import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/log";

const MAX_REQUEST_ID_LENGTH = 128;

// Request ids end up in logs and response headers: keep them to a boring, header-safe charset.
function sanitizeRequestId(value: string | null): string | null {
  const clean = value?.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, MAX_REQUEST_ID_LENGTH);
  return clean ? clean : null;
}

/** x-request-id (set by src/proxy.ts), then Vercel's x-vercel-id, else a fresh UUID. */
export function getRequestId(headers: Headers): string {
  return (
    sanitizeRequestId(headers.get("x-request-id")) ??
    sanitizeRequestId(headers.get("x-vercel-id")) ??
    randomUUID()
  );
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim();
  // Some proxies append a port: "[2001:db8::1]:443" or "203.0.113.7:51234".
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.toLowerCase();
  // IPv4-mapped IPv6 is the same client; hash it the same way.
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

/**
 * Client IP from the first x-forwarded-for hop, else x-real-ip. On Vercel both are set by the
 * platform and overwrite anything the client sent. Returns null when neither looks like an IP.
 */
export function getClientIp(headers: Headers): string | null {
  return normalizeIp(headers.get("x-forwarded-for")?.split(",")[0]) ?? normalizeIp(headers.get("x-real-ip"));
}

let ephemeralHmacSecret: Buffer | undefined;

function ipHmacSecret(): string | Buffer {
  const secret = serverEnv().APP_SECRET;
  if (secret) return secret;
  if (!ephemeralHmacSecret) {
    ephemeralHmacSecret = randomBytes(32);
    log.warn("ip_hash.ephemeral_secret", {
      reason: "APP_SECRET is not set; IP hashes will change on every restart and differ between instances",
    });
  }
  return ephemeralHmacSecret;
}

/** HMAC-SHA256 of the IP with APP_SECRET, hex, first 32 chars. Raw IPs never reach logs or the DB. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac("sha256", ipHmacSecret()).update(ip).digest("hex").slice(0, 32);
}
