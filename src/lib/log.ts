import "server-only";

// Structured logging: one JSON line per event, so Vercel's log search can filter by field.

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

// Matches apiKey, x-api-key, accessToken, set-cookie, Authorization, ... at any depth.
const SENSITIVE_KEY = /key|secret|token|password|authorization|cookie/i;
const MAX_DEPTH = 8;
// Long strings are usually payloads (base64 images, HTML error pages), not context.
const MAX_STRING_LENGTH = 2000;
const RESERVED = new Set(["time", "level", "event"]);

function isSensitive(key: string, value: unknown): boolean {
  // Counts and flags ("inputTokens", "cacheKeyHit") can't hold a secret; strings and objects can.
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return false;
  }
  return SENSITIVE_KEY.test(key);
}

function serialize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  switch (typeof value) {
    case "string":
      return value.length > MAX_STRING_LENGTH
        ? `${value.slice(0, MAX_STRING_LENGTH)}…[${value.length - MAX_STRING_LENGTH} more chars]`
        : value;
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
  }
  if (value === null) return null;

  const obj = value as object;
  if (seen.has(obj)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  // Never dump binary (image bytes) into logs.
  if (ArrayBuffer.isView(obj)) return `[${obj.byteLength} bytes]`;
  if (obj instanceof ArrayBuffer) return `[${obj.byteLength} bytes]`;
  if (obj instanceof Blob) return `[${obj.size} bytes]`;
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? "Invalid Date" : obj.toISOString();

  seen.add(obj);
  try {
    if (Array.isArray(obj)) return obj.map((item) => serialize(item, depth + 1, seen) ?? null);
    if (obj instanceof Error) return serializeError(obj, depth, seen);
    return serializeEntries(Object.entries(obj), depth, seen);
  } finally {
    seen.delete(obj);
  }
}

function serializeEntries(entries: [string, unknown][], depth: number, seen: WeakSet<object>): Fields {
  const out: Fields = {};
  for (const [key, val] of entries) {
    out[key] = isSensitive(key, val) ? "[REDACTED]" : serialize(val, depth + 1, seen);
  }
  return out;
}

function serializeError(error: Error, depth: number, seen: WeakSet<object>): Fields {
  // Own enumerable props carry the useful detail: AppError.code, PostgrestError.hint, errno, status.
  const extra = Object.entries(error).filter(([key]) => !["name", "message", "stack", "cause"].includes(key));
  const out: Fields = {
    name: error.name,
    message: serialize(error.message, depth + 1, seen),
    ...serializeEntries(extra, depth, seen),
  };
  if (process.env.NODE_ENV !== "production" && error.stack) out.stack = error.stack;
  if (error.cause !== undefined) out.cause = serialize(error.cause, depth + 1, seen);
  return out;
}

function write(level: Level, event: string, fields?: Fields): void {
  let line: string;
  try {
    const entry: Fields = { time: new Date().toISOString(), level, event };
    if (fields) {
      for (const [key, val] of Object.entries(serializeEntries(Object.entries(fields), 0, new WeakSet()))) {
        entry[RESERVED.has(key) ? `field_${key}` : key] = val;
      }
    }
    line = JSON.stringify(entry);
  } catch (error) {
    // Logging must never take a request down with it.
    line = JSON.stringify({ time: new Date().toISOString(), level, event, logError: String(error) });
  }
  // console.warn/error go to stderr in Node, which Vercel tags as warnings/errors.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** One JSON line per event. Never pass raw IPs or image bytes; sensitive keys are redacted anyway. */
export const log = {
  info(event: string, fields?: Fields): void {
    write("info", event, fields);
  },
  warn(event: string, fields?: Fields): void {
    write("warn", event, fields);
  },
  error(event: string, fields?: Fields): void {
    write("error", event, fields);
  },
};
