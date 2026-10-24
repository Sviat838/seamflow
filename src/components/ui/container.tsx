import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "header" | "footer" | "nav" | "main" | "article";
  /** "page" = 1200 px (default), "narrow" = 760 px for forms and long text. */
  size?: "page" | "narrow";
}

/** Centred content column with 16 px phone gutters (24 px from sm). */
export function Container({ as: Tag = "div", size = "page", className, ...props }: ContainerProps) {
  return (
    <Tag
      {...props}
      className={cx("mx-auto w-full px-4 sm:px-6", size === "narrow" ? "max-w-narrow" : "max-w-page", className)}
    />
  );
}
