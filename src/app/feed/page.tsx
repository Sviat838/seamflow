import { Suspense } from "react";
import type { Metadata } from "next";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Container } from "@/components/ui/container";
import { LiveFeed } from "@/components/feed/live-feed";
import { getFeedSnapshot } from "@/lib/feed/snapshot";

export const metadata: Metadata = {
  title: "Global feed",
  description: "Latest HDX verdicts worldwide, anonymised and updated live.",
};

async function FullFeed() {
  const snapshot = await getFeedSnapshot({ limit: 20 });
  return <LiveFeed initial={snapshot} variant="fullscreen" title="Global feed" headingLevel="h1" limit={20} />;
}

export default function FeedPage() {
  return (
    <>
      <ViewerSiteHeader />
      <main id="main">
        <Container className="py-10 sm:py-14">
          <Suspense
            fallback={
              <>
                <h1 className="font-serif text-3xl font-semibold text-navy">Global feed</h1>
                <p className="mt-4 text-secondary">Loading the live feed…</p>
              </>
            }
          >
            <FullFeed />
          </Suspense>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
