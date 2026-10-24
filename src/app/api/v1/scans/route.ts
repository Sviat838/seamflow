import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { listViewerScans } from "@/lib/scans/queries";
import { createScan } from "@/lib/scans/service";
import { imageTooLarge, parseCreateScanForm, parseListScansQuery } from "@/lib/scans/validation";
import { MAX_IMAGE_BYTES, type CreateScanResponse, type ListScansResponse } from "@/lib/types";

// A slow model call plus a retry can take a while; the default platform limit may be shorter.
export const maxDuration = 60;

// Room for multipart boundaries and the other fields on top of the image itself.
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

/** 201 CreateScanResponse; 402 QUOTA_EXCEEDED once the Free plan is used up (mapped by jsonError). */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new AppError("INVALID_REQUEST", "Send the image as multipart/form-data.");
    }
    // Refuse oversized bodies before parsing them (self-hosted has no platform body cap).
    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw imageTooLarge();

    const form = await request.formData().catch((cause: unknown) => {
      throw new AppError("INVALID_REQUEST", "The upload couldn't be read. Please try again.", { cause });
    });
    const { file, isPublic } = parseCreateScanForm(form);
    const scan = await createScan({ file, fileName: file.name, isPublic, requestId, headers: request.headers });
    return jsonOk<CreateScanResponse>({ scan }, { status: 201, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const { limit, cursor } = parseListScansQuery(request.nextUrl.searchParams);
    return jsonOk<ListScansResponse>(await listViewerScans({ limit, cursor }), { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
