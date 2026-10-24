import { cx } from "@/components/ui/cx";
import { ratingBandLabel } from "@/components/ui/format";

export interface RatingBadgeProps {
  /** 0..100; null renders nothing (NOT HOT DOG verdicts have no rating). */
  rating: number | null;
  size?: "sm" | "md" | "lg";
  /** Show "Exemplary" / "Compliant" / "Marginal". */
  showBand?: boolean;
  tone?: "light" | "navy";
  className?: string;
}

/** HDX Rating (0–100) with its band. Reads as "HDX Rating 92 out of 100, Exemplary". */
export function RatingBadge({ rating, size = "md", showBand = true, tone = "light", className }: RatingBadgeProps) {
  if (rating == null || !Number.isFinite(rating)) return null;
  const value = Math.round(Math.min(100, Math.max(0, rating)));
  const band = ratingBandLabel(value);
  const onNavy = tone === "navy";
  const spoken = `HDX Rating ${value} out of 100${showBand ? `, ${band}` : ""}`;

  if (size === "sm") {
    return (
      <span
        className={cx(
          "inline-flex min-h-7 items-center gap-1.5 rounded-chip border px-2.5 text-13 whitespace-nowrap",
          onNavy ? "border-navy-border bg-navy-raised text-white" : "border-hairline bg-white text-navy",
          className,
        )}
      >
        <span className="sr-only">{spoken}</span>
        <span aria-hidden="true" className="contents">
          <span className={cx("text-xs font-bold tracking-[0.08em] uppercase", onNavy ? "text-on-navy-secondary" : "text-secondary")}>
            HDX Rating
          </span>
          <span className="font-bold tabular-nums">{value}</span>
          {showBand ? <span className={onNavy ? "text-on-navy-sub" : "text-body"}>· {band}</span> : null}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cx(
        "inline-flex flex-col rounded-card border",
        size === "lg" ? "gap-1 px-5 py-4" : "gap-0.5 px-4 py-3",
        onNavy ? "border-navy-border bg-navy-raised text-white" : "border-hairline bg-white text-navy",
        className,
      )}
    >
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true" className={cx("text-xs font-bold tracking-[0.08em] uppercase", onNavy ? "text-on-navy-secondary" : "text-secondary")}>
        HDX Rating
      </span>
      <span aria-hidden="true" className="flex items-baseline gap-1.5">
        <span className={cx("font-serif leading-none font-semibold tabular-nums", size === "lg" ? "text-[44px]" : "text-[28px]")}>
          {value}
        </span>
        <span className={cx("text-13", onNavy ? "text-on-navy-secondary" : "text-secondary")}>/ 100</span>
      </span>
      {showBand ? (
        <span aria-hidden="true" className={cx("text-13 font-semibold", onNavy ? "text-on-navy-sub" : "text-body")}>
          {band}
        </span>
      ) : null}
    </span>
  );
}
