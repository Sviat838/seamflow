import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageLoading } from "@/components/workspace/page-loading";
import { getViewerContext } from "@/lib/auth/viewer";
import { getUsage } from "@/lib/usage";

async function WorkspaceFrame({ children }: { children: ReactNode }) {
  const ctx = await getViewerContext();
  if (ctx.viewer.isAuthenticated && !ctx.viewer.company) redirect("/onboarding");
  const usage = await getUsage(ctx);
  return (
    <AppShell viewer={ctx.viewer} usage={usage}>
      {children}
    </AppShell>
  );
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageLoading label="Loading workspace" />}>
      <WorkspaceFrame>{children}</WorkspaceFrame>
    </Suspense>
  );
}
