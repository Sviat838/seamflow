import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTimeUtc } from "@/components/ui/format";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { PageLoading } from "@/components/workspace/page-loading";
import { requireViewer } from "@/lib/auth/viewer";
import { listViewerAuditEvents } from "@/lib/audit/queries";

export const metadata: Metadata = { title: "Audit log" };

async function AuditTable() {
  await requireViewer({ company: true, next: "/audit" });
  const events = await listViewerAuditEvents({ limit: 200 });
  if (events.length === 0) {
    return <EmptyState title="Nothing logged yet" body="Uploads, verdicts, certificates and appeals are recorded here as they happen." />;
  }
  return (
    <Table caption="Audit events for your company, newest first" captionHidden minWidth="52rem">
      <THead>
        <Tr>
          <Th>Time (UTC)</Th>
          <Th>Case</Th>
          <Th>Event</Th>
          <Th>Actor</Th>
          <Th>Detail</Th>
          <Th>Hash</Th>
        </Tr>
      </THead>
      <TBody>
        {events.map((e) => (
          <Tr key={e.hash}>
            <Td numeric>{formatDateTimeUtc(e.occurredAt)}</Td>
            <Td mono>
              <Link href={`/cases/${e.caseNumber}`} className="inline-flex min-h-11 items-center text-navy underline hover:text-navy-hover">
                {e.caseNumber}
              </Link>
            </Td>
            <Td strong>{e.event.replace(/_/g, " ")}</Td>
            <Td>{e.actor}</Td>
            <Td>{e.detail}</Td>
            <Td mono>{e.hash.slice(0, 10)}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

export default function AuditPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader title="Audit log" meta="Hash-chained record of every action on your company's cases. Export per case from the case page." />
      <div className="mt-6">
        <Suspense fallback={<PageLoading label="Loading audit log" />}>
          <AuditTable />
        </Suspense>
      </div>
    </div>
  );
}
