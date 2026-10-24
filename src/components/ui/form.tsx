import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";
import { AlertIcon, ChevronDownIcon } from "./icons";

export interface FieldAria {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/** Wires a control to its hint and error ids. */
export function fieldAria(id: string, opts: { hint?: ReactNode; error?: ReactNode } = {}): FieldAria {
  const describedBy = [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean).join(" ");
  return {
    id,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(opts.error ? { "aria-invalid": true as const } : {}),
  };
}

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  optional?: boolean;
}

export function Label({ optional, className, children, ...props }: LabelProps) {
  return (
    <label {...props} className={cx("block text-15 font-bold text-navy", className)}>
      {children}
      {optional ? <span className="ml-1 font-normal text-secondary">(optional)</span> : null}
    </label>
  );
}

const CONTROL =
  "block w-full rounded-card border border-field bg-white px-3 text-base text-navy placeholder:text-secondary disabled:cursor-not-allowed disabled:bg-ground aria-invalid:border-danger aria-invalid:border-2";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, "min-h-11", className)} />;
}

export function Textarea({ className, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={rows} className={cx(CONTROL, "min-h-24 py-2.5 leading-normal", className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cx(CONTROL, "min-h-11 appearance-none pr-10", className)}>
        {children}
      </select>
      <ChevronDownIcon size={18} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-navy" />
    </div>
  );
}

export function FieldHint({ id, className, children }: { id: string; className?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className={cx("text-sm text-secondary", className)}>
      {children}
    </p>
  );
}

export function FieldError({ id, className, children }: { id: string; className?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className={cx("flex items-start gap-1.5 text-sm font-semibold text-danger", className)}>
      <AlertIcon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (aria: FieldAria) => ReactNode;
}

/** Label + control + hint + error, with aria-describedby / aria-invalid wired up. */
export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      {children(fieldAria(id, { hint, error }))}
      <FieldHint id={`${id}-hint`}>{hint}</FieldHint>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
