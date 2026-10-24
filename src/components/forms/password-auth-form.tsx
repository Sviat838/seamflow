"use client";

import { useActionState, useState } from "react";
import { passwordAuthAction } from "@/app/actions/auth";
import { cx } from "@/components/ui/cx";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, type PasswordAuthMode, type PasswordAuthState } from "@/lib/auth/password-rules";

const MODES: { value: PasswordAuthMode; label: string }[] = [
  { value: "sign_in", label: "Sign in" },
  { value: "sign_up", label: "Create account" },
];

/** Email + password sign-in and registration (no confirmation email). Success redirects server-side. */
export function PasswordAuthForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<PasswordAuthState, FormData>(passwordAuthAction, null);
  const [mode, setMode] = useState<PasswordAuthMode>("sign_in");
  // An error belongs to the mode it was raised in; switching tabs clears it from view.
  const error = state && state.mode === mode ? state : null;
  const emailError = error?.field === "email" ? error.error.message : null;
  const passwordError = error?.field === "password" ? error.error.message : null;
  const formError = error && !error.field ? error.error : null;
  const signUp = mode === "sign_up";

  return (
    <div>
      <div role="group" aria-label="Email account" className="grid grid-cols-2 rounded-card border border-hairline bg-ground p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
            className={cx(
              "min-h-11 rounded-chip text-15 font-semibold",
              mode === m.value ? "bg-white text-navy shadow-sm ring-1 ring-hairline" : "text-secondary hover:text-navy",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <form action={formAction} className="mt-5 space-y-5" noValidate>
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next} />
        <div aria-live="polite" role="status">
          {formError ? (
            <Notice tone="error" title={signUp ? "We couldn't create your account" : "Sign-in didn't complete"}>
              {formError.message}
            </Notice>
          ) : null}
        </div>
        <Field id="email" label="Work email" error={emailError}>
          {(aria) => (
            <Input
              {...aria}
              key={`email-${state?.email ?? ""}`}
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              defaultValue={state?.email ?? ""}
            />
          )}
        </Field>
        <Field
          id="password"
          label="Password"
          hint={signUp ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
          error={passwordError}
        >
          {(aria) => (
            <Input
              {...aria}
              name="password"
              type="password"
              required
              minLength={signUp ? MIN_PASSWORD_LENGTH : undefined}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete={signUp ? "new-password" : "current-password"}
            />
          )}
        </Field>
        <SubmitButton block size="lg" variant="secondary" pending={pending} pendingLabel={signUp ? "Creating account" : "Signing in"}>
          {signUp ? "Create account" : "Sign in with email"}
        </SubmitButton>
      </form>
    </div>
  );
}
