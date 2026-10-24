import type { NextRequest } from "next/server";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { getAdminClient } from "@/lib/supabase/admin";
import { rejectUnlessCron } from "../auth";
import { purgeExpiredImages, type PurgeResult } from "./purge";

// Up to 500 storage deletes plus their audit rows: more than some plans' default function limit.
export const maxDuration = 60;

/** Daily (vercel.json): deletes images past IMAGE_RETENTION_HOURS. Bearer CRON_SECRET only. */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  const rejected = rejectUnlessCron(request.headers, requestId);
  if (rejected) return rejected;
  try {
    const admin = getAdminClient();
    // Without a database nothing was ever stored, so there's nothing to delete.
    const result: PurgeResult = admin ? await purgeExpiredImages(admin) : { candidates: 0, deleted: 0, failed: 0 };
    return jsonOk(result, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
