import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import {
  MAX_IMAGE_BYTES,
  type CertificateSummary,
  type Classification,
  type Viewer,
  type ViewerCompany,
} from "@/lib/types";
import type { ScanRecord } from "./mappers";
import { createScan, deleteScan, updateScan } from "./service";
import {
  COMPANY_ID,
  createFakeAdmin,
  OTHER_USER_ID,
  scanRecord,
  SCAN_ID,
  USER_ID,
  VISITOR_ID,
  type QueryHandler,
  type RecordedQuery,
} from "./testing";

const mocks = vi.hoisted(() => ({
  classifyImage: vi.fn(),
  assertValidImage: vi.fn(),
  getViewerContext: vi.fn(),
  enforceScanRateLimit: vi.fn(),
  assertWithinQuota: vi.fn(),
  issueCertificate: vi.fn(),
  recordAuditEvents: vi.fn(),
  getAdminClient: vi.fn(),
  revalidateTag: vi.fn(),
  invalidateLeaderboard: vi.fn(),
  after: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({ classifyImage: mocks.classifyImage }));
vi.mock("@/lib/ai/image", () => ({ assertValidImage: mocks.assertValidImage }));
vi.mock("@/lib/auth/viewer", () => ({ getViewerContext: mocks.getViewerContext }));
vi.mock("@/lib/rate-limit", () => ({ enforceScanRateLimit: mocks.enforceScanRateLimit }));
vi.mock("@/lib/usage", () => ({ assertWithinQuota: mocks.assertWithinQuota }));
vi.mock("@/lib/certificates/service", () => ({
  issueCertificate: mocks.issueCertificate,
  INDIVIDUAL_SUBMITTER: "Individual submitter",
}));
vi.mock("@/lib/audit/record", () => ({ recordAuditEvents: mocks.recordAuditEvents }));
vi.mock("@/lib/companies/queries", () => ({ invalidateLeaderboard: mocks.invalidateLeaderboard }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient, SCANS_BUCKET: "scans" }));
vi.mock("@/lib/http/request", () => ({
  getClientIp: () => "203.0.113.7",
  hashIp: (ip: string | null) => (ip ? "hashed-ip" : null),
}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));

const CLASSIFICATION: Classification = {
  verdict: "hot_dog",
  confidence: 0.992,
  summary: "Hot dog confirmed. Procurement may proceed.",
  reasoning: "A sausage in a split bun with mustard.",
  detectedItems: ["sausage", "bun", "mustard"],
  flags: [],
  policyClause: "2.1",
  rating: 94,
  ratingNote: "Canonical form, condiments applied with intent.",
};
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const SHA256 = createHash("sha256").update(BYTES).digest("hex");
const CERTIFICATE: CertificateSummary = {
  number: "HDX-C-0088301",
  code: "7KQ2-M9XD",
  status: "valid",
  issuedTo: "Hooli Foods",
  productName: null,
  sku: null,
  issuedAt: "2026-10-24T10:15:57.000Z",
  revokedAt: null,
  revokedReason: null,
  verificationCount: 0,
};

const HOOLI: ViewerCompany = {
  id: COMPANY_ID,
  name: "Hooli Foods",
  slug: "hooli-foods",
  plan: "free",
  role: "owner",
  isListed: true,
};
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
const signedIn: Viewer = {
  ...anonymous,
  isAuthenticated: true,
  userId: USER_ID,
  email: "pm@hooli.test",
  displayName: "Dana Kessler",
  needsOnboarding: true,
};
const companyMember: Viewer = { ...signedIn, company: HOOLI, needsOnboarding: false };
/** A colleague of USER_ID at the same company. */
const colleague: Viewer = { ...companyMember, userId: OTHER_USER_ID, displayName: "Sam Ortiz", email: "sam@hooli.test" };

let afterCallbacks: Array<() => unknown>;
async function flushAfter() {
  for (const callback of afterCallbacks.splice(0)) await callback();
}

function asViewer(viewer: Viewer) {
  mocks.getViewerContext.mockResolvedValue({ viewer, visitorId: VISITOR_ID });
}

function withAdmin(handler: QueryHandler) {
  const fake = createFakeAdmin(handler);
  mocks.getAdminClient.mockReturnValue(fake.client);
  return fake;
}

/** Echoes an insert back the way PostgREST would, with DB defaults filled in. */
function insertEcho(query: RecordedQuery) {
  const row = query.payload as Partial<ScanRecord>;
  return { data: scanRecord({ ...row, share_slug: "NewSlug_-123", feedback: null } as Partial<ScanRecord>), error: null };
}

const isReuseLookup = (q: RecordedQuery) => q.op === "select" && q.filters.some(([, col]) => col === "image_sha256");
const image = () => new File([BYTES], "dog.jpg", { type: "image/jpeg" });
const auditEvents = () => mocks.recordAuditEvents.mock.calls.flatMap(([, events]) => events as Array<{ event: string; actor: string; detail: string }>);

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks = [];
  mocks.after.mockImplementation((callback: () => unknown) => afterCallbacks.push(callback));
  mocks.assertValidImage.mockReturnValue("image/jpeg");
  mocks.enforceScanRateLimit.mockResolvedValue(undefined);
  mocks.assertWithinQuota.mockResolvedValue(undefined);
  mocks.issueCertificate.mockResolvedValue(CERTIFICATE);
  mocks.recordAuditEvents.mockResolvedValue(undefined);
  mocks.classifyImage.mockResolvedValue({ classification: CLASSIFICATION, model: "claude-haiku-5-5", latencyMs: 812 });
  asViewer(signedIn);
});

describe("createScan", () => {
  it("classifies while uploading in parallel, then persists for a signed-in user", async () => {
    const fake = withAdmin((q) => (q.op === "insert" ? insertEcho(q) : { data: null, error: null }));
    // Hold the model call open to prove the upload doesn't wait for it.
    let finishClassify!: () => void;
    mocks.classifyImage.mockImplementation(async () => {
      await new Promise<void>((resolve) => (finishClassify = resolve));
      return { classification: CLASSIFICATION, model: "claude-haiku-5-5", latencyMs: 812 };
    });

    const pending = createScan({
      file: image(),
      fileName: "dog.jpg",
      isPublic: true,
      requestId: "req-1",
      headers: new Headers(),
    });
    await vi.waitFor(() => expect(mocks.classifyImage).toHaveBeenCalled());
    expect(fake.storage.upload).toHaveBeenCalledTimes(1);
    finishClassify();
    const scan = await pending;

    expect(mocks.enforceScanRateLimit).toHaveBeenCalledWith({ userId: USER_ID, visitorId: VISITOR_ID, ipHash: "hashed-ip" });
    expect(mocks.classifyImage).toHaveBeenCalledWith({ bytes: BYTES, mimeType: "image/jpeg" });

    const [path, body, options] = fake.storage.upload.mock.calls[0];
    expect(path).toBe(`${USER_ID}/${scan.id}.jpg`);
    expect(body).toEqual(BYTES);
    expect(options).toMatchObject({ contentType: "image/jpeg", upsert: false });

    const insert = fake.queries.find((q) => q.op === "insert");
    expect(insert?.payload).toMatchObject({
      id: scan.id,
      user_id: USER_ID,
      visitor_id: null,
      verdict: "hot_dog",
      image_path: `${USER_ID}/${scan.id}.jpg`,
      image_mime: "image/jpeg",
      image_bytes: BYTES.byteLength,
      image_sha256: SHA256,
      model: "claude-haiku-5-5",
      latency_ms: 812,
      is_public: true,
      ip_hash: "hashed-ip",
      request_id: "req-1",
      company_id: null,
      policy_clause: "2.1",
      rating: 94,
      rating_note: CLASSIFICATION.ratingNote,
      file_name: "dog.jpg",
      region: null,
      details: { ...CLASSIFICATION, cached: false },
    });

    expect(scan).toMatchObject({
      persisted: true,
      cached: false,
      isOwner: true,
      isPublic: true,
      shareSlug: "NewSlug_-123",
      imageUrl: `https://signed.test/${USER_ID}/${scan.id}.jpg`,
      reasoning: CLASSIFICATION.reasoning,
      caseNumber: "HDX-2026-1024-7731",
      policyClause: "2.1",
      rating: 94,
      fileName: "dog.jpg",
      imageExpiresAt: expect.any(String),
      certificate: CERTIFICATE,
      submittedBy: "Dana Kessler",
    });
    for (const field of ["user_id", "visitor_id", "company_id", "ip_hash", "request_id", "image_path"]) {
      expect(scan).not.toHaveProperty(field);
    }
    // Signed in but not onboarded: the certificate goes to an individual.
    expect(mocks.issueCertificate).toHaveBeenCalledWith({ scanId: scan.id, issuedTo: "Individual submitter" });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("stats", "max");
    expect(mocks.invalidateLeaderboard).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
    expect(log.info).toHaveBeenCalledWith(
      "scans.verdict",
      expect.objectContaining({ requestId: "req-1", scanId: scan.id, model: "claude-haiku-5-5", latencyMs: 812, cached: false, persisted: true }),
    );
  });

  it("reuses a prior verdict for identical bytes without calling the model", async () => {
    asViewer(anonymous);
    const fake = withAdmin((q) => {
      if (isReuseLookup(q)) return { data: scanRecord({ model: "claude-sonnet-5-5" }), error: null };
      return q.op === "insert" ? insertEcho(q) : { data: null, error: null };
    });

    const scan = await createScan({ file: image(), requestId: "req-2", headers: new Headers() });

    expect(mocks.classifyImage).not.toHaveBeenCalled();
    expect(mocks.enforceScanRateLimit).toHaveBeenCalled();
    // Cached verdicts still count towards the Free plan.
    expect(mocks.assertWithinQuota).toHaveBeenCalledTimes(1);
    const lookup = fake.queries[0];
    expect(isReuseLookup(lookup) && lookup.filters).toContainEqual(["eq", "image_sha256", SHA256]);
    // Disputed or overturned verdicts are never reused.
    expect(lookup.filters).toContainEqual(["or", "review_status.is.null,review_status.eq.upheld"]);
    // The owner still gets their own copy of the image.
    expect(fake.storage.upload.mock.calls[0][0]).toBe(`anon/${scan.id}.jpg`);
    expect(fake.queries.find((q) => q.op === "insert")?.payload).toMatchObject({
      user_id: null,
      visitor_id: VISITOR_ID,
      model: "claude-sonnet-5-5",
      latency_ms: null,
      is_public: false,
      // Rating and clause come along with the reused verdict.
      policy_clause: "2.1",
      rating: 92,
      rating_note: "Canonical frankfurter, evenly applied mustard.",
      details: { cached: true, reasoning: "A sausage in a split bun with mustard." },
    });
    expect(scan).toMatchObject({
      cached: true,
      persisted: true,
      latencyMs: null,
      model: "claude-sonnet-5-5",
      rating: 92,
      submittedBy: null,
    });
    expect(mocks.issueCertificate).toHaveBeenCalledWith({ scanId: scan.id, issuedTo: "Individual submitter" });
    expect(auditEvents().map((e) => [e.event, e.actor])).toEqual([
      ["uploaded", "Anonymous visitor · Web console"],
      ["screened", "HDX intake"],
      ["classified", "claude-sonnet-5-5 · HDX policy engine 3.2.1"],
    ]);
    expect(auditEvents()[2].detail).toBe(
      "HOT DOG at 97.0% confidence under Policy v3.2, §2.1. Verdict reused from an identical earlier submission.",
    );
  });

  it("asks the model when the prior row is too incomplete to reuse", async () => {
    withAdmin((q) => {
      if (isReuseLookup(q)) return { data: scanRecord({ details: { cached: false } }), error: null };
      return q.op === "insert" ? insertEcho(q) : { data: null, error: null };
    });

    const scan = await createScan({ file: image(), requestId: "req-3", headers: new Headers() });

    expect(mocks.classifyImage).toHaveBeenCalledTimes(1);
    expect(scan.cached).toBe(false);
  });

  it("returns an unsaved verdict when the insert fails, and removes the orphaned image", async () => {
    const fake = withAdmin((q) =>
      q.op === "insert" ? { data: null, error: { message: "db down" } } : { data: null, error: null },
    );

    const scan = await createScan({ file: image(), isPublic: true, requestId: "req-4", headers: new Headers() });

    expect(scan).toMatchObject({
      persisted: false,
      shareSlug: null,
      imageUrl: null,
      isPublic: false,
      isOwner: true,
      verdict: "hot_dog",
      summary: CLASSIFICATION.summary,
    });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.issueCertificate).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
    await flushAfter();
    expect(fake.storage.remove).toHaveBeenCalledWith([`${USER_ID}/${scan.id}.jpg`]);
  });

  it("saves the scan without an image when the upload fails", async () => {
    const fake = withAdmin((q) => (q.op === "insert" ? insertEcho(q) : { data: null, error: null }));
    fake.storage.upload.mockResolvedValueOnce({ data: null, error: { message: "bucket missing" } });

    const scan = await createScan({ file: image(), requestId: "req-5", headers: new Headers() });

    expect(fake.queries.find((q) => q.op === "insert")?.payload).toMatchObject({ image_path: null });
    expect(scan).toMatchObject({ persisted: true, imageUrl: null });
    expect(fake.storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("works without a database and returns persisted: false", async () => {
    mocks.getAdminClient.mockReturnValue(null);

    const scan = await createScan({ file: image(), isPublic: true, requestId: "req-6", headers: new Headers() });

    expect(mocks.classifyImage).toHaveBeenCalledTimes(1);
    expect(scan).toMatchObject({ persisted: false, shareSlug: null, imageUrl: null, isPublic: false, cached: false });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith("scans.verdict", expect.objectContaining({ requestId: "req-6", persisted: false }));
  });

  it("rethrows classifier errors and deletes the uploaded image afterwards", async () => {
    const fake = withAdmin(() => ({ data: null, error: null }));
    const failure = new AppError("AI_UNAVAILABLE", "The classifier is busy.");
    mocks.classifyImage.mockRejectedValue(failure);

    await expect(createScan({ file: image(), requestId: "req-7", headers: new Headers() })).rejects.toBe(failure);

    expect(fake.queries.some((q) => q.op === "insert")).toBe(false);
    expect(afterCallbacks).toHaveLength(1);
    await flushAfter();
    const uploadedPath = fake.storage.upload.mock.calls[0][0];
    expect(fake.storage.remove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("rejects oversized files before reading them or spending quota", async () => {
    const arrayBuffer = vi.fn();
    const huge = { size: MAX_IMAGE_BYTES + 1, arrayBuffer } as unknown as Blob;

    await expect(createScan({ file: huge, requestId: "req-8", headers: new Headers() })).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.enforceScanRateLimit).not.toHaveBeenCalled();
  });

  it("does not call the model or storage when rate limited", async () => {
    const fake = withAdmin(() => ({ data: null, error: null }));
    mocks.enforceScanRateLimit.mockRejectedValue(new AppError("RATE_LIMITED", "Slow down.", { retryAfterSeconds: 30 }));

    await expect(createScan({ file: image(), requestId: "req-9", headers: new Headers() })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(mocks.classifyImage).not.toHaveBeenCalled();
    expect(fake.storage.upload).not.toHaveBeenCalled();
  });

  it("stops at the Free-plan quota after rate limiting, before any model call or upload", async () => {
    const fake = withAdmin(() => ({ data: null, error: null }));
    mocks.assertWithinQuota.mockRejectedValue(new AppError("QUOTA_EXCEEDED", "Free plan used up."));

    await expect(createScan({ file: image(), requestId: "req-10", headers: new Headers() })).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      status: 402,
    });
    expect(mocks.assertWithinQuota).toHaveBeenCalledWith({ viewer: signedIn, visitorId: VISITOR_ID });
    expect(mocks.enforceScanRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.assertWithinQuota.mock.invocationCallOrder[0],
    );
    expect(mocks.classifyImage).not.toHaveBeenCalled();
    expect(fake.storage.upload).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(0);
  });

  it("attributes a company member's scan to the company, with region and a sanitized file name", async () => {
    asViewer(companyMember);
    const fake = withAdmin((q) => (q.op === "insert" ? insertEcho(q) : { data: null, error: null }));
    const headers = new Headers({ "x-vercel-ip-country": "DE", "x-vercel-ip-continent": "EU" });

    const scan = await createScan({
      file: image(),
      fileName: "C:\\Users\\dana\\frank\u202Egpj.exe",
      requestId: "req-11",
      headers,
    });

    expect(fake.queries.find((q) => q.op === "insert")?.payload).toMatchObject({
      user_id: USER_ID,
      company_id: COMPANY_ID,
      region: "EU-C",
      file_name: "frankgpj.exe",
    });
    expect(scan).toMatchObject({ region: "EU-C", fileName: "frankgpj.exe", isOwner: true });
    expect(mocks.issueCertificate).toHaveBeenCalledWith({ scanId: scan.id, issuedTo: "Hooli Foods" });
    expect(mocks.invalidateLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("records uploaded, screened and classified before the certificate, in the board's wording", async () => {
    withAdmin((q) => (q.op === "insert" ? insertEcho(q) : { data: null, error: null }));

    const scan = await createScan({
      file: image(),
      fileName: "frankfurter_lot14.jpg",
      requestId: "req-12",
      headers: new Headers(),
    });

    expect(mocks.recordAuditEvents).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvents.mock.calls[0][0]).toBe(scan.id);
    expect(auditEvents()).toEqual([
      {
        event: "uploaded",
        actor: "Dana Kessler · Web console",
        detail: "frankfurter_lot14.jpg received from Dana Kessler via Web console.",
      },
      {
        event: "screened",
        actor: "HDX intake",
        detail: `Image screened: JPEG verified from file contents, 8 B, SHA-256 ${SHA256.slice(0, 4)}…${SHA256.slice(-4)}. Image retained 24 hours, then deleted automatically. No raw IP address stored.`,
      },
      {
        event: "classified",
        actor: "claude-haiku-5-5 · HDX policy engine 3.2.1",
        detail: "HOT DOG at 99.2% confidence under Policy v3.2, §2.1.",
      },
    ]);
    // certificate_issued is appended by issueCertificate, so it must come after the intake events.
    expect(mocks.recordAuditEvents.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.issueCertificate.mock.invocationCallOrder[0],
    );
  });

  it("still returns the saved scan when the audit trail or the certificate fails", async () => {
    withAdmin((q) => (q.op === "insert" ? insertEcho(q) : { data: null, error: null }));
    mocks.recordAuditEvents.mockRejectedValue(new Error("audit down"));
    mocks.issueCertificate.mockRejectedValue(new Error("certificates down"));

    const scan = await createScan({ file: image(), requestId: "req-13", headers: new Headers() });

    expect(scan).toMatchObject({ persisted: true, certificate: null, verdict: "hot_dog" });
    expect(mocks.issueCertificate).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith("scans.audit_failed", expect.objectContaining({ requestId: "req-13" }));
    expect(log.warn).toHaveBeenCalledWith("scans.certificate_failed", expect.objectContaining({ requestId: "req-13" }));
  });

  it("returns no certificate when none could be issued", async () => {
    withAdmin((q) => (q.op === "insert" ? insertEcho(q) : { data: null, error: null }));
    mocks.issueCertificate.mockResolvedValue(null);

    const scan = await createScan({ file: image(), requestId: "req-14", headers: new Headers() });

    expect(scan).toMatchObject({ persisted: true, certificate: null });
  });

  it("keeps clause and rating consistent with the verdict before saving", async () => {
    const fake = withAdmin((q) => (q.op === "insert" ? insertEcho(q) : { data: null, error: null }));
    mocks.classifyImage.mockResolvedValue({
      classification: { ...CLASSIFICATION, verdict: "not_hot_dog", policyClause: "2.1", rating: 80 },
      model: "claude-haiku-5-5",
      latencyMs: 700,
    });

    await createScan({ file: image(), requestId: "req-15", headers: new Headers() });

    expect(fake.queries.find((q) => q.op === "insert")?.payload).toMatchObject({
      verdict: "not_hot_dog",
      policy_clause: "3.9",
      rating: null,
      rating_note: null,
    });
  });

  it("returns the new fields on an unsaved verdict too", async () => {
    mocks.getAdminClient.mockReturnValue(null);

    const scan = await createScan({
      file: image(),
      fileName: "dog.jpg",
      requestId: "req-16",
      headers: new Headers({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "TX" }),
    });

    expect(scan).toMatchObject({
      persisted: false,
      caseNumber: null,
      policyClause: "2.1",
      rating: 94,
      region: "US-C",
      fileName: "dog.jpg",
      imageBytes: BYTES.byteLength,
      certificate: null,
      submittedBy: "Dana Kessler",
    });
    expect(mocks.issueCertificate).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvents).not.toHaveBeenCalled();
  });
});

/** Answers the ownership lookup with `row` and echoes writes. */
function ownedRowAdmin(row: Partial<ScanRecord> | null) {
  return withAdmin((q) => {
    if (q.op === "select") return { data: row && scanRecord(row), error: null };
    if (q.op === "update") return { data: scanRecord({ ...row, ...(q.payload as Partial<ScanRecord>) }), error: null };
    return { data: null, error: null };
  });
}

describe("updateScan", () => {
  it("lets the owner set feedback, stamps feedback_at, and scopes the write to the owner", async () => {
    const fake = ownedRowAdmin({ user_id: USER_ID });

    const scan = await updateScan(SCAN_ID, { feedback: "correct" });

    const update = fake.queries.find((q) => q.op === "update");
    expect(update?.payload).toEqual({ feedback: "correct", feedback_at: expect.any(String) });
    expect(update?.filters).toEqual([
      ["eq", "id", SCAN_ID],
      ["eq", "user_id", USER_ID],
    ]);
    expect(scan).toMatchObject({ feedback: "correct", isOwner: true });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("stats", "max");
  });

  it("clears feedback and feedback_at together", async () => {
    const fake = ownedRowAdmin({ user_id: USER_ID, feedback: "incorrect" });

    await updateScan(SCAN_ID, { feedback: null });

    expect(fake.queries.find((q) => q.op === "update")?.payload).toEqual({ feedback: null, feedback_at: null });
  });

  it("toggles sharing for an anonymous owner without touching stats", async () => {
    asViewer(anonymous);
    const fake = ownedRowAdmin({ user_id: null, visitor_id: VISITOR_ID });

    const scan = await updateScan(SCAN_ID, { isPublic: true });

    const update = fake.queries.find((q) => q.op === "update");
    expect(update?.payload).toEqual({ is_public: true });
    expect(update?.filters).toEqual([
      ["eq", "id", SCAN_ID],
      ["is", "user_id", null],
      ["eq", "visitor_id", VISITOR_ID],
    ]);
    expect(scan.isPublic).toBe(true);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("forbids non-owners on public scans and hides private ones", async () => {
    ownedRowAdmin({ user_id: OTHER_USER_ID, is_public: true });
    await expect(updateScan(SCAN_ID, { feedback: "correct" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const fake = ownedRowAdmin({ user_id: OTHER_USER_ID, is_public: false });
    await expect(updateScan(SCAN_ID, { feedback: "correct" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.queries.some((q) => q.op === "update")).toBe(false);
  });

  it("does not let the original visitor edit a scan an account has claimed", async () => {
    asViewer(anonymous);
    ownedRowAdmin({ user_id: OTHER_USER_ID, visitor_id: VISITOR_ID });

    await expect(updateScan(SCAN_ID, { isPublic: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND for garbage ids, missing rows, and no database", async () => {
    const fake = ownedRowAdmin(null);
    await expect(updateScan("not-a-uuid", { feedback: "correct" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.queries).toHaveLength(0);
    await expect(updateScan(SCAN_ID, { feedback: "correct" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    mocks.getAdminClient.mockReturnValue(null);
    await expect(updateScan(SCAN_ID, { feedback: "correct" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets a same-company colleague manage the scan, scoped to the company, with the submitter's name", async () => {
    asViewer(colleague);
    const row = scanRecord({ user_id: USER_ID, company_id: COMPANY_ID });
    const fake = withAdmin((q) => {
      if (q.table === "profiles") return { data: [{ id: USER_ID, display_name: "Dana Kessler" }], error: null };
      if (q.op === "select") return { data: row, error: null };
      if (q.op === "update") return { data: { ...row, ...(q.payload as Partial<ScanRecord>) }, error: null };
      return { data: null, error: null };
    });

    const scan = await updateScan(row.case_number, { isPublic: true });

    expect(fake.queries[0].filters).toEqual([["eq", "case_number", row.case_number]]);
    expect(fake.queries.find((q) => q.op === "update")?.filters).toEqual([
      ["eq", "id", SCAN_ID],
      ["eq", "company_id", COMPANY_ID],
    ]);
    expect(fake.queries.find((q) => q.table === "profiles")?.filters).toEqual([["in", "id", [USER_ID]]]);
    expect(scan).toMatchObject({ isPublic: true, isOwner: true, submittedBy: "Dana Kessler", fileName: row.file_name });
  });

  it("hides another company's private scans", async () => {
    asViewer({ ...colleague, company: { ...HOOLI, id: "11111111-2222-4333-8444-555555555555" } });
    const fake = ownedRowAdmin({ user_id: USER_ID, company_id: COMPANY_ID });

    await expect(updateScan(SCAN_ID, { feedback: "correct" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.queries.some((q) => q.op === "update")).toBe(false);
  });

  it("rejects invalid patches from untrusted callers", async () => {
    ownedRowAdmin({ user_id: USER_ID });
    await expect(updateScan(SCAN_ID, { feedback: "meh" } as never)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(updateScan(SCAN_ID, {})).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("deleteScan", () => {
  it("removes the image, then the owner-scoped row", async () => {
    const fake = ownedRowAdmin({ user_id: USER_ID });
    let rowDeletedBeforeImage: boolean | undefined;
    fake.storage.remove.mockImplementation(async (paths: string[]) => {
      rowDeletedBeforeImage = fake.queries.some((q) => q.op === "delete");
      return { data: paths.map((name) => ({ name })), error: null };
    });

    await deleteScan(SCAN_ID);

    expect(fake.storage.remove).toHaveBeenCalledWith([`${USER_ID}/${SCAN_ID}.jpg`]);
    expect(rowDeletedBeforeImage).toBe(false);
    const del = fake.queries.find((q) => q.op === "delete");
    expect(del?.filters).toEqual([
      ["eq", "id", SCAN_ID],
      ["eq", "user_id", USER_ID],
    ]);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("stats", "max");
  });

  it("keeps the row when the image can't be removed, so the user can retry", async () => {
    const fake = ownedRowAdmin({ user_id: USER_ID });
    fake.storage.remove.mockResolvedValueOnce({ data: null, error: { message: "storage down" } });

    await expect(deleteScan(SCAN_ID)).rejects.toMatchObject({ code: "INTERNAL", retryable: true });
    expect(fake.queries.some((q) => q.op === "delete")).toBe(false);
  });

  it("skips storage for scans saved without an image", async () => {
    const fake = ownedRowAdmin({ user_id: USER_ID, image_path: null });

    await deleteScan(SCAN_ID);

    expect(fake.storage.remove).not.toHaveBeenCalled();
    expect(fake.queries.some((q) => q.op === "delete")).toBe(true);
  });

  it("lets a company colleague delete a company scan and refreshes the leaderboard", async () => {
    asViewer(colleague);
    const fake = ownedRowAdmin({ user_id: USER_ID, company_id: COMPANY_ID });

    await deleteScan(SCAN_ID);

    expect(fake.queries.find((q) => q.op === "delete")?.filters).toEqual([
      ["eq", "id", SCAN_ID],
      ["eq", "company_id", COMPANY_ID],
    ]);
    expect(mocks.invalidateLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("refuses non-owners without touching storage", async () => {
    const fake = ownedRowAdmin({ user_id: OTHER_USER_ID, is_public: true });
    await expect(deleteScan(SCAN_ID)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.storage.remove).not.toHaveBeenCalled();
    expect(fake.queries.some((q) => q.op === "delete")).toBe(false);
  });
});
