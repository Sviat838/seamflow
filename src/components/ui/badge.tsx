import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { LockIcon } from "./icons";

export type BadgeTone = "neutral" | "navy" | "mustard" | "outline" | "outlineOnNavy" | "ground";

const TONES: Record<BadgeTone, string> = {
  neutral: "border border-hairline bg-white text-navy",
  ground: "border border-hairline bg-ground text-navy",
  navy: "border border-navy bg-navy text-white",
  mustard: "border border-mustard bg-mustard text-navy",
  outline: "border border-navy bg-transparent text-navy",
  outlineOnNavy: "border border-white bg-transparent text-white",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
}

/** Small 4 px-radius tag (12 px, bold). */
export function Badge({ tone = "neutral", icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex min-h-6 items-center gap-1.5 rounded-chip px-2 text-xs leading-none font-bold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Lock + "Business": marks a Business-plan feature. */
export function BusinessTag({
  label = "Business",
  tone = "light",
  className,
}: {
  label?: string;
  tone?: "light" | "navy";
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-xs leading-none font-bold whitespace-nowrap",
        tone === "navy" ? "bg-navy-border text-white" : "border border-hairline bg-ground text-navy",
        className,
      )}
    >
      <LockIcon size={12} strokeWidth={2.25} />
      {label}
    </span>
  );
}

/** 8 px status dot plus an optional label ("Live · 12 verdicts today"). */
export function LiveDot({
  label,
  tone = "light",
  muted,
  className,
}: {
  label?: ReactNode;
  tone?: "light" | "navy";
  /** Grey dot, for paused or reconnecting states. */
  muted?: boolean;
  className?: string;
}) {
  const dot = muted ? (tone === "navy" ? "bg-on-navy-muted" : "bg-secondary") : tone === "navy" ? "bg-status-green-bright" : "bg-status-green";
  const text = muted ? (tone === "navy" ? "text-on-navy-secondary" : "text-secondary") : tone === "navy" ? "text-white" : "text-status-green";
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold", text, className)}>
      <span aria-hidden="true" className={cx("inline-block size-2 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  );
}
