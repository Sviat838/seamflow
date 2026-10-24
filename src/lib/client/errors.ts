import { MAX_IMAGE_BYTES, type ApiErrorCode } from "@/lib/types";

/** Failures that happen in the browser and never reach the API. */
export const CLIENT_ERROR_CODES = ["NETWORK_ERROR", "ABORTED"] as const;
export type ClientErrorCode = ApiErrorCode | (typeof CLIENT_ERROR_CODES)[number];

interface ScanRequestErrorOptions {
  requestId?: string;
  retryAfterSeconds?: number;
  /** HTTP status, when the error came from a response. */
  status?: number;
  cause?: unknown;
}

/** The one error type the client helpers throw. `message` is safe to show to users. */
export class ScanRequestError extends Error {
  readonly code: ClientErrorCode;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly status?: number;

  constructor(code: ClientErrorCode, message: string, options: ScanRequestErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "ScanRequestError";
    this.code = code;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.status = options.status;
  }
}

export function isScanRequestError(error: unknown): error is ScanRequestError {
  return error instanceof ScanRequestError;
}

/** Normalizes anything thrown during a scan into a ScanRequestError. */
export function toScanRequestError(error: unknown): ScanRequestError {
  if (isScanRequestError(error)) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ScanRequestError("ABORTED", errorCopy("ABORTED").body, { cause: error });
  }
  return new ScanRequestError("INTERNAL", errorCopy("INTERNAL").body, { cause: error });
}

// The same file may well succeed on a second attempt. Image problems need a different file instead.
const RETRYABLE_CODES: ReadonlySet<ClientErrorCode> = new Set<ClientErrorCode>([
  "NETWORK_ERROR",
  "ABORTED",
  "AI_TIMEOUT",
  "AI_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL",
]);

/** Whether to offer "Try again" (useScan's retry) rather than "Choose another photo". */
export function isRetryableCode(code: ClientErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

export interface ErrorCopy {
  title: string;
  body: string;
}

/** "30 seconds", "about 5 minutes", "about an hour". Rounds up so we never invite a retry too early. */
export function formatRetryAfter(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return s === 1 ? "1 second" : `${s} seconds`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 60) return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return hours === 1 ? "about an hour" : `about ${hours} hours`;
}

const MAX_MB = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

// Entries that take `retryIn` adapt when the server says how long to wait.
type CopyEntry = ErrorCopy | ((retryIn: string | null) => ErrorCopy);

const COPY: Record<ClientErrorCode, CopyEntry> = {
  INVALID_REQUEST: {
    title: "Request not recognized",
    body: "Something about that submission didn't come through as expected. Refresh the page and try again.",
  },
  INVALID_IMAGE: {
    title: "File could not be read",
    body: "That file doesn't decode as an image. It may be damaged, or not a picture at all. Please try another one.",
  },
  UNSUPPORTED_MEDIA_TYPE: {
    title: "Format not supported",
    body: "We accept JPEG, PNG, WebP and GIF. For an iPhone HEIC photo, export it as JPEG or take a screenshot, then resubmit.",
  },
  IMAGE_TOO_LARGE: {
    title: "File exceeds intake limits",
    body: `Images need to be under ${MAX_MB} MB. A smaller photo or a screenshot will do nicely.`,
  },
  UNPROCESSABLE_IMAGE: {
    title: "Assessment inconclusive",
    body: "Our analyst couldn't reach a determination on this image. A clear, well-lit photo of the subject usually helps.",
  },
  RATE_LIMITED: (retryIn) => ({
    title: "Throughput threshold reached",
    body: retryIn
      ? `You've used your scan allowance for now. Capacity frees up in ${retryIn}.`
      : "You've used your scan allowance for now. Please wait a moment before the next submission.",
  }),
  CAPACITY_EXCEEDED: (retryIn) => ({
    title: "Daily capacity fully allocated",
    body: retryIn
      ? `Today's hot dog analysis budget has been fully utilized. Service resumes in ${retryIn}.`
      : "Today's hot dog analysis budget has been fully utilized. Service resumes tomorrow.",
  }),
  AI_UNAVAILABLE: (retryIn) => ({
    title: "Analysis service degraded",
    body: retryIn
      ? `Our vision provider is experiencing elevated demand. Please try again in ${retryIn}.`
      : "Our vision provider is experiencing elevated demand. Please try again in a moment.",
  }),
  AI_TIMEOUT: {
    title: "Analysis exceeded SLA",
    body: "The verdict took longer than our service-level agreement allows. Please resubmit; it usually clears on the second attempt.",
  },
  AI_NOT_CONFIGURED: {
    title: "Analysis engine offline",
    body: "The classification engine hasn't been provisioned in this environment yet. Please check back shortly.",
  },
  UNAUTHORIZED: {
    title: "Authentication required",
    body: "Please sign in to continue. It takes one click with Google.",
  },
  FORBIDDEN: {
    title: "Insufficient clearance",
    body: "This scan belongs to another account, so it can't be changed from here.",
  },
  NOT_FOUND: {
    title: "Record not located",
    body: "This scan doesn't exist or is no longer shared. Its owner may have deleted it or made it private.",
  },
  QUOTA_EXCEEDED: {
    title: "Free allocation fully utilized",
    body: "You've used all 20 free classifications. Sign in to continue, or contact us about a Business plan sized to your volume.",
  },
  CONFLICT: {
    title: "Record already exists",
    body: "That change conflicts with an existing record. Refresh the page to see the latest state, then try again.",
  },
  INTERNAL: {
    title: "Unexpected service interruption",
    body: "Something went wrong on our side. Please try again; if it persists, include the reference ID when you report it.",
  },
  NETWORK_ERROR: {
    title: "Connection interrupted",
    body: "We couldn't reach our servers. Check your connection and try again.",
  },
  ABORTED: {
    title: "Scan withdrawn",
    body: "The submission was cancelled before a verdict was issued. No further action is required.",
  },
};

/** Enterprise-tone UI copy for an error code. Pass `retryAfterSeconds` (or the whole ApiError) when known. */
export function errorCopy(code: ClientErrorCode, opts: { retryAfterSeconds?: number } = {}): ErrorCopy {
  // Unknown codes can arrive from a newer server build; fall back instead of rendering nothing.
  const entry = COPY[code] ?? COPY.INTERNAL;
  if (typeof entry !== "function") return entry;
  const seconds = opts.retryAfterSeconds;
  return entry(seconds && seconds > 0 ? formatRetryAfter(seconds) : null);
}
