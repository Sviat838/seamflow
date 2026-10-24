import type { NextRequest } from "next/server";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { getGlobalStats } from "@/lib/scans/queries";
import type { GetStatsResponse } from "@/lib/types";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    // Cached server-side ('use cache', tag "stats"), so this is cheap to poll.
    return jsonOk<GetStatsResponse>({ stats: await getGlobalStats() }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
