"use server";

import { headers } from "next/headers";
import { getRequestId } from "@/lib/http/request";
import { toActionError } from "@/lib/http/respond";
import { submitLead } from "@/lib/leads/service";
import { parseLeadForm } from "@/lib/leads/validation";
import { log } from "@/lib/log";
import type { ActionResult } from "@/lib/types";

/**
 * useActionState-compatible Business-plan contact form. Fields: name, email, company, role,
 * monthlyVolume (MONTHLY_VOLUMES), useCase, source, plus the LEAD_HONEYPOT_FIELD trap.
 */
export async function submitLeadAction(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const requestHeaders = await headers();
  const requestId = getRequestId(requestHeaders);
  try {
    const form = parseLeadForm(formData);
    if (form.isBot) {
      log.info("leads.honeypot", { requestId });
      // Looks like success, so the bot moves on without learning what tripped it. Nothing is stored.
      return { ok: true, data: { id: crypto.randomUUID() } };
    }
    return { ok: true, data: await submitLead(form.input, requestHeaders) };
  } catch (error) {
    return toActionError(error, requestId);
  }
}
