import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { getPublicScanBySlug } from "@/lib/scans/queries";
import type { GetScanResponse } from "@/lib/types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const requestId = getRequestId(request.headers);
  try {
    const scan = await getPublicScanBySlug((await params).slug);
    // Same answer for "never existed" and "made private again", so links don't leak either.
    if (!scan) throw new AppError("NOT_FOUND", "This shared scan doesn't exist or is no longer public.");
    return jsonOk<GetScanResponse>({ scan }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
