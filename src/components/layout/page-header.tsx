import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export interface PageHeaderProps {
  title: ReactNode;
  /** Small line under the title, e.g. "Case HDX-… · Submitted Oct 24, 2026 at 14:32:07 UTC". */
  meta?: ReactNode;
  actions?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}

/** Workspace page title row: serif title + meta on the left, actions on the right. */
export function PageHeader({ title, meta, actions, as: Heading = "h1", className }: PageHeaderProps) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        <Heading className="font-serif text-[26px] leading-tight font-semibold text-navy sm:text-[30px]">{title}</Heading>
        {meta ? <p className="mt-1.5 text-sm text-secondary">{meta}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-4" data-print-hide>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
