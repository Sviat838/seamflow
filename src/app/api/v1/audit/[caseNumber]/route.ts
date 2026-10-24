import type { NextRequest } from "next/server";
import { readAuditTrail } from "@/lib/audit/queries";
import { AppError } from "@/lib/errors";
import { getRequestId } from "@/lib/http/request";
import { jsonError } from "@/lib/http/respond";
import { findAccessibleScan } from "@/lib/scans/access";
import { isCaseNumber } from "@/lib/scans/validation";
import { toAuditCsv } from "../csv";

interface Context {
  params: Promise<{ caseNumber: string }>;
}

/** GET /api/v1/audit/{caseNumber} → the case's audit trail as CSV, for its owner or company. */
export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const { caseNumber } = await params;
    const found = isCaseNumber(caseNumber) ? await findAccessibleScan(caseNumber) : null;
    if (!found) throw new AppError("NOT_FOUND", "We couldn't find that case.");
    return new Response(toAuditCsv(await readAuditTrail(found.admin, found.row.id)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // isCaseNumber allows only letters, digits and dashes, so this is header-safe.
        "Content-Disposition": `attachment; filename="HDX-Audit-${caseNumber}.csv"`,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
