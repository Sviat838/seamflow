// Pure model for the workspace sidebar, shared by the server shell and the client nav.

import type { Viewer } from "@/lib/types";

export type WorkspaceNavKey = "classify" | "cases" | "certificates" | "audit" | "settings";
export type WorkspaceNavIcon = WorkspaceNavKey | "batch" | "api-keys";

export interface WorkspaceNavItem {
  key: WorkspaceNavIcon;
  label: string;
  href: string;
  /** "sign-in": needs a signed-in company member; "business": a Business-plan feature (links to sales). */
  lock: "sign-in" | "business" | null;
}

const PRIMARY: Array<{ key: WorkspaceNavKey; label: string; href: string; companyOnly: boolean }> = [
  { key: "classify", label: "Classify", href: "/classify", companyOnly: false },
  { key: "cases", label: "History", href: "/cases", companyOnly: false },
  { key: "certificates", label: "Certificates", href: "/certificates", companyOnly: true },
  { key: "audit", label: "Audit log", href: "/audit", companyOnly: true },
  { key: "settings", label: "Settings", href: "/settings", companyOnly: true },
];

export const BUSINESS_CONTACT_HREF = "/contact?source=workspace";

/** Sidebar items for this viewer. Anonymous visitors see company-only pages as "Sign in" links. */
export function workspaceNavItems(viewer: Pick<Viewer, "isAuthenticated">): WorkspaceNavItem[] {
  const items: WorkspaceNavItem[] = PRIMARY.map(({ key, label, href, companyOnly }) =>
    companyOnly && !viewer.isAuthenticated
      ? { key, label, href: `/sign-in?next=${encodeURIComponent(href)}`, lock: "sign-in" }
      : { key, label, href, lock: null },
  );
  // Batch jobs and API keys aren't self-serve: they're sold with the Business plan.
  items.push(
    { key: "batch", label: "Batch jobs", href: BUSINESS_CONTACT_HREF, lock: "business" },
    { key: "api-keys", label: "API keys", href: BUSINESS_CONTACT_HREF, lock: "business" },
  );
  return items;
}

/** Which nav item a pathname belongs to. */
export function activeNavKey(pathname: string | null | undefined): WorkspaceNavKey | null {
  if (!pathname) return null;
  const segment = pathname.split("/")[1] ?? "";
  switch (segment) {
    case "classify":
      return "classify";
    case "cases":
      return "cases";
    case "certificates":
    case "labels":
      return "certificates";
    case "audit":
      return "audit";
    case "settings":
      return "settings";
    default:
      return null;
  }
}

/** "Quality Lead · Owner", "Member", or "Company not set up". */
export function viewerRoleLine(viewer: Pick<Viewer, "jobTitle" | "company" | "needsOnboarding">): string {
  if (!viewer.company) return viewer.needsOnboarding ? "Company not set up" : viewer.jobTitle ?? "";
  const role = viewer.company.role === "owner" ? "Owner" : "Member";
  return viewer.jobTitle ? `${viewer.jobTitle} · ${role}` : role;
}
