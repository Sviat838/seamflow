import type { NextRequest } from "next/server";
import { updateCertificateProduct } from "@/lib/certificates/service";
import { parseCertificateProductPatch } from "@/lib/certificates/validation";
import { AppError } from "@/lib/errors";
import { getRequestId } from "@/lib/http/request";
import { jsonError, jsonOk } from "@/lib/http/respond";
import type { CertificateSummary } from "@/lib/types";

interface Context {
  params: Promise<{ scanId: string }>;
}

/**
 * PATCH /api/v1/certificates/{scanId} with { productName?, sku? } (string, or null to clear).
 * Owner or same-company member. 200 { certificate: CertificateSummary }.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const body: unknown = await request.json().catch((cause: unknown) => {
      throw new AppError("INVALID_REQUEST", "The request body must be JSON.", { cause });
    });
    const certificate = await updateCertificateProduct((await params).scanId, parseCertificateProductPatch(body));
    return jsonOk<{ certificate: CertificateSummary }>({ certificate }, { requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
