import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LabelSheet } from "@/components/labels/label-sheet";
import { PrintButton } from "@/components/labels/print-button";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { originFromHeaders } from "@/lib/auth/redirect";
import { getCaseForViewer } from "@/lib/scans/queries";

type Props = { params: Promise<{ caseNumber: string }> };

export const metadata: Metadata = { title: "QR labels · HDX", robots: { index: false } };

const PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  [data-print-hide] { display: none !important; }
  .label-sheet { box-shadow: none !important; margin: 0 !important; }
  .label-scroll { overflow: visible !important; padding: 0 !important; }
}
`;

async function LabelsLoader({ params }: Props) {
  const { caseNumber } = await params;
  const [scan, h] = await Promise.all([getCaseForViewer(caseNumber), headers()]);
  if (!scan || !scan.certificate || !scan.caseNumber) notFound();
  const origin = originFromHeaders(h) ?? "";
  const cert = scan.certificate;
  const revoked = cert.status === "revoked";
  const caseHref = `/cases/${scan.caseNumber}`;

  return (
    <>
      <div data-print-hide className="border-b border-hairline bg-white">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Button variant="ghost" href={caseHref}>
            Back to case
          </Button>
          {revoked ? null : <PrintButton />}
        </div>
        {revoked ? (
          <div className="mx-auto max-w-page px-4 pb-4 sm:px-6">
            <Notice tone="warning" title="This certificate was revoked">
              Labels for {cert.number} no longer verify, so printing is disabled.
              {cert.revokedReason ? ` Reason: ${cert.revokedReason}` : ""}
            </Notice>
          </div>
        ) : null}
      </div>
      <div className="label-scroll overflow-x-auto py-6">
        <LabelSheet origin={origin} certificate={cert} verdict={scan.verdict} />
      </div>
    </>
  );
}

export default function LabelsPage(props: Props) {
  return (
    <main id="main" className="min-h-screen bg-ground">
      <style>{PRINT_CSS}</style>
      <Suspense fallback={<p className="p-6 text-body">Preparing labels…</p>}>
        <LabelsLoader {...props} />
      </Suspense>
    </main>
  );
}
