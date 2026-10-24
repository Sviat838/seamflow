import type { ReactNode } from "react";
import { cx } from "./cx";

export interface SectionHeadingProps {
  /** "§ 1 — Live global feed": uppercase label after a short mustard rule. */
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
  as?: "h1" | "h2";
  /** Paragraph under the title. */
  lead?: ReactNode;
  /** Lead set in a right-hand column (Use cases, Plans). */
  aside?: ReactNode;
  tone?: "light" | "navy";
  /** "page" is a step smaller, for app pages. */
  size?: "section" | "page";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  titleId,
  as: Heading = "h2",
  lead,
  aside,
  tone = "light",
  size = "section",
  className,
}: SectionHeadingProps) {
  const onNavy = tone === "navy";
  const heading = (
    <div className="min-w-0 flex-[1_1_32rem]">
      {eyebrow ? (
        <p
          className={cx(
            "mb-3.5 flex items-center gap-3 text-13 leading-snug font-bold tracking-[0.14em] uppercase",
            onNavy ? "text-mustard" : "text-navy",
          )}
        >
          <span aria-hidden="true" className="inline-block h-[3px] w-7 shrink-0 bg-mustard" />
          {eyebrow}
        </p>
      ) : null}
      <Heading
        id={titleId}
        className={cx(
          "font-serif font-semibold text-balance",
          size === "page" ? "text-[28px] leading-tight sm:text-[34px]" : "text-[30px] leading-[1.15] sm:text-[36px] lg:text-[44px]",
          onNavy ? "text-white" : "text-navy",
        )}
      >
        {title}
      </Heading>
      {lead ? (
        <p className={cx("mt-5 max-w-2xl text-17 leading-relaxed", onNavy ? "text-on-navy-sub" : "text-body")}>{lead}</p>
      ) : null}
    </div>
  );

  if (!aside) return <div className={className}>{heading}</div>;

  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-16 gap-y-5", className)}>
      {heading}
      <p
        className={cx(
          "max-w-[500px] min-w-0 flex-[1_1_22rem] text-17 leading-relaxed sm:text-lg",
          onNavy ? "text-on-navy-sub" : "text-body",
        )}
      >
        {aside}
      </p>
    </div>
  );
}
