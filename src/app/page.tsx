import { Suspense } from "react";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { VerdictChip } from "@/components/verdict/verdict-chip";
import { LiveFeed } from "@/components/feed/live-feed";
import { UploadCard } from "@/components/upload";
import {
  CertificatesSection,
  ClosingCta,
  PlansSection,
  PolicySection,
  UseCasesSection,
} from "@/components/landing/sections";
import { getFeedSnapshot } from "@/lib/feed/snapshot";

const STEPS = [
  "Upload, paste or photograph the item in question.",
  "HDX applies the Hot Dog Definition Policy v3.2.",
  "Receive a verdict, a clause and a case record.",
];

async function LandingFeed() {
  const snapshot = await getFeedSnapshot({ limit: 12 });
  return <LiveFeed initial={snapshot} titleId="feed-card-title" headingLevel="h3" />;
}

export default function Home() {
  return (
    <>
      <ViewerSiteHeader />
      <main id="main">
        <section aria-labelledby="hero-title" className="bg-navy py-12 text-white sm:py-16" data-tone="navy">
          <Container className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <div>
              <h1 id="hero-title" className="font-serif text-4xl font-semibold text-white sm:text-5xl">
                Is it a hot dog? Get a definitive answer.
              </h1>
              <p className="mt-4 text-17 text-on-navy-sub">
                HDX classifies any image as HOT DOG or NOT HOT DOG under a published policy, cites the clause it applied
                and keeps an audit-ready case record of every verdict.
              </p>
              <ol className="mt-8 space-y-3">
                {STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3 text-on-navy-sub">
                    <span className="font-mono text-mustard tabular-nums">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-8">
                <p className="text-13 font-semibold uppercase tracking-wide text-on-navy-secondary">Possible verdicts</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <VerdictChip verdict="hot_dog" />
                  <VerdictChip verdict="not_hot_dog" onNavy />
                </div>
                <p className="mt-3 text-15 text-on-navy-sub">There is no third option.</p>
              </div>
            </div>
            <div id="classify" className="scroll-mt-24">
              <UploadCard variant="hero" />
            </div>
          </Container>
        </section>

        <section id="feed" aria-labelledby="feed-title" className="py-14 sm:py-20">
          <Container>
            <SectionHeading
              eyebrow="§ 1 — Live global feed"
              title="One question, asked all day."
              titleId="feed-title"
              lead="Every verdict HDX issues appears here within seconds, anonymised: time, coarse region, verdict and confidence. Never images, names or case numbers."
            />
            <div className="mt-8">
              <Suspense fallback={<p className="text-secondary">Loading the live feed…</p>}>
                <LandingFeed />
              </Suspense>
            </div>
          </Container>
        </section>

        <UseCasesSection />
        <CertificatesSection />
        <PolicySection />
        <PlansSection />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
