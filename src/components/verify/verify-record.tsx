import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { formatCount, formatDate } from "@/components/ui/format";
import { CheckCircleIcon, AlertIcon, DownloadIcon } from "@/components/ui/icons";
import { KeyValueList } from "@/components/ui/table";
import { RatingBadge } from "@/components/verdict/rating-badge";
import { VerdictBand } from "@/components/verdict/verdict-band";
import { formatClause } from "@/lib/policy";
import { SHORT_DISCLAIMER, type PublicCertificate } from "@/lib/types";

export function VerifyRecord({ cert }: { cert: PublicCertificate }) {
  const revoked = cert.status === "revoked";
  const issuedTo = cert.companySlug ? (
    <Link href={`/companies/${cert.companySlug}`} className="font-semibold text-navy underline hover:text-navy-hover">
      {cert.issuedTo}
    </Link>
  ) : (
    <span className="font-semibold text-navy">{cert.issuedTo}</span>
  );

  const rows = [
    {
      label: "Verification code",
      value: (
        <div>
          <span className="font-mono text-17 font-semibold text-navy">{cert.code}</span>
          <p className="mt-1 text-13 text-secondary">Check this matches the code printed on your label.</p>
        </div>
      ),
    },
    { label: "Certificate", value: <span className="font-mono">{cert.number}</span> },
    { label: "Issued", value: formatDate(cert.issuedAt) },
    {
      label: "Status",
      value: revoked ? (
        <span className="font-semibold text-danger">Revoked{cert.revokedAt ? ` · ${formatDate(cert.revokedAt)}` : ""}</span>
      ) : (
        <span className="font-semibold text-status-green">Valid</span>
      ),
    },
    { label: "Policy", value: formatClause(cert.policyClause, { short: true }) },
    ...(cert.verdict === "hot_dog" && cert.rating !== null
      ? [{ label: "HDX Rating", value: <RatingBadge rating={cert.rating} size="sm" /> }]
      : []),
    { label: "Times scanned", value: <span className="tabular-nums">{formatCount(cert.verificationCount)}</span> },
    ...(cert.fingerprint
      ? [{ label: "Image fingerprint (SHA-256)", value: <span className="font-mono">{cert.fingerprint}</span> }]
      : []),
  ];

  return (
    <>
      <header className="border-b border-hairline bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Wordmark size="sm" descriptor="none" />
          <span className="text-13 font-semibold uppercase tracking-wide text-secondary">Label verification</span>
        </Container>
      </header>
      <main id="main" className="bg-ground pb-12">
        <Container size="narrow" className="pt-6">
          {cert.isSample ? (
            <p className="mb-4 rounded-card border border-hairline bg-mustard-tint px-4 py-3 text-15 text-navy">
              <strong>Sample record.</strong> This is the built-in demonstration certificate. Its scan counter never moves.
            </p>
          ) : null}

          <section aria-live="polite" aria-labelledby="verify-status" className="mb-4">
            {revoked ? (
              <div className="rounded-card border-2 border-danger bg-white p-5" role="status">
                <p className="flex items-center gap-2 text-13 font-bold uppercase tracking-wide text-danger">
                  <AlertIcon size={18} /> Certificate revoked
                </p>
                <h1 id="verify-status" className="mt-2 font-serif text-2xl font-semibold text-navy">
                  This certificate was withdrawn on {cert.revokedAt ? formatDate(cert.revokedAt) : "an earlier date"} after
                  an appeal to the Hot Dog Review Board.
                </h1>
                {cert.revokedReason ? <p className="mt-2 text-body">Reason: {cert.revokedReason}</p> : null}
              </div>
            ) : (
              <div className="rounded-card bg-status-green p-5 text-white" role="status">
                <p className="flex items-center gap-2 text-13 font-bold uppercase tracking-wide">
                  <CheckCircleIcon size={18} /> Verified
                </p>
                <h1 id="verify-status" className="mt-2 font-serif text-3xl font-semibold">
                  This label is genuine.
                </h1>
              </div>
            )}
          </section>

          <Card aria-labelledby="product-title" className="mb-4">
            <div className="p-5">
              <p className="text-13 font-semibold uppercase tracking-wide text-secondary">Product</p>
              <h2 id="product-title" className="mt-1 font-serif text-2xl font-semibold text-navy">
                {cert.productName ?? "Unnamed product"}
              </h2>
              <p className="mt-1 text-15 text-body">
                Issued to {issuedTo}
                {cert.sku ? <> · SKU {cert.sku}</> : null}
              </p>
            </div>
          </Card>

          <div className="mb-4">
            <VerdictBand
              verdict={cert.verdict}
              policyClause={cert.policyClause}
              reviewStatus={revoked ? "overturned" : null}
              size="compact"
            />
          </div>

          <Card aria-labelledby="details-title" className="mb-6">
            <CardHeader title="Certificate details" titleId="details-title" />
            <KeyValueList rows={rows} />
          </Card>

          <div className="flex flex-col gap-3">
            <Button
              variant="navy"
              block
              size="lg"
              href={`/v/${cert.code}/certificate.pdf`}
              external
              icon={<DownloadIcon size={18} />}
            >
              Download certificate (PDF)
            </Button>
            <Button variant="secondary" block href="/contact?source=suspicious-label">
              Report a suspicious label
            </Button>
          </div>

          <p className="mt-8 text-13 text-secondary">{SHORT_DISCLAIMER}</p>
          <p className="mt-2 text-15 text-body">
            <Link href="/" className="font-semibold text-navy underline hover:text-navy-hover">
              Get your own verdict
            </Link>
          </p>
        </Container>
      </main>
    </>
  );
}
