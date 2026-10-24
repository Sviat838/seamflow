"use client";

import { useState, useTransition } from "react";
import { fileAppealAction } from "@/app/actions/appeals";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/form";

/** "Request human review": files an appeal with the Hot Dog Review Board. */
export function AppealForm({ scanId }: { scanId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await fileAppealAction(scanId, reason);
      if (result.ok) setDone(true);
      else setError(result.error.message);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-describedby="appeal-hint">
      <Label htmlFor="appeal-reason">Why should a human review this verdict?</Label>
      <FieldHint id="appeal-hint">The Hot Dog Review Board re-examines the image and rules within a few minutes.</FieldHint>
      <Textarea
        id="appeal-reason"
        name="reason"
        required
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "appeal-error appeal-hint" : "appeal-hint"}
      />
      <div aria-live="polite">
        <FieldError id="appeal-error">{error}</FieldError>
        {done ? <p className="text-15 font-semibold text-status-green">Appeal filed. This case is now under review.</p> : null}
      </div>
      <Button type="submit" variant="secondary" pending={pending} disabled={done || reason.trim().length === 0}>
        Request human review
      </Button>
    </form>
  );
}
