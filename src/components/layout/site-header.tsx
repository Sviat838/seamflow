import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import type { Viewer } from "@/lib/types";
import { POLICY_VERSION } from "@/lib/policy";
import { SiteMobileMenu } from "./site-mobile-menu";
import { CLASSIFY_HREF, CONTACT_SALES_HREF, SITE_NAV_LINKS } from "./site-nav-links";
import { VerifyPopover } from "./verify-code-form";

const UTILITY_LINK = "inline-flex min-h-11 items-center text-body hover:text-navy hover:underline";

export interface SiteHeaderProps {
  /** Signed-in viewers see "Open workspace" and "Sign out" instead of "Sign in". */
  viewer?: Viewer | null;
}

/** Public header: utility bar, primary nav and a mobile menu. Fetches nothing. */
export function SiteHeader({ viewer }: SiteHeaderProps) {
  const signedIn = Boolean(viewer?.isAuthenticated);
  return (
    <header className="relative z-30" data-print-hide>
      <div className="hidden border-b border-hairline bg-ground md:block">
        <Container className="flex flex-wrap items-center justify-between gap-x-6 text-13 leading-snug">
          <Link href="/feed" className="inline-flex min-h-11 flex-wrap items-center gap-x-2 text-body hover:text-navy">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-status-green" />
            <span className="font-semibold">Live global feed</span>
            <span className="text-secondary">Hot Dog Definition Policy v{POLICY_VERSION} in force</span>
          </Link>
          <nav aria-label="Utility">
            <ul className="flex flex-wrap items-center gap-x-5">
              <li>
                <VerifyPopover />
              </li>
              <li>
                <Link href={CONTACT_SALES_HREF} className={UTILITY_LINK}>
                  Contact sales
                </Link>
              </li>
              {signedIn ? (
                <>
                  <li>
                    <Link href="/classify" className={`${UTILITY_LINK} font-bold text-navy`}>
                      Open workspace
                    </Link>
                  </li>
                  <li>
                    <form action={signOut}>
                      <button type="submit" className={`${UTILITY_LINK} cursor-pointer`}>
                        Sign out
                      </button>
                    </form>
                  </li>
                </>
              ) : (
                <li>
                  <Link href="/sign-in" className={`${UTILITY_LINK} font-bold text-navy`}>
                    Sign in
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </Container>
      </div>

      <div className="border-b border-hairline bg-white">
        <Container className="flex items-center gap-x-4 py-2 xl:gap-x-7 xl:py-3.5">
          <Wordmark size="lg" />
          <nav aria-label="Primary" className="hidden min-w-0 flex-1 xl:block">
            <ul className="flex flex-wrap gap-0.5">
              {SITE_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex h-11 items-center gap-2 rounded-card px-3 text-15 font-semibold text-navy hover:bg-ground"
                  >
                    {"live" in link ? <span aria-hidden="true" className="inline-block size-[7px] rounded-full bg-status-green" /> : null}
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {/* Display utilities go on a wrapper: Button sets its own inline-flex. */}
          <div className="hidden xl:block">
            <Button href={CLASSIFY_HREF}>Classify an image</Button>
          </div>
          <SiteMobileMenu signedIn={signedIn} className="ml-auto xl:hidden" />
        </Container>
      </div>
    </header>
  );
}
