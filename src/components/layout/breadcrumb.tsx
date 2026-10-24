import Link from "next/link";
import { cx } from "@/components/ui/cx";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** "Classify / Results / HDX-2026-1024-7731"; the last item is the current page. */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cx("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-2">
              {last || !item.href ? (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cx("truncate tabular-nums", last ? "font-bold text-navy" : "text-body")}
                >
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="inline-flex min-h-11 items-center text-body hover:text-navy hover:underline lg:min-h-0">
                  {item.label}
                </Link>
              )}
              {last ? null : (
                <span aria-hidden="true" className="text-secondary">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
