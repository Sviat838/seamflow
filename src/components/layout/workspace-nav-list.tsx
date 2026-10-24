import Link from "next/link";
import type { ComponentType } from "react";
import { BusinessTag } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import {
  CertificateIcon,
  HistoryIcon,
  type IconProps,
  KeyIcon,
  LayersIcon,
  ListIcon,
  LockIcon,
  ScanIcon,
  SlidersIcon,
} from "@/components/ui/icons";
import type { WorkspaceNavIcon, WorkspaceNavItem, WorkspaceNavKey } from "./workspace-nav-model";

const ICONS: Record<WorkspaceNavIcon, ComponentType<IconProps>> = {
  classify: ScanIcon,
  cases: HistoryIcon,
  certificates: CertificateIcon,
  audit: ListIcon,
  settings: SlidersIcon,
  batch: LayersIcon,
  "api-keys": KeyIcon,
};

/** Sidebar links (presentational; shared by the server shell and the pathname-aware client nav). */
export function WorkspaceNavList({ items, active }: { items: WorkspaceNavItem[]; active: WorkspaceNavKey | null }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const current = item.lock === null && item.key === active;
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-card px-3 text-15 no-underline",
                current ? "bg-navy-raised-2 font-bold text-white" : "font-semibold text-on-navy-sub hover:bg-navy-raised hover:text-white",
              )}
            >
              <Icon size={20} className={current ? "text-mustard" : undefined} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.lock === "business" ? <BusinessTag tone="navy" /> : null}
              {item.lock === "sign-in" ? (
                <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-navy-border px-2 text-xs font-bold whitespace-nowrap text-white">
                  <LockIcon size={12} strokeWidth={2.25} />
                  Sign in
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
