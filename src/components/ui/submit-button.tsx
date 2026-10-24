"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

export interface SubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Label while the parent form is submitting, e.g. "Saving…". */
  pendingLabel?: string;
  /** Force the pending state (e.g. from useActionState) in addition to the form status. */
  pending?: boolean;
  children: ReactNode;
}

/** Submit button that shows the pending state while its parent <form action> runs. */
export function SubmitButton({ pendingLabel, pending, children, ...props }: SubmitButtonProps) {
  const status = useFormStatus();
  const busy = pending || status.pending;
  return (
    <Button {...props} type="submit" pending={busy}>
      {busy && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
