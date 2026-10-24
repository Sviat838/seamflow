import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type CardTag = "section" | "div" | "article" | "li" | "aside";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardTag;
  /** Section ground or navy instead of white. Use this rather than a bg-* class: cx() doesn't merge conflicting classes. */
  tone?: "white" | "ground" | "navy";
}

const TONE_CLASSES = {
  white: "border-hairline bg-white",
  ground: "border-hairline bg-ground",
  navy: "border-navy bg-navy text-white",
} as const;

/** Panel with a 1 px border and 6 px radius. */
export function Card({ as: Tag = "section", tone = "white", className, ...props }: CardProps) {
  return (
    <Tag
      data-tone={tone === "navy" ? "navy" : undefined}
      {...props}
      className={cx("overflow-hidden rounded-card border", TONE_CLASSES[tone], className)}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  titleId?: string;
  as?: "h2" | "h3";
  /** Small secondary text next to (or under) the title, e.g. "Immutable · SHA-256 chained". */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, titleId, as: Heading = "h2", meta, actions, className }: CardHeaderProps) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-5 py-4 sm:px-6 sm:py-5",
        className,
      )}
    >
      <Heading id={titleId} className="font-serif text-[22px] leading-snug font-semibold text-navy">
        {title}
      </Heading>
      {meta ? <p className="text-13 text-secondary">{meta}</p> : null}
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("p-5 sm:p-6", className)} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("border-t border-hairline px-5 py-4 sm:px-6", className)} />;
}
