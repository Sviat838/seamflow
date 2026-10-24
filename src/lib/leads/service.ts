import "server-only";
import { getViewerContext } from "@/lib/auth/viewer";
import { AppError } from "@/lib/errors";
import { getClientIp, hashIp } from "@/lib/http/request";
import { log } from "@/lib/log";
import { createRpcConsumer } from "@/lib/rate-limit";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { LeadInput } from "@/lib/types";
import { parseLeadInput } from "./validation";

const LEADS_PER_HOUR = 5;
const HOUR_SECONDS = 3600;

const unavailable = (cause?: unknown) =>
  new AppError("INTERNAL", "We couldn't send your request right now. Please try again later.", {
    cause,
    retryable: true,
  });

/**
 * Stores a Business-plan contact request (no email is sent yet). Rate limited to 5 an hour per IP
 * hash (visitor id when there's no IP). Throws INVALID_REQUEST, RATE_LIMITED or INTERNAL.
 */
export async function submitLead(input: LeadInput, headers: Headers): Promise<{ id: string }> {
  // Re-validated here: server actions hand us whatever the client sent.
  const lead = parseLeadInput(input);
  const admin = getAdminClient();
  // Nowhere to keep it, and no email yet: say so rather than pretend it was received.
  if (!admin) throw unavailable();

  const { viewer, visitorId } = await getViewerContext();
  const ipHash = hashIp(getClientIp(headers));
  await enforceLeadLimit(admin, ipHash ? `ip:${ipHash}` : `v:${visitorId}`);

  const { data, error } = await admin
    .from("leads")
    .insert({
      name: lead.name,
      email: lead.email,
      company: lead.company,
      role: lead.role,
      monthly_volume: lead.monthlyVolume,
      use_case: lead.useCase,
      source: lead.source,
      user_id: viewer.userId,
      ip_hash: ipHash,
    })
    .select("id")
    .single();
  if (error || !data) throw unavailable(error);

  // No names or emails in logs.
  log.info("leads.submitted", { leadId: data.id, source: lead.source, monthlyVolume: lead.monthlyVolume });
  return { id: data.id };
}

/** Fails open if the limiter itself is down: losing a lead is worse than one extra row. */
async function enforceLeadLimit(admin: AdminClient, subject: string): Promise<void> {
  const state = await createRpcConsumer(admin)({
    key: `lead:1h:${subject}`,
    limit: LEADS_PER_HOUR,
    windowSeconds: HOUR_SECONDS,
  }).catch((error: unknown) => {
    log.warn("leads.rate_limit_unavailable", { error });
    return null;
  });
  if (state && !state.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "We've received several requests from your network already. Please try again within the hour.",
      { retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000)), retryable: true },
    );
  }
}
