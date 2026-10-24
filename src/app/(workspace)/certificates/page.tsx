import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCount, formatDate } from "@/components/ui/format";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { RatingBadge } from "@/components/verdict/rating-badge";
import { PageLoading } from "@/components/workspace/page-loading";
import { requireViewer } from "@/lib/auth/viewer";
import { listViewerCertificates } from "@/lib/certificates/service";

export const metadata: Metadata = { title: "Certificates" };

async function CertificatesTable() {
  await requireViewer({ company: true, next: "/certificates" });
  const certs = await listViewerCertificates({ limit: 100 });
  if (certs.length === 0) {
    return (
      <EmptyState
        title="No certificates yet"
        body="Every HOT DOG verdict comes with a verifiable certificate. Classify an image to get your first one."
        action={<Button href="/classify">Classify an image</Button>}
      />
    );
  }
  return (
    <Table caption="Certificates issued to your company" captionHidden minWidth="48rem">
      <THead>
        <Tr>
          <Th>Certificate</Th>
          <Th>Code</Th>
          <Th>Product</Th>
          <Th>Rating</Th>
          <Th>Status</Th>
          <Th>Issued</Th>
          <Th align="right">Verifications</Th>
          <Th>Case</Th>
        </Tr>
      </THead>
      <TBody>
        {certs.map((c) => (
          <Tr key={c.code}>
            <Td mono>{c.number}</Td>
            <Td mono>
              <Link href={`/v/${c.code}`} className="inline-flex min-h-11 items-center text-navy underline hover:text-navy-hover">
                {c.code}
              </Link>
            </Td>
            <Td>{c.productName ? `${c.productName}${c.sku ? ` · ${c.sku}` : ""}` : "—"}</Td>
            <Td>{c.rating != null ? <RatingBadge rating={c.rating} size="sm" showBand={false} /> : "—"}</Td>
            <Td strong>{c.status === "valid" ? "Valid" : "Revoked"}</Td>
            <Td numeric>{formatDate(c.issuedAt)}</Td>
            <Td align="right" numeric>
              {formatCount(c.verificationCount)}
            </Td>
            <Td mono>
              <Link href={`/cases/${c.caseNumber}`} className="inline-flex min-h-11 items-center text-navy underline hover:text-navy-hover">
                {c.caseNumber}
              </Link>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export default function CertificatesPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader title="Certificates" meta="Every certificate issued to your company. Each one verifies publicly at /v/{code}." />
      <div className="mt-6">
        <Suspense fallback={<PageLoading label="Loading certificates" />}>
          <CertificatesTable />
        </Suspense>
      </div>
    </div>
  );
}
