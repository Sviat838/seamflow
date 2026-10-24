// Email + password sign-in: form parsing and Supabase error mapping. Pure (no server-only import),
// so it's unit tested directly and its types are safe for the sign-in form.
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, type CredentialField, type PasswordAuthMode } from "./password-rules";

export * from "./password-rules";

export interface Credentials {
  mode: PasswordAuthMode;
  email: string;
  password: string;
}

/** AppError carrying the field it belongs to, so the form can show it inline. */
export class CredentialsError extends AppError {
  constructor(
    code: ConstructorParameters<typeof AppError>[0],
    message: string,
    readonly field: CredentialField | null,
    options?: ConstructorParameters<typeof AppError>[2],
  ) {
    super(code, message, options);
  }
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address, like name@company.com."));

const passwordSchema = (mode: PasswordAuthMode) =>
  mode === "sign_up"
    ? z
        .string()
        .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
        .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters.`)
    : // Sign-in only checks presence: existing passwords are whatever the account was created with.
      z.string().min(1, "Enter your password.").max(MAX_PASSWORD_LENGTH, "Wrong email or password.");

export function parseMode(value: unknown): PasswordAuthMode {
  return value === "sign_up" ? "sign_up" : "sign_in";
}

/** `mode`, `email` and `password` from the form. Throws CredentialsError INVALID_REQUEST with the field. */
export function parseCredentialsForm(formData: FormData): Credentials {
  const mode = parseMode(formData.get("mode"));
  const email = emailSchema.safeParse(asString(formData.get("email")));
  if (!email.success) throw invalid(email.error, "email");
  const password = passwordSchema(mode).safeParse(asString(formData.get("password")));
  if (!password.success) throw invalid(password.error, "password");
  return { mode, email: email.data, password: password.data };
}

/** The email as typed, for echoing back after an error. */
export function typedEmail(formData: FormData): string {
  return asString(formData.get("email")).trim().slice(0, 254);
}

const asString = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

function invalid(error: z.ZodError, field: CredentialField): CredentialsError {
  return new CredentialsError("INVALID_REQUEST", error.issues[0]?.message ?? "Check this field.", field);
}

/** The parts of a Supabase AuthError we map on. */
export interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

const UNAVAILABLE = "Email sign-in is unavailable right now. Please try again, or continue with Google.";

/** Maps a Supabase Auth error (createUser or signInWithPassword) to a user-safe CredentialsError. */
export function mapAuthError(error: AuthErrorLike, mode: PasswordAuthMode): CredentialsError {
  const options = { cause: error };
  switch (error.code) {
    case "email_exists":
    case "user_already_exists":
      return new CredentialsError(
        "CONFLICT",
        "An account with this email already exists. Sign in instead, or continue with Google if you registered with it.",
        "email",
        options,
      );
    case "invalid_credentials":
      return new CredentialsError("UNAUTHORIZED", "Wrong email or password.", null, options);
    case "weak_password":
      return new CredentialsError(
        "INVALID_REQUEST",
        "That password is too easy to guess. Use a longer one, mixing words, numbers and symbols.",
        "password",
        options,
      );
    case "email_address_invalid":
    case "validation_failed":
      return new CredentialsError("INVALID_REQUEST", "Enter a valid email address, like name@company.com.", "email", options);
    case "user_banned":
      return new CredentialsError("FORBIDDEN", "This account is suspended. Contact us if you think this is a mistake.", null, options);
    case "over_request_rate_limit":
      return new CredentialsError("RATE_LIMITED", "Too many attempts. Please wait a minute and try again.", null, {
        ...options,
        retryAfterSeconds: 60,
        retryable: true,
      });
  }
  if (error.status === 429) {
    return new CredentialsError("RATE_LIMITED", "Too many attempts. Please wait a minute and try again.", null, {
      ...options,
      retryAfterSeconds: 60,
      retryable: true,
    });
  }
  // GoTrue answers a wrong password with 400 even when no code is attached.
  if (mode === "sign_in" && error.status === 400) {
    return new CredentialsError("UNAUTHORIZED", "Wrong email or password.", null, options);
  }
  return new CredentialsError("INTERNAL", UNAVAILABLE, null, { ...options, retryable: true });
}
