import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError, isAppError } from "@/lib/errors";
import { log } from "@/lib/log";
import type { ApiError, ApiErrorBody } from "@/lib/types";

const INTERNAL_MESSAGE = "Something went wrong on our side. Please try again.";
// Statuses that must not carry a body; Response.json throws on them.
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

function invalidRequestMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The request is invalid.";
  const path = issue.path.map(String).join(".");
  return `The request is invalid (${path ? `${path}: ` : ""}${issue.message}).`;
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof ZodError) {
    return new AppError("INVALID_REQUEST", invalidRequestMessage(error), { cause: error });
  }
  return new AppError("INTERNAL", INTERNAL_MESSAGE, { cause: error });
}

/** Maps any thrown value to a user-safe ApiError and logs the real cause. */
function describeError(error: unknown, requestId: string): { status: number; apiError: ApiError } {
  const appError = toAppError(error);
  const apiError: ApiError = { code: appError.code, message: appError.message, requestId };
  if (appError.retryAfterSeconds !== undefined && Number.isFinite(appError.retryAfterSeconds)) {
    // Retry-After takes whole seconds.
    apiError.retryAfterSeconds = Math.max(0, Math.ceil(appError.retryAfterSeconds));
  }

  const fields = { requestId, code: apiError.code, status: appError.status, error };
  if (appError.status >= 500) log.error("request.failed", fields);
  else log.warn("request.failed", fields);

  return { status: appError.status, apiError };
}

/** JSON success response. Defaults to `Cache-Control: no-store` (responses are per-viewer). */
export function jsonOk<T>(data: T, init: ResponseInit & { requestId?: string } = {}): Response {
  const { requestId, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (requestId) headers.set("X-Request-Id", requestId);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  if (rest.status !== undefined && NULL_BODY_STATUSES.has(rest.status)) {
    return new Response(null, { ...rest, headers });
  }
  return Response.json(data, { ...rest, headers });
}

/**
 * Maps AppError (ZodError as INVALID_REQUEST, anything else as INTERNAL) to ApiErrorBody with the
 * matching status; sets X-Request-Id, Cache-Control and Retry-After; logs warn (4xx) or error (5xx).
 * Next.js control-flow errors (redirect, notFound, prerender bailouts) are rethrown, not mapped.
 */
export function jsonError(error: unknown, requestId: string): Response {
  unstable_rethrow(error);
  const { status, apiError } = describeError(error, requestId);
  const headers = new Headers({ "X-Request-Id": requestId, "Cache-Control": "no-store" });
  if (apiError.retryAfterSeconds !== undefined) headers.set("Retry-After", String(apiError.retryAfterSeconds));
  const body: ApiErrorBody = { error: apiError };
  return Response.json(body, { status, headers });
}

/** Same mapping for server actions. Rethrows Next.js control-flow errors like jsonError does. */
export function toActionError(error: unknown, requestId: string): { ok: false; error: ApiError } {
  unstable_rethrow(error);
  return { ok: false, error: describeError(error, requestId).apiError };
}
