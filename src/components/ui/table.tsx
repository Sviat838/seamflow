import type { CSSProperties, HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "./cx";

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Every table needs a caption; hide it visually when a heading already says the same. */
  caption: ReactNode;
  captionHidden?: boolean;
  /** Width below which the table scrolls sideways (CSS length). */
  minWidth?: string;
  wrapperClassName?: string;
}

/** Data table with a horizontal-scroll wrapper. Pair with THead / TBody / Tr / Th / Td. */
export function Table({ caption, captionHidden, minWidth = "36rem", wrapperClassName, className, children, ...props }: TableProps) {
  return (
    <div className={cx("overflow-x-auto", wrapperClassName)}>
      <table {...props} style={{ minWidth }} className={cx("w-full border-collapse text-left text-sm", className)}>
        <caption className={captionHidden ? "sr-only" : "px-5 pt-4 pb-2 text-left text-13 text-secondary"}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={cx("border-b border-hairline", className)} />;
}

/** Zebra rows: odd rows on ground, even rows white, hairline separators. */
export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      {...props}
      className={cx(
        "[&>tr]:border-b [&>tr]:border-hairline [&>tr:last-child]:border-b-0 [&>tr:nth-child(odd):not([data-highlight])]:bg-ground [&>tr:nth-child(even):not([data-highlight])]:bg-white",
        className,
      )}
    />
  );
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Mustard tint, e.g. "This case". */
  highlight?: boolean;
}

export function Tr({ highlight, className, ...props }: TrProps) {
  return <tr {...props} data-highlight={highlight || undefined} className={cx(highlight && "bg-mustard-tint", className)} />;
}

type Align = "left" | "right" | "center";
const ALIGN: Record<Align, string> = { left: "text-left", right: "text-right", center: "text-center" };

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function Th({ align = "left", scope = "col", className, ...props }: ThProps) {
  return (
    <th
      {...props}
      scope={scope}
      className={cx(
        "px-4 py-2.5 text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-secondary uppercase first:pl-5 last:pr-5",
        ALIGN[align],
        className,
      )}
    />
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
  /** Tabular numerals. */
  numeric?: boolean;
  mono?: boolean;
  /** Navy, semibold. */
  strong?: boolean;
}

export function Td({ align = "left", numeric, mono, strong, className, ...props }: TdProps) {
  return (
    <td
      {...props}
      className={cx(
        "px-4 py-2.5 align-middle first:pl-5 last:pr-5",
        ALIGN[align],
        numeric && "tabular-nums",
        mono && "font-mono text-13",
        strong ? "font-semibold text-navy" : "text-body",
        className,
      )}
    />
  );
}

export interface KeyValueListProps {
  rows: Array<{ label: ReactNode; value: ReactNode }>;
  /** Label column width on wide screens (CSS length). */
  labelWidth?: string;
  className?: string;
}

/** Zebra label/value list (the Classification report). */
export function KeyValueList({ rows, labelWidth = "196px", className }: KeyValueListProps) {
  return (
    <dl className={className}>
      {rows.map((row, i) => (
        <div key={i} className={cx("flex flex-wrap gap-x-6 gap-y-0.5 px-5 py-2.5 sm:px-6", i % 2 === 0 ? "bg-ground" : "bg-white")}>
          <dt className="shrink-0 grow-0 basis-full text-sm font-semibold text-secondary sm:basis-(--kv-label)" style={{ "--kv-label": labelWidth } as CSSProperties}>
            {row.label}
          </dt>
          <dd className="min-w-0 flex-[1_1_16rem] text-15 break-words text-navy tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
