import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { HdxMark } from "./hdx-mark";

export interface WordmarkProps {
  /** The surface it sits on. */
  tone?: "light" | "navy";
  /** sm = phone bar, md = sidebar/footer, lg = landing nav. */
  size?: "sm" | "md" | "lg";
  /** Defaults: lg = stacked, md = line, sm = none. */
  descriptor?: "stacked" | "line" | "none";
  /** Link target (default "/"); null renders no link. */
  href?: string | null;
  className?: string;
}

const SIZES = {
  sm: { mark: 28, text: "text-[21px]" },
  md: { mark: 32, text: "text-[22px]" },
  lg: { mark: 36, text: "text-[26px]" },
} as const;

/** HDX mark + wordmark + "Hot Dog or Not · Enterprise Cloud". */
export function Wordmark({ tone = "light", size = "lg", descriptor, href = "/", className }: WordmarkProps) {
  const onNavy = tone === "navy";
  const kind = descriptor ?? (size === "lg" ? "stacked" : size === "md" ? "line" : "none");
  const s = SIZES[size];

  const body = (
    <>
      <HdxMark size={s.mark} framed={onNavy} className="shrink-0" />
      {kind === "line" ? (
        <span className="flex min-w-0 flex-col leading-[1.15]">
          <span className={cx("font-serif font-semibold tracking-[0.04em]", s.text, onNavy ? "text-white" : "text-navy")}>HDX</span>
          <span className={cx("text-xs", onNavy ? "text-on-navy-muted" : "text-secondary")}>Hot Dog or Not · Enterprise Cloud</span>
        </span>
      ) : (
        <span className={cx("font-serif leading-none font-semibold tracking-[0.04em]", s.text, onNavy ? "text-white" : "text-navy")}>
          HDX
        </span>
      )}
      {kind === "stacked" ? (
        <>
          <span aria-hidden="true" className={cx("inline-block h-8 w-px shrink-0", onNavy ? "bg-navy-border" : "bg-hairline")} />
          <span className="flex flex-col text-13 leading-tight">
            <span className={cx("font-bold", onNavy ? "text-white" : "text-navy")}>Hot Dog or Not</span>
            <span className={onNavy ? "text-on-navy-secondary" : "text-secondary"}>Enterprise Cloud</span>
          </span>
        </>
      ) : null}
    </>
  );

  const classes = cx(
    "inline-flex min-h-11 items-center no-underline",
    kind === "line" ? "gap-2.5" : "gap-3",
    className,
  );

  if (href === null) return <span className={classes}>{body}</span>;
  return (
    <Link href={href} className={classes} aria-label="HDX home">
      {body}
    </Link>
  );
}
