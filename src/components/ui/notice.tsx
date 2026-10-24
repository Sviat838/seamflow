import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { AlertIcon, CheckCircleIcon, InfoIcon } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "error";

const ICONS: Record<NoticeTone, ReactNode> = {
  info: <InfoIcon size={20} className="text-navy" />,
  success: <CheckCircleIcon size={20} className="text-status-green" />,
  warning: <AlertIcon size={20} className="text-navy" />,
  error: <AlertIcon size={20} className="text-danger" />,
};

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: NoticeTone;
  title?: ReactNode;
  action?: ReactNode;
}

/** Inline message box. Add role="alert" yourself when it appears in response to an action. */
export function Notice({ tone = "info", title, action, className, children, ...props }: NoticeProps) {
  return (
    <div
      {...props}
      className={cx(
        "flex flex-wrap items-start gap-x-3 gap-y-3 rounded-card border p-4",
        tone === "warning" ? "border-mustard bg-mustard-tint" : "border-hairline bg-ground",
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{ICONS[tone]}</span>
      <div className="min-w-0 flex-[1_1_14rem] text-15 text-body">
        {title ? <p className="font-bold text-navy">{title}</p> : null}
        {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
