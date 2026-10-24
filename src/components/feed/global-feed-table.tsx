import { cx } from "@/components/ui/cx";
import { formatConfidenceValue, formatUtcTime, regionLabel } from "@/components/ui/format";
import { ShieldIcon } from "@/components/ui/icons";
import { VerdictChip } from "@/components/verdict/verdict-chip";
import type { FeedItem } from "@/lib/types";

export const FEED_FOOTNOTE =
  "Anonymised. The feed shows region, verdict and confidence only. Images never leave your workspace.";

/** The privacy line under every feed. */
export function FeedFootnote({ className }: { className?: string }) {
  return (
    <p className={cx("flex items-start gap-2 text-13 leading-normal text-secondary", className)}>
      <ShieldIcon size={16} className="mt-px shrink-0" />
      {FEED_FOOTNOTE}
    </p>
  );
}

const SIZES = {
  card: {
    table: "text-13",
    cell: "px-1.5 py-1.5 first:pl-4 last:pr-4",
    head: "px-1.5 py-2 first:pl-4 last:pr-4 text-xs",
    row: "h-[38px]",
    chip: "sm",
  },
  fullscreen: {
    table: "text-lg",
    cell: "px-3 py-3 first:pl-6 last:pr-6",
    head: "px-3 py-3 first:pl-6 last:pr-6 text-13",
    row: "h-14",
    chip: "lg",
  },
} as const;

export interface GlobalFeedTableProps {
  items: FeedItem[];
  size?: keyof typeof SIZES;
  caption?: string;
  emptyMessage?: string;
  /** The "Anonymised. ..." line under the table. */
  footnote?: boolean;
  className?: string;
}

/** Time UTC · Region · Verdict · Confidence, zebra rows, "This case" highlighted. */
export function GlobalFeedTable({
  items,
  size = "card",
  caption = "Latest verdicts worldwide, newest first",
  emptyMessage = "No verdicts yet today. New verdicts appear here as they are issued.",
  footnote = true,
  className,
}: GlobalFeedTableProps) {
  const s = SIZES[size];
  return (
    <div className={className}>
      {/* Container query: narrow rails and phones abbreviate the Confidence header. */}
      <div className="@container overflow-x-auto">
        <table className={cx("w-full min-w-[19rem] border-collapse text-left", s.table)}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-hairline">
              {["Time UTC", "Region", "Verdict"].map((label) => (
                <th key={label} scope="col" className={cx("font-semibold tracking-[0.06em] whitespace-nowrap text-secondary uppercase", s.head)}>
                  {label}
                </th>
              ))}
              <th scope="col" className={cx("text-right font-semibold tracking-[0.06em] whitespace-nowrap text-secondary uppercase", s.head)}>
                <span className="@max-[23rem]:sr-only">Confidence</span>
                <span aria-hidden="true" className="hidden @max-[23rem]:inline">
                  Conf.
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className={cx("bg-ground text-secondary", s.cell, "py-6")}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              items.map((item, i) => (
                <tr
                  key={item.key}
                  className={cx(
                    "border-b border-hairline last:border-b-0",
                    s.row,
                    item.highlight ? "bg-mustard-tint" : i % 2 === 0 ? "bg-ground" : "bg-white",
                  )}
                >
                  <td className={cx("whitespace-nowrap text-secondary tabular-nums", s.cell)}>
                    <time dateTime={item.time}>{formatUtcTime(item.time)}</time>
                  </td>
                  <td className={cx("font-semibold whitespace-nowrap text-navy", s.cell)}>
                    {item.region ? (
                      <abbr title={regionLabel(item.region)} className="no-underline">
                        {item.region}
                      </abbr>
                    ) : (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Unknown region</span>
                      </>
                    )}
                  </td>
                  <td className={s.cell}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <VerdictChip verdict={item.verdict} size={s.chip} />
                      {item.highlight ? (
                        <span className="inline-flex h-5 items-center rounded-chip border border-navy px-1.5 text-xs font-bold whitespace-nowrap text-navy">
                          This case
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className={cx("text-right font-semibold whitespace-nowrap text-navy tabular-nums", s.cell)}>
                    {formatConfidenceValue(item.confidence)}
                    <span className="sr-only">%</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footnote ? <FeedFootnote className="mt-3" /> : null}
    </div>
  );
}
