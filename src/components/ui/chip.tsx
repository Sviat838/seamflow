import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "white" | "ground";
}

const CHIP = "inline-flex min-h-7 items-center rounded-chip border border-hairline px-2.5 text-13 font-semibold text-navy";

/** Neutral label chip, e.g. a detected item ("Split bun"). */
export function Chip({ tone = "white", className, ...props }: ChipProps) {
  return <span {...props} className={cx(CHIP, tone === "ground" ? "bg-ground" : "bg-white", className)} />;
}

export interface ChipListProps {
  items: ReactNode[];
  tone?: "white" | "ground";
  className?: string;
  "aria-label"?: string;
}

/** A wrapping list of chips. */
export function ChipList({ items, tone = "white", className, ...aria }: ChipListProps) {
  if (items.length === 0) return null;
  return (
    <ul {...aria} className={cx("flex flex-wrap gap-2", className)}>
      {items.map((item, i) => (
        <li key={i} className={cx(CHIP, tone === "ground" ? "bg-ground" : "bg-white")}>
          {item}
        </li>
      ))}
    </ul>
  );
}
