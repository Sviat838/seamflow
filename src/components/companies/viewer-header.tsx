import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { getViewerContext } from "@/lib/auth/viewer";

async function HeaderWithViewer() {
  const { viewer } = await getViewerContext();
  return <SiteHeader viewer={viewer} />;
}

/** SiteHeader that shows the signed-in state; the static header renders while the viewer loads. */
export function ViewerSiteHeader() {
  return (
    <Suspense fallback={<SiteHeader />}>
      <HeaderWithViewer />
    </Suspense>
  );
}
