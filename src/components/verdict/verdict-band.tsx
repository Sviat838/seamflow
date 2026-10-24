import { type ReactNode, useId } from "react";
import { cx } from "@/components/ui/cx";
import { verdictLabel } from "@/components/ui/format";
import { CheckIcon, ClockIcon, ScaleIcon } from "@/components/ui/icons";
import { Stat } from "@/components/ui/stat";
import type { ReviewStatus, Verdict } from "@/lib/types";
import { ClauseLink } from "./clause-link";
import { verdictStatusLabel } from "./status";

export interface VerdictBandProps {
  verdict: Verdict;
  /** Clause id that decided the verdict, e.g. "2.1". */
  policyClause: string;
  /** null = "Final · Subject to appeal". */
  reviewStatus?: ReviewStatus | null;
  /** Replaces the default linked clause line. */
  clauseLine?: ReactNode;
  headingId?: string;
  headingLevel?: "h1" | "h2";
  /** Wrap in a polite live region so the verdict is announced when it appears. */
  live?: boolean;
  /** compact = the full-bleed phone band from Final-Mobile. */
  size?: "default" | "compact";
  /** Left column, e.g. the submitted image figure. */
  media?: ReactNode;
  /** Under the clause line, usually <VerdictStats>. */
  children?: ReactNode;
  className?: string;
}

function StatusIcon({ status }: { status: ReviewStatus | null | undefined }) {
  if (status === "pending") return <ClockIcon size={14} strokeWidth={2.5} />;
  if (status === "overturned") return <ScaleIcon size={14} strokeWidth={2.5} />;
  return <CheckIcon size={14} strokeWidth={2.5} />;
}

/** The big HOT DOG / NOT HOT DOG band. */
export function VerdictBand({
  verdict,
  policyClause,
  reviewStatus,
  clauseLine,
  headingId,
  headingLevel: Heading = "h2",
  live,
  size = "default",
  media,
  children,
  className,
}: VerdictBandProps) {
  const generatedId = useId();
  const titleId = headingId ?? `verdict-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hot = verdict === "hot_dog";
  const compact = size === "compact";
  const line = clauseLine ?? <ClauseLink clause={policyClause} />;

  const band = (
    <section
      aria-labelledby={titleId}
      data-tone={hot ? "light" : "navy"}
      className={cx(
        hot ? "bg-mustard text-navy" : "bg-navy text-white",
        compact ? "px-4 py-3.5" : "flex flex-wrap items-center gap-x-8 gap-y-6 rounded-card p-5 sm:p-6",
        className,
      )}
    >
      {media && !compact ? <div className="min-w-0 flex-[0_1_212px]">{media}</div> : null}
      <div className={compact ? undefined : "min-w-0 flex-[1_1_20rem]"}>
        <div className={cx("flex flex-wrap items-center", compact ? "justify-between gap-2" : "gap-x-3.5 gap-y-2.5")}>
          <p
            className={cx(
              "font-bold tracking-[0.14em] uppercase",
              compact ? "text-xs" : "text-13",
              hot ? "text-navy" : "text-on-navy-secondary",
            )}
          >
            Verdict
          </p>
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-chip px-2 font-bold uppercase",
              compact ? "h-5 border-[1.5px] text-xs tracking-[0.12em]" : "h-[26px] border-2 text-xs tracking-[0.1em]",
              hot ? "border-navy text-navy" : "border-white text-white",
            )}
          >
            {compact ? null : <StatusIcon status={reviewStatus} />}
            {verdictStatusLabel(reviewStatus, { compact })}
          </span>
        </div>
        <Heading
          id={titleId}
          className={cx(
            "font-serif leading-none font-semibold tracking-[0.01em]",
            compact ? "mt-1 text-[40px] min-[380px]:text-[44px]" : "mt-2.5 text-[40px] sm:text-[48px] xl:text-[56px]",
          )}
        >
          {verdictLabel(verdict)}
        </Heading>
        <p
          className={cx(
            compact ? "mt-1 text-sm leading-5" : "mt-3 text-base leading-normal",
            hot ? "text-navy" : "text-on-navy-sub",
          )}
        >
          {line}
        </p>
        {children ? <div className={compact ? "mt-3" : "mt-[18px]"}>{children}</div> : null}
      </div>
    </section>
  );

  if (!live) return band;
  return (
    <div aria-live="polite" aria-atomic="true">
      {band}
    </div>
  );
}

export interface VerdictStatsProps {
  verdict: Verdict;
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
}

/** Stat grid inside the band: 2 px top rule, uppercase label, 28 px serif value. */
export function VerdictStats({ verdict, items, className }: VerdictStatsProps) {
  const tone = verdict === "hot_dog" ? "hot" : "navy";
  return (
    <dl className={cx("grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-x-5 gap-y-3", className)}>
      {items.map((item) => (
        <Stat key={item.label} label={item.label} value={item.value} size="md" rule="top" tone={tone} />
      ))}
    </dl>
  );
}
