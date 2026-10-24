"use client";

import { useState, useTransition } from "react";
import { setCompanyListingAction } from "@/app/actions/companies";
import { FieldError } from "@/components/ui/form";

/** Owner-only switch for the public leaderboard listing. */
export function ListingToggle({ initial, canEdit }: { initial: boolean; canEdit: boolean }) {
  const [listed, setListed] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setError(null);
    setListed(next);
    startTransition(async () => {
      const result = await setCompanyListingAction(next);
      if (!result.ok) {
        setListed(!next);
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-2">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-15 font-semibold text-navy">
        <input
          type="checkbox"
          className="size-5 accent-navy"
          checked={listed}
          disabled={!canEdit || pending}
          onChange={(e) => toggle(e.target.checked)}
          aria-describedby="listing-hint listing-error"
        />
        List my company on the public leaderboard
      </label>
      <p id="listing-hint" className="text-13 text-secondary">
        {canEdit ? "Shows your company name, HDX Rating and certified products at /companies." : "Only the company owner can change this."}
      </p>
      <div aria-live="polite">
        <FieldError id="listing-error">{error}</FieldError>
      </div>
    </div>
  );
}
