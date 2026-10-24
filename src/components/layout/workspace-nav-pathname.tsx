"use client";

import { usePathname } from "next/navigation";
import { WorkspaceNavList } from "./workspace-nav-list";
import { activeNavKey, type WorkspaceNavItem } from "./workspace-nav-model";

/** Highlights the current page from the URL. usePathname can suspend: render inside <Suspense>. */
export function WorkspaceNavFromPathname({ items }: { items: WorkspaceNavItem[] }) {
  const pathname = usePathname();
  return <WorkspaceNavList items={items} active={activeNavKey(pathname)} />;
}
