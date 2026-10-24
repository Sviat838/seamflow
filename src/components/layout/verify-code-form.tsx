"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { fieldAria, Input } from "@/components/ui/form";
import { AlertIcon, QrIcon } from "@/components/ui/icons";
import { normalizeVerificationCode } from "./verification-code";

export interface VerifyCodeFormProps {
  id?: string;
  tone?: "light" | "navy";
  autoFocus?: boolean;
  className?: string;
  /** Called right before navigating, e.g. to close the surrounding popover or menu. */
  onNavigate?: () => void;
}

const HINT = "Printed under the QR code on the label or certificate.";
const INVALID = "Check the code: 8 letters and digits, like 7KQ2-M9XD. Codes never use 0, 1, I, L, O or U.";

/** Code input that opens the public record at /v/{CODE}. */
export function VerifyCodeForm({ id = "verify-code", tone = "light", autoFocus, className, onNavigate }: VerifyCodeFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const onNavy = tone === "navy";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normalizeVerificationCode(String(new FormData(event.currentTarget).get("code") ?? ""));
    if (!code) {
      setError(INVALID);
      return;
    }
    setError(null);
    onNavigate?.();
    startTransition(() => router.push(`/v/${code}`));
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cx("text-15 font-bold", onNavy ? "text-white" : "text-navy")}>
        Verification code
      </label>
      <div className="flex gap-2">
        <Input
          {...fieldAria(id, { hint: HINT, error })}
          name="code"
          placeholder="7KQ2-M9XD"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={64}
          className="min-w-0 flex-1 font-mono tracking-[0.06em] uppercase placeholder:normal-case"
        />
        <Button type="submit" variant={onNavy ? "primary" : "navy"} pending={pending} icon={<QrIcon size={18} />}>
          Verify
        </Button>
      </div>
      <p id={`${id}-hint`} className={cx("text-sm", onNavy ? "text-on-navy-secondary" : "text-secondary")}>
        {HINT}
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className={cx("flex items-start gap-1.5 text-sm font-semibold", onNavy ? "text-mustard" : "text-danger")}>
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}

/** "Verify a certificate" link-style button that opens the code form in a native popover. */
export function VerifyPopover({ className }: { className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const popoverId = "verify-popover";

  // Native popovers don't move focus; put it in the field when the panel opens.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") el.querySelector("input")?.focus();
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  return (
    <>
      <button
        type="button"
        popoverTarget={popoverId}
        className={cx("inline-flex min-h-11 cursor-pointer items-center text-body hover:text-navy hover:underline", className)}
      >
        Verify a certificate
      </button>
      <div
        ref={panel}
        id={popoverId}
        popover="auto"
        aria-label="Verify a certificate"
        className="fixed inset-auto top-12 right-4 m-0 w-[22rem] max-w-[calc(100vw-2rem)] rounded-card border border-hairline bg-white p-4 text-body shadow-[0_16px_32px_rgb(11_31_58/0.18)]"
      >
        <VerifyCodeForm id="verify-code-header" onNavigate={() => panel.current?.hidePopover()} />
      </div>
    </>
  );
}
