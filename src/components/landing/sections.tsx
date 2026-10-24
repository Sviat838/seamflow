import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { VerdictChip } from "@/components/verdict/verdict-chip";
import { clauseHref } from "@/components/verdict/clause";
import { POLICY_CLAUSES, POLICY_EFFECTIVE, POLICY_NAME, POLICY_VERSION } from "@/lib/policy";

const SAMPLE_CODE = "7KQ2-M9XD";

const BUSINESS_USE_CASES = [
  {
    title: "Certified Hot Dog labels on packaging",
    who: "Packaged-food brands",
    body: "Classify a product photo, issue a certificate and print its QR on the pack. Shoppers scan it and land on the public verification page.",
  },
  {
    title: "Category audits for delivery marketplaces",
    who: "Catalogue and trust teams",
    body: "Run every photo in the Hot Dogs category through HDX and send NOT HOT DOG listings to the catalogue queue with case IDs.",
  },
  {
    title: "Wrong-item claim triage",
    who: "Customer support teams",
    body: "Judge every “this isn’t what I ordered” photo against the same published policy, and attach the case ID to the ticket.",
  },
  {
    title: "UGC campaign moderation",
    who: "Brand and agency social teams",
    body: "Screen photo-contest entries so a hot dog campaign only features hot dogs.",
  },
];

const CONSUMER_USE_CASES = [
  { title: "Settle the household debate", body: "Upload the contested item. Receive a verdict with a clause number. Move on." },
  { title: "Verify a product label by scan", body: "Scan an HDX label on a pack or menu and see the certificate on the public record." },
  { title: "A definitive spoken answer", body: "Verdicts are announced to screen readers: one of two words, every time." },
];

const CERT_STEPS = [
  { title: "Classify", body: "Upload a photo of the product and receive a verdict with a clause." },
  { title: "Issue", body: "Every saved verdict gets a Certificate of Classification with its own verification code." },
  { title: "Label", body: "Download the PDF and print QR labels for packs, menus and windows." },
  { title: "Verify", body: "Anyone who scans the QR lands on the public verification page for that certificate." },
];

export function UseCasesSection() {
  return (
    <section id="use-cases" aria-labelledby="use-cases-title" className="border-t border-hairline bg-ground py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="§ 2 — Use cases"
          title="Who needs a definitive answer."
          titleId="use-cases-title"
          aside="Most of these are marketing or novelty. A few are genuinely useful. All of them get exactly two possible answers."
        />
        <h3 className="mt-10 text-13 font-semibold uppercase tracking-wide text-secondary">For business</h3>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BUSINESS_USE_CASES.map((u) => (
            <Card as="li" key={u.title} className="p-5">
              <p className="text-13 font-semibold text-secondary">{u.who}</p>
              <h4 className="mt-1 font-serif text-lg font-semibold text-navy">{u.title}</h4>
              <p className="mt-2 text-15">{u.body}</p>
            </Card>
          ))}
        </ul>
        <h3 className="mt-10 text-13 font-semibold uppercase tracking-wide text-secondary">For everyone else</h3>
        <ul className="mt-3 grid gap-4 sm:grid-cols-3">
          {CONSUMER_USE_CASES.map((u) => (
            <Card as="li" key={u.title} className="p-5">
              <h4 className="font-serif text-lg font-semibold text-navy">{u.title}</h4>
              <p className="mt-2 text-15">{u.body}</p>
            </Card>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function CertificatesSection() {
  return (
    <section id="certificates" aria-labelledby="certificates-title" className="py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="§ 3 — Certificates"
          title="A verdict you can print."
          titleId="certificates-title"
          lead="Every saved verdict comes with a Certificate of Classification: a PDF with a QR code that resolves to a public verification page."
        />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CERT_STEPS.map((step, i) => (
            <li key={step.title} className="rounded-card border border-hairline p-5">
              <p className="font-mono text-13 text-secondary tabular-nums">Step {i + 1}</p>
              <h3 className="mt-1 font-serif text-lg font-semibold text-navy">{step.title}</h3>
              <p className="mt-2 text-15">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href={`/v/${SAMPLE_CODE}`} iconRight={<ArrowRightIcon size={18} />}>
            See a sample verification page
          </Button>
          <Button variant="secondary" href={`/v/${SAMPLE_CODE}/certificate.pdf`} external>
            Sample certificate (PDF)
          </Button>
        </div>
      </Container>
    </section>
  );
}

export function PolicySection() {
  return (
    <section id="platform" aria-labelledby="policy-title" className="border-t border-hairline bg-ground py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="§ 5 — Policy"
          title="Every verdict cites a clause."
          titleId="policy-title"
          lead={`${POLICY_NAME} v${POLICY_VERSION}, in force since ${POLICY_EFFECTIVE}. The classifier applies it; the verdict names the clause it used.`}
        />
        <div className="mt-8 rounded-card border border-hairline bg-white">
          <Table caption={`Selected rulings under ${POLICY_NAME} v${POLICY_VERSION}`} captionHidden>
            <THead>
              <Tr>
                <Th>Clause</Th>
                <Th>Submission</Th>
                <Th>Verdict</Th>
                <Th>Basis</Th>
              </Tr>
            </THead>
            <TBody>
              {POLICY_CLAUSES.map((c) => (
                <Tr key={c.id}>
                  <Td mono>
                    <Link href={clauseHref(c.id)} className="underline underline-offset-2 hover:text-navy-hover">
                      §{c.id}
                    </Link>
                  </Td>
                  <Td strong>{c.example}</Td>
                  <Td>
                    <VerdictChip verdict={c.verdict} size="sm" />
                  </Td>
                  <Td>{c.basis}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="mt-6">
          <Button variant="link" href="/policy">
            Read the full policy
          </Button>
        </div>
      </Container>
    </section>
  );
}

export function PlansSection() {
  return (
    <section id="plans" aria-labelledby="plans-title" className="py-14 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="§ 7 — Plans"
          title="Two plans. Still only two answers."
          titleId="plans-title"
          aside="Start free. When the answer matters to your business, talk to us."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-serif text-2xl font-semibold text-navy">Free</h3>
            <p className="mt-1 text-15 text-secondary">No signup required.</p>
            <ul className="mt-4 space-y-2 text-15">
              {[
                "20 classifications in total",
                "Full verdict with confidence and clause",
                "Certificate of Classification for every saved verdict",
                "Audit trail for every case",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckIcon size={18} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Button href="/#classify">Classify an image</Button>
            </div>
          </Card>
          <Card className="bg-navy p-6 text-white" data-tone="navy">
            <h3 className="font-serif text-2xl font-semibold text-white">Business</h3>
            <p className="mt-1 text-15 text-on-navy-sub">Pricing for your volume.</p>
            <ul className="mt-4 space-y-2 text-15 text-on-navy-sub">
              {[
                "Unlimited classifications for your company",
                "Pricing agreed for your volume",
                "Everything in Free",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <CheckIcon size={18} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Button variant="onNavy" href="/contact?source=plans">
                Contact us
              </Button>
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-navy py-14 text-white sm:py-20" data-tone="navy">
      <Container className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="cta-title" className="font-serif text-3xl font-semibold text-white">
            Is it a hot dog? Find out in seconds.
          </h2>
          <p className="mt-2 text-on-navy-sub">There is no third option.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href="/#classify" size="lg" iconRight={<ArrowRightIcon size={18} />}>
            Classify an image
          </Button>
          <Button variant="onNavy" size="lg" href="/contact?source=cta">
            Contact us
          </Button>
        </div>
      </Container>
    </section>
  );
}
