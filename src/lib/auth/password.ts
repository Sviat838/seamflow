import "server-only";
import { AppError } from "@/lib/errors";
import { getClientIp, hashIp } from "@/lib/http/request";
import { log } from "@/lib/log";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { mapAuthError, type AuthErrorLike, type Credentials } from "./credentials";

const notConfigured = () =>
  new AppError("INTERNAL", "Email sign-in is unavailable right now. Please try again, or continue with Google.", {
    retryable: true,
  });

/**
 * Email + password sign-in or sign-up; on success the session cookies are set on this response.
 * Sign-up never sends a confirmation email: the account is created server-side with the email
 * already confirmed (independent of the dashboard's "Confirm email" setting), then signed in.
 * Rate limited per IP, and per account for sign-in. Throws CredentialsError / AppError.
 */
export async function authenticateWithPassword(
  { mode, email, password }: Credentials,
  { headers, requestId }: { headers: Headers; requestId: string },
): Promise<{ userId: string }> {
  const supabase = await createServerSupabase();
  const admin = getAdminClient();
  if (!supabase || (mode === "sign_up" && !admin)) throw notConfigured();

  // The email key is HMAC'd like IPs, so the rate-limit table never holds raw addresses.
  await enforceAuthRateLimit(mode, { ipHash: hashIp(getClientIp(headers)), emailHash: hashIp(email) });

  if (mode === "sign_up" && admin) {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw failed(error, mode, requestId);
    log.info("auth.password_sign_up", { requestId });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw failed(error ?? { message: "no user returned" }, "sign_in", requestId);
  return { userId: data.user.id };
}

function failed(error: AuthErrorLike, mode: Credentials["mode"], requestId: string) {
  const mapped = mapAuthError(error, mode);
  // Wrong passwords and taken emails are expected; anything else is worth a closer look.
  const level = mapped.code === "INTERNAL" ? "error" : "warn";
  log[level]("auth.password_failed", { requestId, mode, code: error.code, status: error.status });
  return mapped;
}
