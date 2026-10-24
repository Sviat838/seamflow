"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { getRequestId } from "@/lib/http/request";
import { toActionError } from "@/lib/http/respond";
import { createScan, deleteScan, updateScan } from "@/lib/scans/service";
import { parseCreateScanForm } from "@/lib/scans/validation";
import type { ActionResult, Scan, UpdateScanRequest } from "@/lib/types";

// Every action is a public POST endpoint: inputs are validated in the service, and errors come
// back as ActionResult so forms using useActionState never need try/catch.

/** useActionState-compatible: `image` (File) and optional `public` ("true" / "false" / checkbox "on"). */
export async function createScanAction(_prev: unknown, formData: FormData): Promise<ActionResult<Scan>> {
  const requestHeaders = await headers();
  const requestId = getRequestId(requestHeaders);
  try {
    const { file, isPublic } = parseCreateScanForm(formData);
    const scan = await createScan({ file, fileName: file.name, isPublic, requestId, headers: requestHeaders });
    // Re-render the current route in the same response so server-rendered history includes it.
    if (scan.persisted) refresh();
    return { ok: true, data: scan };
  } catch (error) {
    return toActionError(error, requestId);
  }
}

export async function updateScanAction(id: string, patch: UpdateScanRequest): Promise<ActionResult<Scan>> {
  const requestId = getRequestId(await headers());
  try {
    const scan = await updateScan(id, patch);
    refresh();
    return { ok: true, data: scan };
  } catch (error) {
    return toActionError(error, requestId);
  }
}

export async function deleteScanAction(id: string): Promise<ActionResult<{ id: string }>> {
  const requestId = getRequestId(await headers());
  try {
    await deleteScan(id);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return toActionError(error, requestId);
  }
}
