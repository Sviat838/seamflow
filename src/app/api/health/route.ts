import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { log } from "@/lib/log";
import { getAdminClient } from "@/lib/supabase/admin";
import type { HealthResponse } from "@/lib/types";

const DB_TIMEOUT_MS = 2000;

async function checkDatabase(requestId: string): Promise<HealthResponse["checks"]["database"]> {
  const admin = getAdminClient();
  if (!admin) return "not_configured";
  try {
    // HEAD request: proves the key, the network path and the schema without moving rows.
    const { error } = await admin
      .from("scans")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (!error) return "ok";
    log.warn("health.database_unavailable", { requestId, error });
  } catch (error) {
    log.warn("health.database_unavailable", { requestId, error });
  }
  return "unavailable";
}

/** Liveness plus dependency checks. "degraded" is still 200 so uptime probes only page on outages. */
export async function GET(request: Request): Promise<Response> {
  // Health must reflect this moment, never a build-time prerender.
  await connection();
  const requestId = getRequestId(request.headers);
  try {
    const anthropic = serverEnv().ANTHROPIC_API_KEY ? "configured" : "missing";
    const database = await checkDatabase(requestId);
    const body: HealthResponse = {
      status: anthropic === "configured" && database === "ok" ? "ok" : "degraded",
      checks: { anthropic, database },
      time: new Date().toISOString(),
    };
    return jsonOk(body, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
