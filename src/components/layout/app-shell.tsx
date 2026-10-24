import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { Wordmark } from "@/components/brand/wordmark";
import { Button, buttonClasses } from "@/components/ui/button";
import { formatCount, initials, regionLabel, usageRatio } from "@/components/ui/format";
import { GlobeIcon, HistoryIcon, LogOutIcon } from "@/components/ui/icons";
import { POLICY_NAME, POLICY_VERSION } from "@/lib/policy";
import { FREE_CLASSIFICATION_LIMIT, type Usage, type Viewer } from "@/lib/types";
import { AppDrawer } from "./app-drawer";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";
import { WorkspaceNavList } from "./workspace-nav-list";
import { viewerRoleLine, type WorkspaceNavKey, workspaceNavItems } from "./workspace-nav-model";
import { WorkspaceNavFromPathname } from "./workspace-nav-pathname";

export interface AppShellProps {
  viewer: Viewer;
  usage: Usage;
  /** Highlighted nav item. Omit to derive it from the URL on the client. */
  active?: WorkspaceNavKey;
  breadcrumb?: BreadcrumbItem[];
  /** REGION_CODES value shown in the top bar; omit when unknown. */
  region?: string | null;
  children: ReactNode;
}

function WorkspaceBlock({ viewer }: { viewer: Viewer }) {
  const name = viewer.company?.name ?? (viewer.isAuthenticated ? "No company yet" : "Guest session");
  return (
    <div className="rounded-card border border-navy-border bg-navy-raised px-3 py-2.5 leading-snug">
      <p className="text-xs text-on-navy-muted">Workspace</p>
      <p className="truncate text-sm font-bold text-white">{name}</p>
      {viewer.needsOnboarding ? (
        <Link href="/onboarding" className="mt-1 inline-flex min-h-8 items-center text-13 font-bold text-mustard underline underline-offset-2">
          Finish company setup
        </Link>
      ) : null}
    </div>
  );
}

function UsageCard({ viewer, usage }: { viewer: Viewer; usage: Usage }) {
  const unlimited = usage.limit == null;
  const limit = usage.limit ?? FREE_CLASSIFICATION_LIMIT;
  const heading = unlimited ? "Usage · Business plan" : viewer.isAuthenticated ? "Usage · Free plan" : "Usage · Free";
  return (
    <div className="border-t border-navy-border px-3 pt-4">
      <p className="text-xs font-bold tracking-[0.1em] text-on-navy-muted uppercase">{heading}</p>
      {unlimited ? (
        <>
          <p className="mt-2 text-sm text-white">Business plan · unlimited</p>
          <p className="mt-2 text-xs text-on-navy-muted">{formatCount(usage.used)} classifications so far</p>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-white">
            {viewer.isAuthenticated ? (
              <>
                <strong className="font-bold">{formatCount(usage.used)}</strong> of {formatCount(limit)} classifications used
              </>
            ) : (
              <>
                Free · <strong className="font-bold">{formatCount(usage.used)}</strong> of {formatCount(limit)} used
              </>
            )}
          </p>
          <div aria-hidden="true" className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-navy-border">
            <div className="h-1.5 bg-mustard" style={{ width: `${Math.round(usageRatio(usage) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-on-navy-muted">
            {limit} in total, not per month.{" "}
            <Link href="/contact?source=usage" className="font-bold text-white underline underline-offset-2">
              Business plan
            </Link>
          </p>
          {viewer.isAuthenticated ? null : (
            <Button href="/sign-in?next=%2Fclassify" block className="mt-3">
              Sign in
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function UserCard({ viewer }: { viewer: Viewer }) {
  if (!viewer.isAuthenticated) {
    return (
      <div className="flex items-center gap-2.5 border-t border-navy-border px-3 pt-4 pb-1">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-on-navy-muted text-sm font-bold text-white"
        >
          ?
        </span>
        <span className="flex min-w-0 flex-col leading-snug">
          <span className="text-sm font-bold text-white">Guest</span>
          <span className="text-xs text-on-navy-muted">Not signed in · history kept in this browser</span>
        </span>
      </div>
    );
  }
  const name = viewer.displayName ?? viewer.email ?? "Signed in";
  const role = viewerRoleLine(viewer);
  return (
    <div className="flex items-center gap-2.5 border-t border-navy-border px-3 pt-4 pb-1">
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-mustard text-sm font-bold text-navy"
      >
        {initials(viewer.displayName, viewer.email)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate text-sm font-bold text-white">{name}</span>
        {role ? <span className="truncate text-xs text-on-navy-muted">{role}</span> : null}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-card text-on-navy-sub hover:bg-navy-raised hover:text-white"
        >
          <LogOutIcon size={20} />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}

function SidebarContent({ viewer, usage, active }: Pick<AppShellProps, "viewer" | "usage" | "active">) {
  const items = workspaceNavItems(viewer);
  return (
    <>
      <Wordmark tone="navy" size="md" descriptor="line" className="px-2" />
      <WorkspaceBlock viewer={viewer} />
      <nav aria-label="Workspace">
        {active !== undefined ? (
          <WorkspaceNavList items={items} active={active} />
        ) : (
          <Suspense fallback={<WorkspaceNavList items={items} active={null} />}>
            <WorkspaceNavFromPathname items={items} />
          </Suspense>
        )}
      </nav>
      <div className="mt-auto flex flex-col gap-4">
        <UsageCard viewer={viewer} usage={usage} />
        <UserCard viewer={viewer} />
      </div>
    </>
  );
}

/**
 * Workspace frame from Final-Verdict: navy sidebar on desktop, top bar + drawer on phones.
 * Takes plain props and fetches nothing; renders <main id="main">.
 */
export function AppShell({ viewer, usage, active, breadcrumb, region, children }: AppShellProps) {
  const hasTopBar = Boolean(breadcrumb?.length || region);
  return (
    <div className="flex min-h-dvh bg-ground">
      <aside aria-label="Workspace sidebar" data-tone="navy" data-print-hide className="hidden w-62 shrink-0 bg-navy lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-5 overflow-y-auto px-4 py-5 text-on-navy-sub">
          <SidebarContent viewer={viewer} usage={usage} active={active} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-print-hide
          className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-white pr-1.5 pl-4 lg:hidden"
        >
          <Wordmark size="sm" />
          <div className="flex items-center gap-0.5">
            <Link href="/cases" aria-label="History" className={buttonClasses({ variant: "ghost", iconOnly: true })}>
              <HistoryIcon size={22} />
            </Link>
            <AppDrawer>
              <SidebarContent viewer={viewer} usage={usage} active={active} />
            </AppDrawer>
          </div>
        </header>

        {hasTopBar ? (
          <div
            data-print-hide
            className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline bg-white px-4 py-2 sm:px-6 lg:min-h-16 lg:px-8"
          >
            {breadcrumb?.length ? <Breadcrumb items={breadcrumb} /> : <span />}
            {region ? (
              <span
                className="inline-flex h-7 items-center gap-1.5 rounded-chip border border-hairline px-2.5 text-xs font-bold text-body"
                title="Processing region"
              >
                <GlobeIcon size={14} strokeWidth={2} />
                <span className="sr-only">Processing region:</span>
                {regionLabel(region)}
              </span>
            ) : null}
          </div>
        ) : null}

        <main id="main" className="flex flex-1 flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-7">
          {children}
        </main>

        <footer
          data-print-hide
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-hairline bg-white px-4 py-4 text-13 text-secondary sm:px-6 lg:px-8"
        >
          <p>
            © 2026 HDX Classification Systems, Inc. ·{" "}
            <Link href="/policy" className="underline underline-offset-2 hover:text-navy">
              {POLICY_NAME} v{POLICY_VERSION}
            </Link>{" "}
            · All verdicts are final, subject to appeal.
          </p>
        </footer>
      </div>
    </div>
  );
}

export type { BreadcrumbItem, WorkspaceNavKey };
