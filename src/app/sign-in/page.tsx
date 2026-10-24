import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signInWithGoogle } from "@/app/actions/auth";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { PasswordAuthForm } from "@/components/forms/password-auth-form";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { nextAfterAuth, onboardingPath } from "@/lib/auth/redirect";
import { getViewerContext } from "@/lib/auth/viewer";
import { CLASSIFY_HREF } from "@/components/layout/site-nav-links";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to HDX or create your company workspace with Google or your email.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <ViewerSiteHeader />
      <main id="main" className="flex-1 bg-ground py-12 sm:py-16">
        <Container size="narrow">
          <Suspense fallback={<SignInCard next="/classify" authError={false} />}>
            <SignInGate searchParams={searchParams} />
          </Suspense>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

async function SignInGate({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawNext = first(params.next);
  const destination = rawNext ? nextAfterAuth(rawNext) : "/classify";
  const { viewer } = await getViewerContext();
  if (viewer.isAuthenticated) {
    redirect(viewer.company ? destination : onboardingPath(destination));
  }
  return <SignInCard next={destination} authError={Boolean(first(params.auth_error))} />;
}

function SignInCard({ next, authError }: { next: string; authError: boolean }) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-3xl font-semibold text-navy sm:text-4xl">Sign in or create your workspace</h1>
      <p className="mt-3 text-17 text-body">
        One account, one company workspace. New here? Continue with Google or create an account with your email,
        then name your company.
      </p>
      {authError ? (
        <div role="alert" className="mt-6">
          <Notice tone="error" title="Sign-in didn't complete">
            Google sign-in was cancelled or failed. Please try again.
          </Notice>
        </div>
      ) : null}
      <Card as="div" className="mt-6">
        <CardBody>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <SubmitButton block size="lg" pendingLabel="Redirecting to Google">
              Continue with Google
            </SubmitButton>
          </form>
          <div className="my-6 flex items-center gap-3 text-13 font-semibold uppercase tracking-wide text-secondary">
            <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
            or use your email
            <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
          </div>
          <PasswordAuthForm next={next} />
          <p className="mt-5 text-sm text-secondary">
            We only use your name, email and avatar from Google. No confirmation email is sent for email accounts. By
            continuing you agree to HDX&apos;s policy terms.
          </p>
        </CardBody>
      </Card>
      <div className="mt-6">
        <Notice tone="info" title="No account needed to try it">
          Your first 20 classifications are free and need no account.
        </Notice>
        <div className="mt-4">
          <Button variant="link" href={CLASSIFY_HREF}>
            Classify an image without signing in
          </Button>
        </div>
      </div>
    </div>
  );
}
