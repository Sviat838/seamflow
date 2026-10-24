import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { nextAfterAuth } from "@/lib/auth/redirect";
import { requireViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = {
  title: "Register your company",
  description: "Name your company to finish setting up your HDX workspace.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <ViewerSiteHeader />
      <main id="main" className="flex-1 bg-ground py-12 sm:py-16">
        <Container size="narrow">
          <div className="mx-auto max-w-lg">
            <h1 className="font-serif text-3xl font-semibold text-navy sm:text-4xl">Register your company</h1>
            <p className="mt-3 text-17 text-body">
              One account is one company. Your classifications, certificates and leaderboard standing are filed
              under this name.
            </p>
            <Card as="div" className="mt-6">
              <CardBody>
                <Suspense fallback={<p className="text-secondary">Loading your account</p>}>
                  <OnboardingGate searchParams={searchParams} />
                </Suspense>
              </CardBody>
            </Card>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

async function OnboardingGate({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = rawNext ? nextAfterAuth(rawNext) : "/classify";
  const { viewer } = await requireViewer({ next });
  if (viewer.company) redirect(next);
  return <OnboardingForm next={next} />;
}
