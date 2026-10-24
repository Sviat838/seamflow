import type { NextRequest } from "next/server";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import type { Usage } from "@/lib/types";
import { getUsage } from "@/lib/usage";

/** GET /api/v1/usage: the viewer's plan and Free-plan usage. Per viewer, so never cached. */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    return jsonOk<{ usage: Usage }>({ usage: await getUsage() }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
