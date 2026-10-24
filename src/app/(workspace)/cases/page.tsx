import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatConfidence, formatDateTimeUtc } from "@/components/ui/format";
import { PlusIcon } from "@/components/ui/icons";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { RatingBadge } from "@/components/verdict/rating-badge";
import { VerdictChip } from "@/components/verdict/verdict-chip";
import { PageLoading } from "@/components/workspace/page-loading";
import { listViewerScans } from "@/lib/scans/queries";

export const metadata: Metadata = { title: "History" };

async function CasesTable() {
  const { scans } = await listViewerScans({ limit: 50 });
  const rows = scans.filter((s) => s.caseNumber);
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No classifications yet"
        body="Every image you classify gets a case number, a verdict and an audit trail. They'll be listed here."
        action={<Button href="/classify">Classify an image</Button>}
      />
    );
  }
  return (
    <Table caption="Your classification history, newest first" captionHidden minWidth="44rem">
      <THead>
        <Tr>
          <Th>Case</Th>
          <Th>Submitted (UTC)</Th>
          <Th>Verdict</Th>
          <Th align="right">Confidence</Th>
          <Th>Rating</Th>
          <Th>Certificate</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((s) => (
          <Tr key={s.id}>
            <Td mono>
              <Link href={`/cases/${s.caseNumber}`} className="inline-flex min-h-11 items-center font-semibold text-navy underline hover:text-navy-hover">
                {s.caseNumber}
              </Link>
            </Td>
            <Td numeric>{formatDateTimeUtc(s.createdAt)}</Td>
            <Td>
              <VerdictChip verdict={s.verdict} size="sm" />
            </Td>
            <Td align="right" numeric>
              {formatConfidence(s.confidence)}
            </Td>
            <Td>{s.rating != null ? <RatingBadge rating={s.rating} size="sm" showBand={false} /> : "—"}</Td>
            <Td>{s.certificate ? (s.certificate.status === "valid" ? "Valid" : "Revoked") : "—"}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export default function CasesPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="History"
        meta="Every classification for your account, newest first."
        actions={
          <Button variant="secondary" href="/classify" icon={<PlusIcon size={18} />}>
            New classification
          </Button>
        }
      />
      <div className="mt-6">
        <Suspense fallback={<PageLoading label="Loading history" />}>
          <CasesTable />
        </Suspense>
      </div>
    </div>
  );
}
