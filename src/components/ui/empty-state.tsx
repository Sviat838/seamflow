import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  /** Heading level for the title (default h2). */
  as?: "h2" | "h3";
  className?: string;
}

/** Centred placeholder for an empty list. */
export function EmptyState({ title, body, action, icon, as: Heading = "h2", className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className="mb-4 inline-flex size-12 items-center justify-center rounded-card border border-hairline bg-ground text-navy"
        >
          {icon}
        </span>
      ) : null}
      <Heading className="font-serif text-[22px] leading-snug font-semibold text-navy">{title}</Heading>
      {body ? <p className="mt-2 max-w-md text-15 text-body">{body}</p> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
