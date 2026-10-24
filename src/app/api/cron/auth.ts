import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/respond";
import { log } from "@/lib/log";
import type { ApiErrorBody } from "@/lib/types";

export type CronAuth = "ok" | "unauthorized" | "not_configured";

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Pure; compared in constant time. */
export function checkCronAuth(authorization: string | null, secret: string | undefined): CronAuth {
  if (!secret) return "not_configured";
  if (!authorization) return "unauthorized";
  // Hashing both sides gives equal-length buffers, so timingSafeEqual leaks nothing, length included.
  const given = createHash("sha256").update(authorization).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected) ? "ok" : "unauthorized";
}

/** The response for a call that isn't from our cron (401), or when CRON_SECRET is unset (503); else null. */
export function rejectUnlessCron(headers: Headers, requestId: string): Response | null {
  const auth = checkCronAuth(headers.get("authorization"), serverEnv().CRON_SECRET);
  if (auth === "ok") return null;
  if (auth === "unauthorized") {
    return jsonError(new AppError("UNAUTHORIZED", "Missing or invalid cron credentials."), requestId);
  }
  // Fail closed: without a secret anyone could trigger the job.
  log.error("cron.not_configured", { requestId });
  const body: ApiErrorBody = {
    error: { code: "INTERNAL", message: "Scheduled jobs aren't configured on this server.", requestId },
  };
  return Response.json(body, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}
