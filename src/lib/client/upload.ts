import { API_ERROR_CODES, type ApiErrorCode, type Scan } from "@/lib/types";
import { errorCopy, ScanRequestError, type ClientErrorCode } from "./errors";

export const SCANS_ENDPOINT = "/api/v1/scans";

export interface UploadScanOptions {
  /** Make the scan visible at its share link. Defaults to false. */
  isPublic?: boolean;
  /** Upload progress, 0..1. Reaching 1 means the bytes are sent and the verdict is pending. */
  onProgress?: (fraction: number) => void;
  /** Aborting rejects with ScanRequestError("ABORTED"). */
  signal?: AbortSignal;
  /** Original file name to record on the scan (prepareImage may re-encode and rename the file). */
  fileName?: string;
}

/**
 * POSTs an image to /api/v1/scans and resolves with the verdict. Uses XMLHttpRequest rather than
 * fetch because fetch still can't report upload progress. Rejects with ScanRequestError.
 */
export function uploadScan(file: File, opts: UploadScanOptions = {}): Promise<Scan> {
  const { isPublic = false, onProgress, signal, fileName } = opts;

  return new Promise<Scan>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }

    const form = new FormData();
    form.append("image", file, fileName || file.name || "scan.jpg");
    form.append("public", isPublic ? "true" : "false");

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = (fn: () => void) => {
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    xhr.open("POST", SCANS_ENDPOINT);
    xhr.setRequestHeader("Accept", "application/json");
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
      };
      // Some browsers skip the final progress event for small bodies; this one always fires.
      xhr.upload.onload = () => onProgress(1);
    }
    xhr.onload = () =>
      settle(() => {
        try {
          resolve(
            parseScanResponse({
              status: xhr.status,
              body: xhr.responseText,
              requestId: xhr.getResponseHeader("x-request-id"),
              retryAfter: xhr.getResponseHeader("retry-after"),
            }),
          );
        } catch (error) {
          reject(error);
        }
      });
    xhr.onerror = () =>
      settle(() => reject(new ScanRequestError("NETWORK_ERROR", errorCopy("NETWORK_ERROR").body)));
    xhr.onabort = () => settle(() => reject(abortedError()));

    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(form);
  });
}

/** The parts of an HTTP response parseScanResponse needs; kept plain so it's testable without a browser. */
export interface ScanHttpResponse {
  status: number;
  body: string;
  /** X-Request-Id response header. */
  requestId?: string | null;
  /** Retry-After response header (seconds or HTTP date). */
  retryAfter?: string | null;
}

// Responses that never reached our route handler (Vercel's body-size limit, function timeouts,
// proxies) aren't ApiErrorBody JSON, so their status is all we have.
const STATUS_FALLBACK: Partial<Record<number, ApiErrorCode>> = {
  400: "INVALID_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  413: "IMAGE_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_IMAGE",
  429: "RATE_LIMITED",
  503: "AI_UNAVAILABLE",
  504: "AI_TIMEOUT",
};

/** Turns a POST /api/v1/scans response into a Scan, or throws the matching ScanRequestError. */
export function parseScanResponse(res: ScanHttpResponse, now: number = Date.now()): Scan {
  const json = parseJson(res.body);
  const headerRequestId = res.requestId || undefined;

  if (res.status >= 200 && res.status < 300) {
    const scan = isRecord(json) ? json.scan : undefined;
    if (looksLikeScan(scan)) return scan;
    throw new ScanRequestError("INTERNAL", errorCopy("INTERNAL").body, {
      requestId: headerRequestId,
      status: res.status,
      cause: new Error("2xx response without a scan"),
    });
  }

  const error: Record<string, unknown> = isRecord(json) && isRecord(json.error) ? json.error : {};
  const code: ClientErrorCode = isApiErrorCode(error.code)
    ? error.code
    : res.status === 0
      ? "NETWORK_ERROR"
      : (STATUS_FALLBACK[res.status] ?? "INTERNAL");
  const retryAfterSeconds = positiveSeconds(error.retryAfterSeconds) ?? parseRetryAfter(res.retryAfter, now);
  const requestId = (typeof error.requestId === "string" && error.requestId) || headerRequestId;
  const message =
    typeof error.message === "string" && error.message ? error.message : errorCopy(code, { retryAfterSeconds }).body;

  throw new ScanRequestError(code, message, { requestId, retryAfterSeconds, status: res.status });
}

/** Retry-After as whole seconds from now; accepts delta-seconds or an HTTP date. */
export function parseRetryAfter(header: string | null | undefined, now: number = Date.now()): number | undefined {
  const value = header?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return positiveSeconds(Number(value));
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : positiveSeconds((at - now) / 1000);
}

function abortedError(): ScanRequestError {
  return new ScanRequestError("ABORTED", errorCopy("ABORTED").body);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

function positiveSeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

// A light shape check: the server is trusted, this only guards against proxies and HTML error pages.
function looksLikeScan(value: unknown): value is Scan {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.verdict === "hot_dog" || value.verdict === "not_hot_dog") &&
    typeof value.confidence === "number"
  );
}
