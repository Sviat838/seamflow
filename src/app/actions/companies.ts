"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { completeOnboarding, setCompanyListing } from "@/lib/companies/service";
import { parseOnboardingForm } from "@/lib/companies/validation";
import { getRequestId } from "@/lib/http/request";
import { toActionError } from "@/lib/http/respond";
import type { ActionResult, OnboardingResult, ViewerCompany } from "@/lib/types";

// Public POST endpoints: inputs are validated in the service, and errors come back as
// ActionResult so forms using useActionState never need try/catch.

/**
 * useActionState-compatible onboarding form: `companyName` and optional `jobTitle`.
 * Doesn't redirect: on success the page shows the result and navigates to its `next`.
 */
export async function completeOnboardingAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<OnboardingResult>> {
  const requestId = getRequestId(await headers());
  try {
    const result = await completeOnboarding(parseOnboardingForm(formData));
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error, requestId);
  }
}

/** Owner only: shows or hides the company on the public leaderboard. */
export async function setCompanyListingAction(isListed: boolean): Promise<ActionResult<ViewerCompany>> {
  const requestId = getRequestId(await headers());
  try {
    const company = await setCompanyListing(isListed);
    // Re-render the current route (settings) in the same response.
    refresh();
    return { ok: true, data: company };
  } catch (error) {
    return toActionError(error, requestId);
  }
}
