import type { ElementType, HTMLAttributes } from "react";

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

/** Content for screen readers only. */
export function VisuallyHidden({ as: Tag = "span", className, ...props }: VisuallyHiddenProps) {
  return <Tag {...props} className={className ? `sr-only ${className}` : "sr-only"} />;
}
