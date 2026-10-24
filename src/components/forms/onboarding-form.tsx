"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { completeOnboardingAction } from "@/app/actions/companies";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult, OnboardingResult } from "@/lib/types";

type State = ActionResult<OnboardingResult> | null;

export function OnboardingForm({ next }: { next: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<State, FormData>(completeOnboardingAction, null);
  const succeeded = state?.ok === true;

  useEffect(() => {
    if (succeeded) {
      router.replace(next);
      router.refresh();
    }
  }, [succeeded, next, router]);

  const error = state && !state.ok ? state.error : null;
  const nameError = error && (error.code === "CONFLICT" || error.code === "INVALID_REQUEST") ? error.message : null;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div aria-live="polite" role="status">
        {succeeded ? (
          <Notice tone="success" title={`${state.data.company.name} is registered`}>
            Taking you to your workspace.
          </Notice>
        ) : null}
        {error && !nameError ? (
          <Notice tone="error" title="We couldn't register your company">
            {error.message}
          </Notice>
        ) : null}
      </div>
      <Field
        id="companyName"
        label="Company name"
        hint="As it should appear on certificates and the public leaderboard."
        error={nameError}
      >
        {(aria) => (
          <Input {...aria} name="companyName" required minLength={2} maxLength={80} autoComplete="organization" />
        )}
      </Field>
      <Field id="jobTitle" label="Job title" optional>
        {(aria) => <Input {...aria} name="jobTitle" maxLength={80} autoComplete="organization-title" />}
      </Field>
      <SubmitButton block size="lg" pending={pending || succeeded} pendingLabel="Registering">
        Create workspace
      </SubmitButton>
    </form>
  );
}
