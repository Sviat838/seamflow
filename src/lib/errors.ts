import type { ApiErrorCode } from "@/lib/types";

/** HTTP status for each API error code. */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_IMAGE: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  IMAGE_TOO_LARGE: 413,
  UNPROCESSABLE_IMAGE: 422,
  RATE_LIMITED: 429,
  CAPACITY_EXCEEDED: 503,
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_NOT_CONFIGURED: 503,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  QUOTA_EXCEEDED: 402,
  CONFLICT: 409,
  INTERNAL: 500,
};

interface AppErrorOptions {
  retryAfterSeconds?: number;
  /** Whether a retry of the same request might succeed. */
  retryable?: boolean;
  cause?: unknown;
}

/**
 * The one error type the backend throws on purpose. `message` must be safe to show to users;
 * put internal detail in `cause` (logged, never returned).
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;

  constructor(code: ApiErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.retryable = options.retryable ?? false;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
