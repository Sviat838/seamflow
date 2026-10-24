"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { updateCertificateProduct } from "@/lib/certificates/service";
import { getRequestId } from "@/lib/http/request";
import { toActionError } from "@/lib/http/respond";
import type { ActionResult, CertificateSummary } from "@/lib/types";

// A public POST endpoint like every action: the service re-validates the patch and checks access,
// and errors come back as ActionResult so callers never need try/catch.

/** Sets or clears the product name and SKU on a case's certificate. Owner or company member. */
export async function updateCertificateProductAction(
  scanId: string,
  patch: { productName?: string | null; sku?: string | null },
): Promise<ActionResult<CertificateSummary>> {
  const requestId = getRequestId(await headers());
  try {
    const certificate = await updateCertificateProduct(scanId, patch);
    // Re-render the case page (and its labels) with the new product details in the same response.
    refresh();
    return { ok: true, data: certificate };
  } catch (error) {
    return toActionError(error, requestId);
  }
}
