import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import { getScanForViewer } from "@/lib/scans/queries";
import { deleteScan, updateScan } from "@/lib/scans/service";
import { parseUpdateScanRequest } from "@/lib/scans/validation";
import type { GetScanResponse } from "@/lib/types";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const scan = await getScanForViewer((await params).id);
    if (!scan) throw new AppError("NOT_FOUND", "We couldn't find that scan.");
    return jsonOk<GetScanResponse>({ scan }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const body: unknown = await request.json().catch((cause: unknown) => {
      throw new AppError("INVALID_REQUEST", "The request body must be JSON.", { cause });
    });
    const scan = await updateScan((await params).id, parseUpdateScanRequest(body));
    return jsonOk<GetScanResponse>({ scan }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    await deleteScan((await params).id);
    return jsonOk(null, { status: 204, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
