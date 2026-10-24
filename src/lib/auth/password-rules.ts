// Constants and form-state types for email + password auth. No dependencies, so the client form
// can import them without pulling zod or server code into the bundle.
import type { ApiError } from "@/lib/types";

export const MIN_PASSWORD_LENGTH = 8;
// Supabase hashes passwords with bcrypt, which only reads the first 72 bytes.
export const MAX_PASSWORD_LENGTH = 72;

export type PasswordAuthMode = "sign_in" | "sign_up";
export type CredentialField = "email" | "password";

/** useActionState state of the email + password form: null until a submit fails (success redirects). */
export type PasswordAuthState = {
  error: ApiError;
  /** Echoed back so the form keeps what was typed (never the password). */
  email: string;
  mode: PasswordAuthMode;
  /** The field the error belongs to; null for form-level errors. */
  field: CredentialField | null;
} | null;
