import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { originFromHeaders } from "@/lib/auth/redirect";
import { getPublicCertificate } from "@/lib/certificates/service";
import { getRequestId } from "@/lib/http/request";
import { jsonError } from "@/lib/http/respond";
import { renderCertificatePdf } from "@/lib/pdf/certificate";

interface Context {
  params: Promise<{ code: string }>;
}

/** The Certificate of Classification as a PDF download. Public; never counts as a verification. */
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const certificate = await getPublicCertificate((await params).code);
    if (!certificate) notFound();

    // The QR must point at the host the visitor actually used (preview, production or localhost).
    const origin = originFromHeaders(request.headers) ?? request.nextUrl.origin;
    const pdf = await renderCertificatePdf(certificate, { origin });
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="HDX-Certificate-${certificate.number}.pdf"`,
        // Status can change (revocation), so browsers may reuse it briefly but shared caches never.
        "Cache-Control": "private, max-age=60",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
