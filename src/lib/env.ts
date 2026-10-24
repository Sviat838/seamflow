import "server-only";
import { z } from "zod";

// Unset and empty ("KEY=" in .env files) both mean "not configured".
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());
const positiveInt = (fallback: number) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().positive().default(fallback));

const serverEnvSchema = z.object({
  ANTHROPIC_API_KEY: optionalString,
  /** Overrides the classifier's default model (see src/lib/ai). */
  CLASSIFIER_MODEL: optionalString,
  /** Overrides the Hot Dog Review Board (appeals) model. */
  REVIEW_MODEL: optionalString,
  /** Bearer token Vercel Cron sends to /api/cron/*. */
  CRON_SECRET: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  /** sb_secret_... key. Server-only; bypasses RLS. Without it the app runs but nothing is persisted. */
  SUPABASE_SECRET_KEY: optionalString,
  /** HMAC key for hashing client IPs before they touch logs or the database. */
  APP_SECRET: optionalString,
  RATE_LIMIT_PER_MINUTE: positiveInt(10),
  RATE_LIMIT_PER_DAY: positiveInt(100),
  GLOBAL_DAILY_SCAN_CAP: positiveInt(2000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Validated server environment. Parsed lazily so `next build` works without secrets;
 * every optional service checks for its own keys and degrades when they're missing.
 */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
