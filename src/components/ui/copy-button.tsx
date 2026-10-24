"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { CheckIcon, LinkIcon } from "./icons";

export interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  /** Icon shown before copying; defaults to a link icon. Pass null for none. */
  icon?: ReactNode;
}

type CopyState = "idle" | "copied" | "failed";

/** Copies `text` to the clipboard and announces the result politely. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "secondary",
  size,
  block,
  className,
  icon = <LinkIcon size={18} />,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let next: CopyState = "copied";
    try {
      // Clipboard API needs a secure context; it rejects on http:// LAN hosts and in some webviews.
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        block={block}
        className={className}
        icon={state === "copied" ? <CheckIcon size={18} /> : icon}
        onClick={copy}
      >
        {state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? copiedLabel : state === "failed" ? "Copy failed. Select the text and copy it manually." : ""}
      </span>
    </>
  );
}
