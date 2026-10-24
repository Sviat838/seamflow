import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findAccessibleScan: vi.fn(), readAuditTrail: vi.fn() }));

vi.mock("@/lib/scans/access", () => ({ findAccessibleScan: mocks.findAccessibleScan }));
vi.mock("@/lib/audit/queries", () => ({ readAuditTrail: mocks.readAuditTrail }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from "./route";

const CASE = "HDX-2026-1024-7001";
const get = (caseNumber: string) =>
  GET(new NextRequest(`http://localhost/api/v1/audit/${caseNumber}`), { params: Promise.resolve({ caseNumber }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readAuditTrail.mockResolvedValue([
    { event: "uploaded", actor: "Anonymous visitor · Web console", detail: "Image received.", occurredAt: "t", hash: "h", prevHash: null },
  ]);
});

describe("GET /api/v1/audit/[caseNumber]", () => {
  it("downloads the trail as CSV for a viewer with access", async () => {
    const admin = {};
    mocks.findAccessibleScan.mockResolvedValue({ admin, row: { id: "scan-1", case_number: CASE } });

    const response = await get(CASE);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="HDX-Audit-${CASE}.csv"`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toContain("t,uploaded,Anonymous visitor · Web console,Image received.,h,\r\n");
    expect(mocks.readAuditTrail).toHaveBeenCalledWith(admin, "scan-1");
  });

  it("is a 404 without access, for unknown cases and for anything that isn't a case number", async () => {
    mocks.findAccessibleScan.mockResolvedValue(null);
    expect((await get(CASE)).status).toBe(404);

    const response = await get("3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(mocks.findAccessibleScan).toHaveBeenCalledTimes(1);
    expect(mocks.readAuditTrail).not.toHaveBeenCalled();
  });
});
