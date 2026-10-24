import type { Metadata } from "next";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { VerdictChip } from "@/components/verdict/verdict-chip";
import { clauseAnchorId } from "@/components/verdict/clause";
import {
  POLICY_CLAUSES,
  POLICY_EFFECTIVE,
  POLICY_ENGINE,
  POLICY_NAME,
  POLICY_VERSION,
  RATING_RUBRIC,
} from "@/lib/policy";

export const metadata: Metadata = {
  title: "Hot Dog Definition Policy",
  description: `${POLICY_NAME} v${POLICY_VERSION}: the clauses every HDX verdict cites, and the HDX Rating rubric.`,
};

const SECTIONS = [
  { id: "2", title: "§ 2 — Qualifying items (HOT DOG)", verdict: "hot_dog" as const },
  { id: "3", title: "§ 3 — Excluded items (NOT HOT DOG)", verdict: "not_hot_dog" as const },
];

export default function PolicyPage() {
  return (
    <>
      <ViewerSiteHeader />
      <main id="main">
        <Container size="narrow" className="py-10 sm:py-14">
          <SectionHeading
            as="h1"
            size="page"
            eyebrow={`Version ${POLICY_VERSION} · In force since ${POLICY_EFFECTIVE}`}
            title={POLICY_NAME}
            lead={`Every HDX verdict is issued under this policy and cites the clause applied. Applied by ${POLICY_ENGINE}. There are exactly two outcomes; there is no third option.`}
          />

          {SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={`section-${section.id}`} className="mt-12">
              <h2 id={`section-${section.id}`} className="font-serif text-2xl font-semibold text-navy">
                {section.title}
              </h2>
              <ol className="mt-4 divide-y divide-hairline rounded-card border border-hairline">
                {POLICY_CLAUSES.filter((c) => c.verdict === section.verdict).map((c) => (
                  <li key={c.id} id={clauseAnchorId(c.id)} className="scroll-mt-24 p-5 target:bg-mustard-tint">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-serif text-lg font-semibold text-navy">
                        <span className="font-mono tabular-nums">§{c.id}</span> {c.title}
                      </h3>
                      <VerdictChip verdict={c.verdict} size="sm" />
                    </div>
                    <p className="mt-2">{c.rule}</p>
                    <p className="mt-1 text-15 text-secondary">
                      Example: {c.example}. Basis: {c.basis}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <section aria-labelledby="rating-title" id="rating" className="mt-12 scroll-mt-24">
            <h2 id="rating-title" className="font-serif text-2xl font-semibold text-navy">
              § 4 — HDX Rating
            </h2>
            <p className="mt-3">
              HOT DOG verdicts also receive an HDX Rating from 0 to 100: how canonical the hot dog is under this policy.
              Four criteria are worth 25 points each. Image quality never changes the verdict. Bands: Exemplary (85 and
              above), Compliant (60 to 84), Marginal (below 60).
            </p>
            <dl className="mt-4 divide-y divide-hairline rounded-card border border-hairline">
              {RATING_RUBRIC.map((r) => (
                <div key={r.key} className="grid gap-1 p-4 sm:grid-cols-[160px_1fr]">
                  <dt className="font-semibold text-navy">
                    {r.label} <span className="text-13 font-normal text-secondary">(25 points)</span>
                  </dt>
                  <dd>{r.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
