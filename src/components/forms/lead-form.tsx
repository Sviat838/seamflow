"use client";

import { useActionState } from "react";
import { submitLeadAction } from "@/app/actions/leads";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { LEAD_HONEYPOT_FIELD, LEAD_LIMITS } from "@/lib/leads/validation";
import { MONTHLY_VOLUMES, type ActionResult, type MonthlyVolume } from "@/lib/types";

type State = ActionResult<{ id: string }> | null;

const VOLUME_LABELS: Record<MonthlyVolume, string> = {
  "<1k": "Under 1,000 images",
  "1k-10k": "1,000 to 10,000 images",
  "10k-100k": "10,000 to 100,000 images",
  "100k-1m": "100,000 to 1 million images",
  ">1m": "Over 1 million images",
};

export function LeadForm({ source }: { source: string | null }) {
  const [state, formAction, pending] = useActionState<State, FormData>(submitLeadAction, null);

  if (state?.ok) {
    return (
      <div role="status" aria-live="polite">
        <Notice tone="success" title="Thanks, we have your details">
          Your request is saved. A person from HDX reviews every Business enquiry and replies by email, usually
          within two business days. Nothing else happens automatically.
        </Notice>
      </div>
    );
  }

  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="space-y-5">
      <div role="alert" aria-live="assertive">
        {error ? (
          <Notice tone="error" title="We couldn't send your request">
            {error.message}
          </Notice>
        ) : null}
      </div>
      <input type="hidden" name="source" value={source ?? ""} />
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor={LEAD_HONEYPOT_FIELD}>Leave this field empty</label>
        <input id={LEAD_HONEYPOT_FIELD} name={LEAD_HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Name">
          {(aria) => <Input {...aria} name="name" required maxLength={LEAD_LIMITS.name} autoComplete="name" />}
        </Field>
        <Field id="email" label="Work email">
          {(aria) => (
            <Input {...aria} name="email" type="email" required maxLength={LEAD_LIMITS.email} autoComplete="email" />
          )}
        </Field>
        <Field id="company" label="Company">
          {(aria) => (
            <Input {...aria} name="company" required maxLength={LEAD_LIMITS.company} autoComplete="organization" />
          )}
        </Field>
        <Field id="role" label="Role" optional>
          {(aria) => <Input {...aria} name="role" maxLength={LEAD_LIMITS.role} autoComplete="organization-title" />}
        </Field>
      </div>
      <Field id="monthlyVolume" label="Monthly image volume" optional>
        {(aria) => (
          <Select {...aria} name="monthlyVolume" defaultValue="">
            <option value="">Not sure yet</option>
            {MONTHLY_VOLUMES.map((volume) => (
              <option key={volume} value={volume}>
                {VOLUME_LABELS[volume]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="useCase" label="Use case" optional hint="What do you need classified, and where does it run?">
        {(aria) => <Textarea {...aria} name="useCase" maxLength={LEAD_LIMITS.useCase} rows={5} />}
      </Field>
      <SubmitButton size="lg" pending={pending} pendingLabel="Sending">
        Contact sales
      </SubmitButton>
    </form>
  );
}
