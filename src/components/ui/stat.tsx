import type { ReactNode } from "react";
import { cx } from "./cx";

export type StatTone = "light" | "navy" | "hot";

const COLUMNS = {
  auto: "grid-cols-[repeat(auto-fit,minmax(min(8rem,100%),1fr))]",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
} as const;

export interface StatListProps {
  columns?: keyof typeof COLUMNS;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

/** A <dl> grid of Stat items. */
export function StatList({ columns = "auto", className, children, ...aria }: StatListProps) {
  return (
    <dl {...aria} className={cx("grid gap-x-5 gap-y-4", COLUMNS[columns], className)}>
      {children}
    </dl>
  );
}

const TONES: Record<StatTone, { label: string; value: string; rule: string }> = {
  light: { label: "text-secondary", value: "text-navy", rule: "border-hairline" },
  navy: { label: "text-on-navy-secondary", value: "text-white", rule: "border-on-navy-secondary" },
  hot: { label: "text-navy", value: "text-navy", rule: "border-navy" },
};

const SIZES = {
  sm: "text-[26px] leading-[1.1]",
  md: "text-[28px] leading-[1.15]",
  lg: "text-[32px] leading-[1.1] sm:text-[36px]",
} as const;

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  size?: keyof typeof SIZES;
  /** "left" = hairline on the left (landing metrics); "top" = 2 px rule (verdict band). */
  rule?: "left" | "top" | "none";
  tone?: StatTone;
  className?: string;
}

/** Big serif number with a label. Renders dt/dd: keep it inside StatList or another <dl>. */
export function Stat({ label, value, size = "sm", rule = "left", tone = "light", className }: StatProps) {
  const t = TONES[tone];
  const uppercase = rule === "top";
  return (
    <div
      className={cx(
        "min-w-0",
        rule === "left" && cx("border-l pl-3.5", t.rule),
        rule === "top" && cx("border-t-2 pt-2.5", t.rule),
        className,
      )}
    >
      <dt className={cx(uppercase ? "text-xs font-bold tracking-[0.08em] uppercase" : "text-13 leading-snug", t.label)}>
        {label}
      </dt>
      <dd className={cx("mt-1 font-serif font-semibold tabular-nums", SIZES[size], t.value)}>{value}</dd>
    </div>
  );
}
