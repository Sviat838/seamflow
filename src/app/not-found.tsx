import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { VerifyCodeForm } from "@/components/layout/verify-code-form";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ArrowRightIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-ground">
        <Container className="flex flex-wrap items-start gap-x-16 gap-y-10 py-14 sm:py-20">
          <div className="min-w-0 flex-[1_1_30rem]">
            <p className="mb-3.5 flex items-center gap-3 text-13 font-bold tracking-[0.14em] text-navy uppercase">
              <span aria-hidden="true" className="inline-block h-[3px] w-7 bg-mustard" />
              Error 404 · No record found
            </p>
            <h1 className="font-serif text-[34px] leading-[1.1] font-semibold text-balance text-navy sm:text-[48px]">
              This page could not be classified.
            </h1>
            <p className="mt-5 max-w-xl text-17 leading-relaxed text-body">
              We checked. It is neither a hot dog nor a page. The address may be mistyped, or the record you followed
              may belong to a workspace you are not signed in to.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/#classify" size="lg" iconRight={<ArrowRightIcon size={18} />}>
                Classify an image
              </Button>
              <Button href="/" size="lg" variant="secondary">
                Go to the home page
              </Button>
            </div>
          </div>
          <section
            aria-labelledby="verify-title"
            className="w-full max-w-md min-w-0 flex-[1_1_20rem] rounded-card border border-hairline bg-white p-6"
          >
            <h2 id="verify-title" className="font-serif text-[22px] leading-snug font-semibold text-navy">
              Checking a certificate?
            </h2>
            <p className="mt-2 mb-5 text-15 text-body">
              Enter the verification code printed on the label to open the public record.
            </p>
            <VerifyCodeForm id="verify-code-404" />
          </section>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
