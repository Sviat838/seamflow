"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { originFromHeaders, sanitizeNextPath } from "@/lib/auth/redirect";
import { log } from "@/lib/log";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Starts Google OAuth (PKCE). Use as a form action; an optional `next` field (relative path)
 * is where the user lands after sign-in. Always redirects: to Google, or to "/?auth_error=...".
 */
export async function signInWithGoogle(formData?: FormData): Promise<void> {
  // Duck-typed: a misuse like useActionState(signInWithGoogle) passes prev state first.
  const next = sanitizeNextPath(typeof formData?.get === "function" ? formData.get("next") : null);
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/?auth_error=not_configured");

  const origin = originFromHeaders(await headers());
  let providerUrl: string | null = null;
  if (!origin) {
    log.warn("auth.sign_in_invalid_origin");
  } else {
    try {
      // On the server this only builds the URL and stores the PKCE verifier cookie.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          // Lets people on shared machines pick the right Google account.
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) log.warn("auth.sign_in_failed", { error });
      else providerUrl = data.url;
    } catch (error) {
      log.error("auth.sign_in_failed", { error });
    }
  }
  // redirect() throws, so it stays outside the try block.
  redirect(providerUrl ?? "/?auth_error=1");
}

/** Signs out this browser and redirects to "/". */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  if (supabase) {
    let failed = false;
    try {
      // "local" ends this browser's session only, not the user's other devices.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        failed = true;
        log.warn("auth.sign_out_failed", { error });
      }
    } catch (error) {
      failed = true;
      log.warn("auth.sign_out_failed", { error });
    }
    // supabase-js keeps the session cookies when the revoke call fails; drop them anyway so
    // "Sign out" always signs out.
    if (failed) {
      const cookieStore = await cookies();
      for (const { name } of cookieStore.getAll()) {
        if (name.startsWith("sb-")) cookieStore.delete(name);
      }
    }
  }
  redirect("/");
}
