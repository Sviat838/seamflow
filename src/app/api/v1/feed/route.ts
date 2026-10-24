import type { NextRequest } from "next/server";
import { getFeedSnapshot } from "@/lib/feed/snapshot";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { findAccessibleScan } from "@/lib/scans/access";
import { isCaseNumber } from "@/lib/scans/validation";
import type { FeedSnapshot } from "@/lib/types";

/** GET /api/v1/feed?case=HDX-…&limit=12 → FeedSnapshot. Polled by the live feed; never cached. */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const params = request.nextUrl.searchParams;
    const caseNumber = params.get("case");
    // Only a case the viewer may open is highlighted; anything else is quietly ignored. The access
    // check is one read with no image signing, so it's fine on every poll.
    const found = isCaseNumber(caseNumber) ? await findAccessibleScan(caseNumber) : null;
    const limit = params.has("limit") ? Number(params.get("limit")) : undefined;
    const snapshot = await getFeedSnapshot({ limit, highlightScanId: found?.row.id ?? null });
    return jsonOk<FeedSnapshot>(snapshot, { requestId, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
