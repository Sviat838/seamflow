import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { formatClause } from "@/lib/policy";
import { clauseHref } from "./clause";

export interface ClauseLinkProps {
  /** Clause id, e.g. "2.1". */
  clause: string;
  /** full: "Hot Dog Definition Policy v3.2, §2.1 — Canonical form"; short: "v3.2, §2.1 — Canonical form"; ref: "§2.1". */
  format?: "full" | "short" | "ref";
  children?: ReactNode;
  className?: string;
}

/** Link to the clause on the public policy page. Inherits the surrounding text colour. */
export function ClauseLink({ clause, format = "full", children, className }: ClauseLinkProps) {
  const text = format === "ref" ? `§${clause}` : formatClause(clause, { short: format === "short" });
  return (
    <Link
      href={clauseHref(clause)}
      className={cx("underline decoration-1 underline-offset-[3px] hover:decoration-2", className)}
    >
      {children ?? text}
    </Link>
  );
}
