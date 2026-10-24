"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { fileAppeal } from "@/lib/appeals/service";
import { getRequestId } from "@/lib/http/request";
import { toActionError } from "@/lib/http/respond";
import type { ActionResult, AppealView } from "@/lib/types";

// A public POST endpoint like every action: fileAppeal re-validates both arguments.
// The page hosting this should `export const maxDuration = 60`: the Review Board decides in after().

/** "Request human review" on a case. Owner only; one appeal per scan. */
export async function fileAppealAction(scanId: string, reason: string): Promise<ActionResult<AppealView>> {
  const requestId = getRequestId(await headers());
  try {
    const appeal = await fileAppeal(scanId, reason);
    // Re-render the case in the same response, so it shows "Under review" straight away.
    refresh();
    return { ok: true, data: appeal };
  } catch (error) {
    return toActionError(error, requestId);
  }
}
