import type { ReviewStatus } from "@/lib/types";

/** Tag text for a verdict's review state ("Final · Subject to appeal", "Under review", ...). */
export function verdictStatusLabel(status: ReviewStatus | null | undefined, opts: { compact?: boolean } = {}): string {
  switch (status) {
    case "pending":
      return "Under review";
    case "upheld":
      return opts.compact ? "Upheld" : "Upheld on appeal";
    case "overturned":
      return opts.compact ? "Overturned" : "Overturned on appeal";
    default:
      return opts.compact ? "Final" : "Final · Subject to appeal";
  }
}
