// Appeal input checks. Pure, so the UI can share the limit (textarea maxLength).
import { z } from "zod";
import { AppError } from "@/lib/errors";

/** Matches the DB check on appeals.reason. */
export const MAX_APPEAL_REASON_LENGTH = 1000;

const reasonSchema = z.string().trim().min(1).max(MAX_APPEAL_REASON_LENGTH);

/** The trimmed reason. Throws AppError INVALID_REQUEST when it's empty, too long or not text. */
export function parseAppealReason(reason: unknown): string {
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) {
    throw new AppError(
      "INVALID_REQUEST",
      "Tell the Review Board why the verdict is wrong, in up to 1,000 characters.",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}
