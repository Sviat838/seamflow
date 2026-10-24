"use client";

import { useEffect } from "react";
import "./globals.css";

// Replaces the root layout when it fails, so it brings its own document and stays dependency-light.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-ground font-sans text-body antialiased">
        <title>Service interruption · HDX</title>
        <main id="main" className="mx-auto w-full max-w-narrow px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-serif text-[26px] leading-none font-semibold tracking-[0.04em] text-navy">HDX</p>
          <p className="mt-10 mb-3.5 flex items-center gap-3 text-13 font-bold tracking-[0.14em] text-navy uppercase">
            <span aria-hidden="true" className="inline-block h-[3px] w-7 bg-mustard" />
            Service interruption
          </p>
          <h1 className="font-serif text-[34px] leading-[1.1] font-semibold text-navy sm:text-[44px]">
            HDX is temporarily unable to issue verdicts.
          </h1>
          <p className="mt-5 text-17 leading-relaxed">
            The question remains binary. The answer will be back shortly. Try again in a moment.
          </p>
          {digest ? (
            <p className="mt-4 text-sm text-secondary">
              Reference <span className="font-mono text-navy">{digest}</span>
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex min-h-13 cursor-pointer items-center rounded-card border-[1.5px] border-mustard bg-mustard px-6 text-17 font-bold text-navy hover:bg-mustard-strong"
            >
              Try again
            </button>
            {/* A plain <a>: a full reload is the point when the root layout itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex min-h-13 items-center rounded-card border border-navy bg-white px-6 text-17 font-bold text-navy hover:bg-ground"
            >
              Go to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
