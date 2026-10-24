import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { Viewer } from "@/lib/types";
import type { CertificateRow } from "./mappers";
import { SAMPLE_CERTIFICATE } from "./sample";
import {
  getPublicCertificate,
  issueCertificate,
  listViewerCertificates,
  revokeCertificate,
  updateCertificateProduct,
} from "./service";

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getViewerContext: vi.fn(),
  loadAccessibleScan: vi.fn(),
  recordAuditEvents: vi.fn(),
  revalidateTag: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/scans/access", () => ({
  loadAccessibleScan: mocks.loadAccessibleScan,
  viewerLabel: (viewer: Viewer) => viewer.displayName ?? viewer.email ?? "Anonymous visitor",
}));
vi.mock("@/lib/audit/record", () => ({ recordAuditEvents: mocks.recordAuditEvents }));
vi.mock("@/lib/companies/queries", () => ({ LEADERBOARD_TAG: "leaderboard" }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: mocks.logError } }));

// ---------------------------------------------------------------------------
// A minimal PostgREST fake: records each query and lets the test decide the result.
// ---------------------------------------------------------------------------

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "rpc";
  args?: unknown;
  columns?: string;
  filters: unknown[][];
  terminal?: "single" | "maybeSingle" | "many";
}
type Result = { data: unknown; error: unknown };
type Handler = (query: Query) => Result;

function fakeAdmin(handler: Handler) {
  const queries: Query[] = [];
  const builder = (query: Query) => {
    queries.push(query);
    const run = (terminal: Query["terminal"]) => {
      query.terminal = terminal;
      return Promise.resolve(handler(query));
    };
    const chain: Record<string, unknown> = {
      select: (columns: string) => {
        query.columns = columns;
        return chain;
      },
      single: () => run("single"),
      maybeSingle: () => run("maybeSingle"),
      then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => run("many").then(resolve, reject),
    };
    for (const name of ["eq", "is", "or", "order", "limit"]) {
      chain[name] = (...args: unknown[]) => {
        query.filters.push([name, ...args]);
        return chain;
      };
    }
    return chain;
  };
  const client = {
    from: (table: string) => ({
      select: (columns: string) => builder({ table, op: "select", columns, filters: [] }),
      insert: (args: unknown) => builder({ table, op: "insert", args, filters: [] }),
      update: (args: unknown) => builder({ table, op: "update", args, filters: [] }),
    }),
    rpc: (fn: string, args: unknown) => builder({ table: fn, op: "rpc", args, filters: [] }),
  };
  mocks.getAdminClient.mockReturnValue(client);
  return Object.assign(queries, { client });
}

const SCAN_ID = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const USER_ID = "0b6a1f3e-8c2d-4e5f-9a7b-1c2d3e4f5a6b";
const VISITOR_ID = "6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d";
const COMPANY_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function certRow(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: "c0ffee00-0000-4000-8000-000000000001",
    scan_id: SCAN_ID,
    number: "HDX-C-0088301",
    code: "4TPW-R8KC",
    status: "valid",
    issued_to: "Ballpark Holdings",
    product_name: null,
    sku: null,
    revoked_at: null,
    revoked_reason: null,
    verification_count: 0,
    verdict: "hot_dog",
    policy_clause: "2.1",
    confidence: 0.992,
    rating: 96,
    rating_note: null,
    company_id: null,
    last_verified_at: null,
    created_at: "2026-10-24T14:32:07.530Z",
    ...overrides,
  };
}

const anonymous: Viewer = {
  isAuthenticated: false,
  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  jobTitle: null,
  company: null,
  needsOnboarding: false,
};
const signedIn: Viewer = { ...anonymous, isAuthenticated: true, userId: USER_ID, email: "dana@ballpark.test", displayName: "Dana Kessler" };
const member: Viewer = {
  ...signedIn,
  company: { id: COMPANY_ID, name: "Ballpark Holdings", slug: "ballpark-holdings", plan: "free", role: "member", isListed: true },
};

const asViewer = (viewer: Viewer) => mocks.getViewerContext.mockResolvedValue({ viewer, visitorId: VISITOR_ID });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminClient.mockReturnValue(null);
  mocks.recordAuditEvents.mockResolvedValue(undefined);
  asViewer(signedIn);
});

describe("issueCertificate", () => {
  it("returns null without a database", async () => {
    expect(await issueCertificate({ scanId: SCAN_ID, issuedTo: "Ballpark Holdings" })).toBeNull();
  });

  it("inserts, audits the signing and returns the summary", async () => {
    const queries = fakeAdmin((q) => ({ data: certRow({ issued_to: (q.args as { issued_to: string }).issued_to }), error: null }));

    const cert = await issueCertificate({ scanId: SCAN_ID, issuedTo: "  Ballpark \n Holdings " });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({ table: "certificates", op: "insert", terminal: "single" });
    expect(queries[0].args).toEqual({ scan_id: SCAN_ID, issued_to: "Ballpark Holdings" });
    expect(cert).toMatchObject({ number: "HDX-C-0088301", code: "4TPW-R8KC", status: "valid", issuedTo: "Ballpark Holdings" });
    expect(mocks.recordAuditEvents).toHaveBeenCalledWith(SCAN_ID, [
      {
        event: "certificate_issued",
        actor: "HDX Classification Authority",
        detail: "Certificate HDX-C-0088301 signed. QR code and public verification page issued.",
      },
    ]);
  });

  it("falls back to 'Individual submitter' and caps issued_to at 120 characters", async () => {
    const queries = fakeAdmin(() => ({ data: certRow(), error: null }));
    await issueCertificate({ scanId: SCAN_ID, issuedTo: "   " });
    await issueCertificate({ scanId: SCAN_ID, issuedTo: "x".repeat(200) });
    expect((queries[0].args as { issued_to: string }).issued_to).toBe("Individual submitter");
    expect((queries[1].args as { issued_to: string }).issued_to).toHaveLength(120);
  });

  it("is idempotent: a second issue for the same scan returns the existing certificate unaudited", async () => {
    const queries = fakeAdmin((q) =>
      q.op === "insert" ? { data: null, error: { code: "23505", message: "duplicate key" } } : { data: certRow(), error: null },
    );

    const cert = await issueCertificate({ scanId: SCAN_ID, issuedTo: "Ballpark Holdings" });

    expect(cert?.number).toBe("HDX-C-0088301");
    expect(queries[1]).toMatchObject({ op: "select", filters: [["eq", "scan_id", SCAN_ID]], terminal: "maybeSingle" });
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
  });

  it("retries once when the random code collides with another certificate", async () => {
    let inserts = 0;
    const queries = fakeAdmin((q) => {
      if (q.op === "select") return { data: null, error: null };
      inserts += 1;
      return inserts === 1 ? { data: null, error: { code: "23505", message: "certificates_code_key" } } : { data: certRow(), error: null };
    });

    const cert = await issueCertificate({ scanId: SCAN_ID, issuedTo: "Ballpark Holdings" });

    expect(cert?.number).toBe("HDX-C-0088301");
    expect(queries.map((q) => q.op)).toEqual(["insert", "select", "insert"]);
    expect(mocks.recordAuditEvents).toHaveBeenCalledTimes(1);
  });

  it("logs and returns null instead of throwing on other errors", async () => {
    fakeAdmin(() => ({ data: null, error: { code: "23503", message: "scan missing" } }));
    expect(await issueCertificate({ scanId: SCAN_ID, issuedTo: "Ballpark Holdings" })).toBeNull();
    expect(mocks.logError).toHaveBeenCalledWith("certificates.issue_failed", expect.objectContaining({ scanId: SCAN_ID }));
  });
});

describe("getPublicCertificate", () => {
  const joined = (overrides: Record<string, unknown> = {}) => ({
    ...certRow({ verification_count: 8 }),
    scans: {
      verdict: "hot_dog",
      confidence: 0.97,
      policy_clause: "2.2",
      rating: 88,
      rating_note: "Well seated.",
      image_sha256: "ab".repeat(32),
      model: "claude-opus-5-5",
      companies: { slug: "ballpark-holdings", is_listed: true },
    },
    ...overrides,
  });

  it("returns null for malformed codes without touching the database", async () => {
    const queries = fakeAdmin(() => ({ data: null, error: null }));
    expect(await getPublicCertificate("not-a-code")).toBeNull();
    expect(await getPublicCertificate("7KQ0-M9XD")).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it("serves the sample record for its code in any accepted form, with no database and no counter", async () => {
    expect(await getPublicCertificate("7kq2m9xd", { recordVerification: true })).toBe(SAMPLE_CERTIFICATE);
    expect(mocks.getAdminClient).not.toHaveBeenCalled();
  });

  it("returns null without a database", async () => {
    expect(await getPublicCertificate("4TPW-R8KC")).toBeNull();
  });

  it("reads by normalized code without counting by default", async () => {
    const queries = fakeAdmin(() => ({ data: joined(), error: null }));

    const cert = await getPublicCertificate("4tpw r8kc");

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({ table: "certificates", op: "select", filters: [["eq", "code", "4TPW-R8KC"]] });
    expect(queries[0].columns).toContain("scans(");
    expect(cert).toMatchObject({
      code: "4TPW-R8KC",
      verificationCount: 8,
      verdict: "hot_dog",
      policyClause: "2.2",
      rating: 88,
      fingerprint: "abab…abab",
      companySlug: "ballpark-holdings",
      isSample: false,
    });
  });

  it("counts the view through the RPC when asked", async () => {
    const queries = fakeAdmin(() => ({ data: joined({ verification_count: 9 }), error: null }));

    const cert = await getPublicCertificate("4TPW-R8KC", { recordVerification: true });

    expect(queries[0]).toMatchObject({ table: "record_certificate_verification", op: "rpc", args: { p_code: "4TPW-R8KC" } });
    expect(queries[0].terminal).toBe("maybeSingle");
    expect(cert?.verificationCount).toBe(9);
  });

  it("hides unlisted companies and returns null for unknown codes", async () => {
    fakeAdmin(() => ({ data: joined({ scans: { ...joined().scans, companies: { slug: "x", is_listed: false } } }), error: null }));
    expect((await getPublicCertificate("4TPW-R8KC"))?.companySlug).toBeNull();

    fakeAdmin(() => ({ data: null, error: null }));
    expect(await getPublicCertificate("4TPW-R8KC")).toBeNull();
  });

  it("throws a retryable INTERNAL error when the read fails", async () => {
    fakeAdmin(() => ({ data: null, error: { message: "connection reset" } }));
    await expect(getPublicCertificate("4TPW-R8KC")).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});

describe("updateCertificateProduct", () => {
  /** loadAccessibleScan grants access to SCAN_ID (with `certificates` embedded) on a fake admin. */
  function accessibleScan(certificates: CertificateRow | null, handler: Handler, viewer: Viewer = signedIn) {
    const queries = fakeAdmin(handler);
    mocks.loadAccessibleScan.mockResolvedValue({
      admin: queries.client,
      row: { id: SCAN_ID, certificates },
      ctx: { viewer, visitorId: VISITOR_ID },
      access: { isOwner: true, isCompanyMember: false, canManage: true },
    });
    return queries;
  }

  it("validates the patch before loading anything", async () => {
    await expect(updateCertificateProduct(SCAN_ID, { productName: "x".repeat(81) })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(mocks.loadAccessibleScan).not.toHaveBeenCalled();
  });

  it("propagates the scans access rule (NOT_FOUND for strangers)", async () => {
    mocks.loadAccessibleScan.mockRejectedValue(new AppError("NOT_FOUND", "We couldn't find that scan."));
    await expect(updateCertificateProduct(SCAN_ID, { sku: "BH-SF-06" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when the case has no certificate", async () => {
    const queries = accessibleScan(null, () => ({ data: null, error: null }));
    await expect(updateCertificateProduct(SCAN_ID, { sku: "BH-SF-06" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(queries).toHaveLength(0);
  });

  it("updates only the fields sent, audits the change and refreshes company profiles", async () => {
    const admin = accessibleScan(
      certRow({ product_name: "Old name", sku: "OLD-1" }),
      () => ({ data: certRow({ product_name: "Stadium Frank, 6 in.", sku: "OLD-1" }), error: null }),
      member,
    );

    const cert = await updateCertificateProduct(SCAN_ID, { productName: " Stadium Frank, 6 in. " });

    expect(admin[0]).toMatchObject({
      table: "certificates",
      op: "update",
      args: { product_name: "Stadium Frank, 6 in." },
      filters: [["eq", "scan_id", SCAN_ID]],
    });
    expect(cert).toMatchObject({ productName: "Stadium Frank, 6 in.", sku: "OLD-1" });
    expect(mocks.recordAuditEvents).toHaveBeenCalledWith(SCAN_ID, [
      {
        event: "product_updated",
        actor: "Dana Kessler · Web console",
        detail: 'Certificate HDX-C-0088301 product details set: "Stadium Frank, 6 in.", SKU OLD-1.',
      },
    ]);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("leaderboard", "max");
  });

  it("does not audit a no-op change", async () => {
    accessibleScan(certRow({ sku: "BH-SF-06" }), () => ({ data: certRow({ sku: "BH-SF-06" }), error: null }));

    await updateCertificateProduct(SCAN_ID, { sku: "BH-SF-06" });

    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("throws a retryable INTERNAL error when the write fails", async () => {
    accessibleScan(certRow(), () => ({ data: null, error: { message: "timeout" } }));
    await expect(updateCertificateProduct(SCAN_ID, { sku: null })).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});

describe("revokeCertificate", () => {
  it("does nothing for malformed ids or without a database", async () => {
    const queries = fakeAdmin(() => ({ data: null, error: null }));
    await revokeCertificate("nope", "Overturned.");
    expect(queries).toHaveLength(0);

    mocks.getAdminClient.mockReturnValue(null);
    await expect(revokeCertificate(SCAN_ID, "Overturned.")).resolves.toBeUndefined();
  });

  it("revokes a valid certificate once and audits it", async () => {
    const queries = fakeAdmin(() => ({ data: { number: "HDX-C-0088301" }, error: null }));

    await revokeCertificate(SCAN_ID, "  Verdict overturned on appeal. ");

    expect(queries[0]).toMatchObject({
      table: "certificates",
      op: "update",
      filters: [
        ["eq", "scan_id", SCAN_ID],
        ["eq", "status", "valid"],
      ],
    });
    expect(queries[0].args).toMatchObject({ status: "revoked", revoked_reason: "Verdict overturned on appeal." });
    expect(Number.isNaN(Date.parse((queries[0].args as { revoked_at: string }).revoked_at))).toBe(false);
    expect(mocks.recordAuditEvents).toHaveBeenCalledWith(SCAN_ID, [
      {
        event: "certificate_revoked",
        actor: "HDX Classification Authority",
        detail: "Certificate HDX-C-0088301 revoked. Verdict overturned on appeal.",
      },
    ]);
  });

  it("is idempotent: an already revoked (or missing) certificate is not re-audited", async () => {
    fakeAdmin(() => ({ data: null, error: null }));
    await revokeCertificate(SCAN_ID, "Again.");
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
  });

  it("caps the reason at 300 characters and supplies one when blank", async () => {
    const queries = fakeAdmin(() => ({ data: null, error: null }));
    await revokeCertificate(SCAN_ID, "r".repeat(400));
    await revokeCertificate(SCAN_ID, "   ");
    expect((queries[0].args as { revoked_reason: string }).revoked_reason).toHaveLength(300);
    expect((queries[1].args as { revoked_reason: string }).revoked_reason).toBe("Verdict overturned on appeal.");
  });

  it("throws when the update fails", async () => {
    fakeAdmin(() => ({ data: null, error: { message: "boom" } }));
    await expect(revokeCertificate(SCAN_ID, "Overturned.")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("listViewerCertificates", () => {
  const listRow = (overrides: Record<string, unknown> = {}) => ({
    case_number: "HDX-2026-1024-7731",
    verdict: "hot_dog",
    rating: 91,
    certificates: certRow(),
    ...overrides,
  });

  it("reads the viewer even without a database", async () => {
    expect(await listViewerCertificates()).toEqual([]);
    expect(mocks.getViewerContext).toHaveBeenCalled();
  });

  it("lists company certificates plus the member's own", async () => {
    asViewer(member);
    const queries = fakeAdmin(() => ({ data: [listRow()], error: null }));

    const list = await listViewerCertificates({ limit: 10 });

    expect(queries[0].table).toBe("scans");
    expect(queries[0].columns).toContain("certificates!inner(");
    expect(queries[0].filters).toContainEqual(["or", `company_id.eq.${COMPANY_ID},user_id.eq.${USER_ID}`]);
    expect(queries[0].filters).toContainEqual(["limit", 10]);
    expect(list).toEqual([
      expect.objectContaining({ number: "HDX-C-0088301", caseNumber: "HDX-2026-1024-7731", verdict: "hot_dog", rating: 91 }),
    ]);
  });

  it("scopes signed-in users without a company, and visitors, to their own scans", async () => {
    let queries = fakeAdmin(() => ({ data: [], error: null }));
    await listViewerCertificates();
    expect(queries[0].filters).toContainEqual(["eq", "user_id", USER_ID]);

    asViewer(anonymous);
    queries = fakeAdmin(() => ({ data: [], error: null }));
    await listViewerCertificates();
    expect(queries[0].filters).toContainEqual(["eq", "visitor_id", VISITOR_ID]);
    expect(queries[0].filters).toContainEqual(["is", "user_id", null]);
  });

  it("clamps the limit, drops ratings from NOT HOT DOG rows and skips rows without a certificate", async () => {
    const queries = fakeAdmin(() => ({
      data: [listRow({ verdict: "not_hot_dog", rating: 12 }), listRow({ certificates: null })],
      error: null,
    }));

    const list = await listViewerCertificates({ limit: 1000 });

    expect(queries[0].filters).toContainEqual(["limit", 100]);
    expect(list).toHaveLength(1);
    expect(list[0].rating).toBeNull();
  });

  it("throws a retryable INTERNAL error when the read fails", async () => {
    fakeAdmin(() => ({ data: null, error: { message: "down" } }));
    await expect(listViewerCertificates()).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
  });
});
