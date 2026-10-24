import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { QrCode } from "@/components/brand/qr-code";
import { LiveFeed } from "@/components/feed/live-feed";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { ChipList } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import {
  formatBytes,
  formatConfidence,
  formatDate,
  formatDateTimeUtc,
  formatLatency,
  formatUtcTime,
  regionLabel,
} from "@/components/ui/format";
import { DownloadIcon, PlusIcon, PrinterIcon } from "@/components/ui/icons";
import { KeyValueList, TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { RatingBadge } from "@/components/verdict/rating-badge";
import { VerdictBand, VerdictStats } from "@/components/verdict/verdict-band";
import { AppealForm } from "@/components/workspace/appeal-form";
import { PageLoading } from "@/components/workspace/page-loading";
import { ProductForm } from "@/components/workspace/product-form";
import { getAppealForScan } from "@/lib/appeals/service";
import { listAuditEvents } from "@/lib/audit/queries";
import { originFromHeaders } from "@/lib/auth/redirect";
import { getFeedSnapshot } from "@/lib/feed/snapshot";
import { formatClause } from "@/lib/policy";
import { verifyUrl } from "@/lib/qr";
import { getCaseForViewer } from "@/lib/scans/queries";
import type { AppealView, AuditEvent, Scan } from "@/lib/types";

export const metadata: Metadata = { title: "Classification result" };
// The Review Board decides appeals in after().
export const maxDuration = 60;

const EVENT_LABELS: Record<AuditEvent["event"], string> = {
  uploaded: "Uploaded",
  screened: "Screened",
  classified: "Classified",
  certificate_issued: "Certificate issued",
  product_updated: "Product updated",
  appeal_filed: "Appeal filed",
  appeal_upheld: "Appeal upheld",
  appeal_overturned: "Appeal overturned",
  certificate_revoked: "Certificate revoked",
  image_deleted: "Image deleted",
};

function ScanFigure({ scan }: { scan: Scan }) {
  if (scan.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
      <img
        src={scan.imageUrl}
        alt={`Submitted image for case ${scan.caseNumber ?? ""}`}
        className="aspect-square w-full rounded-card bg-white object-cover"
      />
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-card border border-hairline bg-ground p-4 text-center text-15 text-secondary">
      {scan.imageDeleted ? "Image deleted automatically after 24 hours" : "No image stored for this case"}
    </div>
  );
}

function AppealSection({ scan, appeal }: { scan: Scan; appeal: AppealView | null }) {
  return (
    <Card aria-labelledby="appeal-title">
      <CardHeader title="Human review" titleId="appeal-title" />
      <CardBody>
        {appeal ? (
          <div className="space-y-2 text-15" aria-live="polite">
            <p>
              <span className="font-semibold text-navy">Status: </span>
              {appeal.status === "pending"
                ? "Under review by the Hot Dog Review Board"
                : appeal.status === "upheld"
                  ? "Verdict upheld on appeal"
                  : "Verdict overturned on appeal"}
            </p>
            <p>
              <span className="font-semibold text-navy">Your reason: </span>
              {appeal.reason}
            </p>
            {appeal.ruling ? (
              <p>
                <span className="font-semibold text-navy">Ruling: </span>
                {appeal.ruling}
              </p>
            ) : null}
            <p className="text-13 text-secondary">Filed {formatDateTimeUtc(appeal.createdAt)}</p>
          </div>
        ) : scan.isOwner && scan.persisted ? (
          <AppealForm scanId={scan.id} />
        ) : (
          <p className="text-15 text-secondary">Only the submitter can request a human review of this verdict.</p>
        )}
      </CardBody>
    </Card>
  );
}

function AuditSection({ scan, events }: { scan: Scan; events: AuditEvent[] }) {
  return (
    <Card aria-labelledby="audit-title">
      <CardHeader title="Audit trail" titleId="audit-title" meta="Hash-chained · Read-only" />
      {events.length === 0 ? (
        <CardBody>
          <p className="text-15 text-secondary">No audit events recorded yet.</p>
        </CardBody>
      ) : (
        <Table caption={`Audit trail for case ${scan.caseNumber}`} captionHidden>
          <THead>
            <Tr>
              <Th>Time (UTC)</Th>
              <Th>Event</Th>
              <Th>Actor</Th>
              <Th>Detail</Th>
            </Tr>
          </THead>
          <TBody>
            {events.map((e) => (
              <Tr key={e.hash}>
                <Td numeric>{formatUtcTime(e.occurredAt)}</Td>
                <Td strong>{EVENT_LABELS[e.event] ?? e.event}</Td>
                <Td>{e.actor}</Td>
                <Td>{e.detail}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      {scan.caseNumber ? (
        <CardFooter>
          <Button variant="link" external href={`/api/v1/audit/${scan.caseNumber}`} icon={<DownloadIcon size={18} />}>
            Export audit log (CSV)
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function CertificateCard({ scan, origin }: { scan: Scan; origin: string | null }) {
  const cert = scan.certificate;
  if (!cert) {
    return (
      <Card aria-labelledby="cert-title">
        <CardHeader title="Certificate" titleId="cert-title" />
        <CardBody>
          <p className="text-15 text-secondary">No certificate was issued for this case.</p>
        </CardBody>
      </Card>
    );
  }
  const url = origin ? verifyUrl(origin, cert.code) : `/v/${cert.code}`;
  const canEdit = scan.isOwner || scan.submittedBy !== null;
  return (
    <Card aria-labelledby="cert-title">
      <CardHeader
        title="Certificate"
        titleId="cert-title"
        actions={<Badge tone={cert.status === "valid" ? "navy" : "outline"}>{cert.status === "valid" ? "Valid" : "Revoked"}</Badge>}
      />
      <CardBody>
        <div className="flex flex-col items-center gap-3">
          {origin ? (
            <QrCode value={url} size={148} label={`QR code for certificate ${cert.number}, verification code ${cert.code}`} />
          ) : null}
          <dl className="w-full space-y-1 text-15">
            <div className="flex justify-between gap-2">
              <dt className="text-secondary">Number</dt>
              <dd className="font-mono text-navy">{cert.number}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-secondary">Code</dt>
              <dd className="font-mono text-navy">{cert.code}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-secondary">Issued</dt>
              <dd>{formatDate(cert.issuedAt)}</dd>
            </div>
            {cert.revokedReason ? (
              <div>
                <dt className="text-secondary">Revoked</dt>
                <dd>{cert.revokedReason}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="mt-4 space-y-2" data-print-hide>
          <Button variant="navy" block external href={`/v/${cert.code}/certificate.pdf`} icon={<DownloadIcon size={18} />}>
            Download certificate (PDF)
          </Button>
          {scan.caseNumber ? (
            <Button variant="secondary" block href={`/labels/${scan.caseNumber}`} icon={<PrinterIcon size={18} />}>
              Print QR labels
            </Button>
          ) : null}
          <CopyButton text={url} label="Copy verification link" block variant="secondary" />
        </div>
        {canEdit ? (
          <div className="mt-5 border-t border-hairline pt-4">
            <ProductForm scanId={scan.id} productName={cert.productName} sku={cert.sku} />
          </div>
        ) : cert.productName ? (
          <p className="mt-4 text-15">
            {cert.productName}
            {cert.sku ? ` · SKU ${cert.sku}` : ""}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

async function CaseView({ params }: { params: Promise<{ caseNumber: string }> }) {
  const { caseNumber } = await params;
  const scan = await getCaseForViewer(decodeURIComponent(caseNumber));
  if (!scan) notFound();

  const [appeal, events, snapshot, h] = await Promise.all([
    scan.persisted ? getAppealForScan(scan.id) : Promise.resolve(null),
    scan.persisted ? listAuditEvents(scan.id) : Promise.resolve([] as AuditEvent[]),
    getFeedSnapshot({ limit: 12, highlightScanId: scan.id }),
    headers(),
  ]);
  const origin = originFromHeaders(h);

  const reportRows = [
    { label: "Case number", value: <span className="font-mono">{scan.caseNumber}</span> },
    { label: "Verdict", value: scan.verdict === "hot_dog" ? "HOT DOG" : "NOT HOT DOG" },
    { label: "Confidence", value: formatConfidence(scan.confidence) },
    { label: "Policy clause", value: formatClause(scan.policyClause) },
    { label: "Model", value: scan.model },
    { label: "Processing time", value: scan.latencyMs != null ? formatLatency(scan.latencyMs) : "—" },
    { label: "Region", value: regionLabel(scan.region) },
    { label: "File", value: scan.fileName ? `${scan.fileName}${scan.imageBytes ? ` · ${formatBytes(scan.imageBytes)}` : ""}` : "—" },
    { label: "Submitted", value: formatDateTimeUtc(scan.createdAt) },
    ...(scan.submittedBy ? [{ label: "Submitted by", value: scan.submittedBy }] : []),
    ...(scan.cached ? [{ label: "Note", value: "Identical image seen before; verdict reused." }] : []),
  ];

  return (
    <div className="px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Classification result"
        meta={
          <>
            Case <span className="font-mono tabular-nums">{scan.caseNumber}</span> · Submitted{" "}
            {formatDateTimeUtc(scan.createdAt)}
          </>
        }
        actions={
          <Button variant="secondary" href="/classify" icon={<PlusIcon size={18} />}>
            New classification
          </Button>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <VerdictBand
            verdict={scan.verdict}
            policyClause={scan.policyClause}
            reviewStatus={scan.reviewStatus}
            live
            headingId="verdict-title"
            media={<ScanFigure scan={scan} />}
          >
            <VerdictStats
              verdict={scan.verdict}
              items={[
                { label: "Confidence", value: formatConfidence(scan.confidence) },
                { label: "Processing time", value: scan.latencyMs != null ? formatLatency(scan.latencyMs) : "—" },
                { label: "Clause applied", value: `§${scan.policyClause}` },
              ]}
            />
          </VerdictBand>

          {scan.verdict === "hot_dog" && scan.rating != null ? (
            <Card aria-labelledby="rating-title">
              <CardHeader title="HDX Rating" titleId="rating-title" />
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <RatingBadge rating={scan.rating} size="lg" />
                {scan.ratingNote ? <p className="text-15">{scan.ratingNote}</p> : null}
              </CardBody>
            </Card>
          ) : null}

          <Card aria-labelledby="why-title">
            <CardHeader title="Why this verdict" titleId="why-title" />
            <CardBody className="space-y-4">
              <p className="text-17">{scan.reasoning || scan.summary}</p>
              {scan.detectedItems.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-13 font-semibold uppercase tracking-wide text-secondary" id="detected-title">
                    Detected
                  </h3>
                  <ChipList items={scan.detectedItems} aria-labelledby="detected-title" />
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card aria-labelledby="report-title">
            <CardHeader title="Classification report" titleId="report-title" meta="Generated automatically · Read-only" />
            <KeyValueList rows={reportRows} />
          </Card>

          <AppealSection scan={scan} appeal={appeal} />
          <AuditSection scan={scan} events={events} />
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Certificate and global feed">
          <CertificateCard scan={scan} origin={origin} />
          <LiveFeed initial={snapshot} caseNumber={scan.caseNumber} />
        </aside>
      </div>
    </div>
  );
}

export default function CasePage({ params }: { params: Promise<{ caseNumber: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading case" />}>
      <CaseView params={params} />
    </Suspense>
  );
}
