import type { Metadata } from "next";
import { Suspense } from "react";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { LeadForm } from "@/components/forms/lead-form";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "Contact sales",
  description: "Ask about the HDX Business plan: unlimited classifications, batch, API and audit log.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ContactPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <ViewerSiteHeader />
      <main id="main" className="flex-1 bg-ground">
        <Container size="narrow" className="py-12 sm:py-16">
          <SectionHeading
            as="h1"
            size="page"
            eyebrow="Business plan"
            title="Contact sales"
            lead="Unlimited classifications, batch uploads, the API and the audit log. Tell us about your volume and we'll reply by email."
          />
          <Card as="div" className="mt-8">
            <CardBody>
              <Suspense fallback={<LeadForm source={null} />}>
                <LeadFormWithSource searchParams={searchParams} />
              </Suspense>
            </CardBody>
          </Card>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

async function LeadFormWithSource({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = Array.isArray(params.source) ? params.source[0] : params.source;
  return <LeadForm source={raw ?? null} />;
}
