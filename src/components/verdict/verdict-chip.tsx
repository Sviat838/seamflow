import { cx } from "@/components/ui/cx";
import { verdictLabel } from "@/components/ui/format";
import type { Verdict } from "@/lib/types";

const SIZES = {
  sm: "h-6 px-2 text-xs",
  md: "h-7 px-2.5 text-13",
  lg: "h-8 px-3 text-sm",
} as const;

export interface VerdictChipProps {
  verdict: Verdict;
  size?: keyof typeof SIZES;
  /** On navy, NOT HOT DOG becomes a white outline so it stays visible. */
  onNavy?: boolean;
  className?: string;
}

/** HOT DOG = mustard with navy text; NOT HOT DOG = navy with white text. */
export function VerdictChip({ verdict, size = "sm", onNavy, className }: VerdictChipProps) {
  const hot = verdict === "hot_dog";
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-chip leading-none font-bold tracking-[0.08em] whitespace-nowrap uppercase",
        SIZES[size],
        hot
          ? "bg-mustard text-navy"
          : onNavy
            ? "border-[1.5px] border-white bg-transparent text-white"
            : "bg-navy text-white",
        className,
      )}
    >
      {verdictLabel(verdict)}
    </span>
  );
}
