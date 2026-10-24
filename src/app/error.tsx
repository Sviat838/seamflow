"use client";

import { useEffect } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

function errorDigest(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string") {
    return error.digest;
  }
  return null;
}

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = errorDigest(error);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <header className="border-b border-hairline bg-white">
        <Container className="py-2">
          <Wordmark size="lg" />
        </Container>
      </header>
      <main id="main" className="flex-1">
        <Container size="narrow" className="py-14 sm:py-20">
          <p className="mb-3.5 flex items-center gap-3 text-13 font-bold tracking-[0.14em] text-navy uppercase">
            <span aria-hidden="true" className="inline-block h-[3px] w-7 bg-mustard" />
            Processing exception
          </p>
          <h1 className="font-serif text-[34px] leading-[1.1] font-semibold text-balance text-navy sm:text-[44px]">
            Something went wrong on our side.
          </h1>
          <p className="mt-5 text-17 leading-relaxed text-body">
            This page failed to load. The question is still binary and the answer is still available. Try again in a
            moment.
          </p>
          {digest ? (
            <p className="mt-4 text-sm text-secondary">
              If it keeps happening, quote reference <span className="font-mono text-navy">{digest}</span> when you
              contact us.
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => retry()}>
              Try again
            </Button>
            <Button href="/" size="lg" variant="secondary">
              Go to the home page
            </Button>
          </div>
        </Container>
      </main>
    </div>
  );
}
