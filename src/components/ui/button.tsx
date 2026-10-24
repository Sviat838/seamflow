import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "navy" | "quiet" | "ghost" | "link" | "onNavy";
export type ButtonSize = "md" | "lg";

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  /** Square 44/52 px button holding only an icon; give it an aria-label. */
  iconOnly?: boolean;
}

interface ContentProps {
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Shows a spinner and disables the control (aria-busy). */
  pending?: boolean;
  children?: ReactNode;
}

type NativeButtonProps = StyleProps &
  ContentProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { href?: undefined; external?: undefined };

type LinkButtonProps = StyleProps &
  ContentProps &
  Omit<ComponentProps<typeof Link>, "children" | "href"> & { href: string; external?: false };

/** Plain <a> for downloads, API URLs and other non-route links. */
type ExternalButtonProps = StyleProps &
  ContentProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & { href: string; external: true };

export type ButtonProps = NativeButtonProps | LinkButtonProps | ExternalButtonProps;

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-card font-bold leading-tight no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-[1.5px] border-mustard bg-mustard text-navy hover:border-mustard-strong hover:bg-mustard-strong",
  secondary: "border border-navy bg-white text-navy hover:bg-ground",
  navy: "border border-navy bg-navy text-white hover:border-navy-raised-2 hover:bg-navy-raised-2",
  quiet: "border border-hairline bg-white text-navy hover:border-field hover:bg-ground",
  ghost: "border border-transparent bg-transparent text-navy hover:bg-ground",
  link: "text-navy underline decoration-1 underline-offset-4 hover:text-navy-hover hover:decoration-2",
  onNavy: "border-[1.5px] border-white bg-transparent text-white hover:bg-white/10",
};

const SIZES: Record<ButtonSize, { box: string; square: string }> = {
  md: { box: "min-h-11 px-[18px] text-15", square: "size-11 text-15" },
  lg: { box: "min-h-13 px-6 text-17", square: "size-13 text-17" },
};

/** Class string for elements styled as buttons, e.g. a <label htmlFor> on a file input. */
export function buttonClasses({ variant = "primary", size = "md", block, iconOnly }: StyleProps = {}): string {
  const sizing = variant === "link" ? (size === "lg" ? "min-h-11 text-17" : "min-h-11 text-15") : iconOnly ? SIZES[size].square : SIZES[size].box;
  return cx(BASE, VARIANTS[variant], sizing, block && "w-full");
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
    />
  );
}

function Content({ icon, iconRight, pending, children }: ContentProps) {
  return (
    <>
      {pending ? <Spinner /> : icon}
      {children}
      {iconRight}
    </>
  );
}

/**
 * The HDX button. Renders a <button>, a Next <Link> (with `href`) or a plain <a>
 * (with `href` and `external`). See docs/design/COMPONENTS.md for variants.
 */
export function Button(props: ButtonProps) {
  const { variant, size, block, iconOnly, icon, iconRight, pending, children, className, external, ...rest } = props;
  const classes = cx(buttonClasses({ variant, size, block, iconOnly }), className);
  const content = (
    <Content icon={icon} iconRight={iconRight} pending={pending}>
      {children}
    </Content>
  );

  if (typeof rest.href === "string") {
    const busy = pending || undefined;
    if (external) {
      const anchor = rest as Omit<ExternalButtonProps, keyof StyleProps | keyof ContentProps | "className" | "external">;
      return (
        <a {...anchor} className={classes} aria-disabled={busy} aria-busy={busy}>
          {content}
        </a>
      );
    }
    const link = rest as Omit<LinkButtonProps, keyof StyleProps | keyof ContentProps | "className" | "external">;
    return (
      <Link {...link} className={classes} aria-disabled={busy} aria-busy={busy}>
        {content}
      </Link>
    );
  }

  const { type = "button", disabled, ...button } = rest as Omit<
    NativeButtonProps,
    keyof StyleProps | keyof ContentProps | "className" | "external" | "href"
  >;
  return (
    <button {...button} type={type} disabled={disabled || pending} aria-busy={pending || undefined} className={classes}>
      {content}
    </button>
  );
}
