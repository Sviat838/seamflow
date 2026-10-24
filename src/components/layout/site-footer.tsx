import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Container } from "@/components/ui/container";
import { SAMPLE_CERTIFICATE_CODE } from "@/lib/certificates/sample";
import { POLICY_NAME, POLICY_VERSION } from "@/lib/policy";
import { SHORT_DISCLAIMER } from "@/lib/types";

// Only real routes and landing anchors. Everything the boards list that doesn't exist yet is left out.
const COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "Classify an image", href: "/#classify" },
      { label: "Live global feed", href: "/feed" },
      { label: "Certificates and QR labels", href: "/#certificates" },
      { label: "Batch jobs and REST API", href: "/contact?source=footer-api" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: `${POLICY_NAME} v${POLICY_VERSION}`, href: "/policy" },
      { label: "Sample certificate record", href: `/v/${SAMPLE_CERTIFICATE_CODE}` },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Use cases", href: "/#use-cases" },
      { label: "Company leaderboard", href: "/companies" },
      { label: "Plans", href: "/#plans" },
      { label: "Contact sales", href: "/contact?source=footer" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in or register", href: "/sign-in" },
      { label: "Classification history", href: "/cases" },
    ],
  },
] as const;

/** Navy site footer. */
export function SiteFooter() {
  return (
    <footer data-tone="navy" data-print-hide className="bg-navy text-on-navy-secondary">
      <Container>
        <div className="flex flex-wrap gap-x-12 gap-y-10 border-t border-navy-border pt-10 pb-8">
          <div className="min-w-0 flex-[1_1_16rem]">
            <Wordmark tone="navy" size="md" descriptor="none" />
            <p className="mt-4 max-w-[300px] text-sm leading-relaxed">
              Hot Dog or Not · Enterprise Cloud. Definitive answers to a binary question.
            </p>
          </div>
          <nav aria-label="Footer" className="grid min-w-0 flex-[2_1_35rem] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-8">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h2 className="mb-3 text-sm font-bold tracking-[0.04em] text-white">{column.title}</h2>
                <ul className="grid text-sm lg:gap-1">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="inline-flex min-h-11 items-center hover:text-white hover:underline lg:min-h-8">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-navy-border pt-5 pb-7 text-13 text-on-navy-muted">
          <p>© 2026 HDX Classification Systems, Inc. All verdicts are final, subject to appeal.</p>
          <p>{SHORT_DISCLAIMER}</p>
        </div>
      </Container>
    </footer>
  );
}
