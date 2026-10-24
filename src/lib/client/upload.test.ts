import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scan } from "@/lib/types";
import { errorCopy, ScanRequestError } from "./errors";
import { parseRetryAfter, parseScanResponse, SCANS_ENDPOINT, uploadScan } from "./upload";

const scan: Scan = {
  id: "8f6c1e2a-0000-4000-8000-000000000001",
  shareSlug: "abc123",
  verdict: "hot_dog",
  confidence: 0.98,
  summary: "Asset confirmed as hot dog.",
  reasoning: "Sausage in bun, mustard present.",
  detectedItems: ["sausage", "bun", "mustard"],
  flags: [],
  imageUrl: null,
  isPublic: false,
  feedback: null,
  model: "claude-test",
  latencyMs: 1200,
  cached: false,
  persisted: true,
  isOwner: true,
  createdAt: "2026-10-24T12:00:00.000Z",
  caseNumber: "HDX-2026-1024-0001",
  policyClause: "2.1",
  rating: 88,
  ratingNote: null,
  region: null,
  fileName: "dog.jpg",
  imageBytes: null,
  imageExpiresAt: null,
  imageDeleted: false,
  reviewStatus: null,
  certificate: null,
  submittedBy: null,
};

function catchError(fn: () => unknown): ScanRequestError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ScanRequestError) return error;
    throw error;
  }
  throw new Error("expected a ScanRequestError");
}

describe("parseScanResponse", () => {
  it("returns the scan from a 201", () => {
    expect(parseScanResponse({ status: 201, body: JSON.stringify({ scan }) })).toEqual(scan);
  });

  it("treats a 2xx without a scan as INTERNAL", () => {
    const error = catchError(() =>
      parseScanResponse({ status: 200, body: "<html>proxy page</html>", requestId: "req_h" }),
    );
    expect(error).toMatchObject({ code: "INTERNAL", requestId: "req_h", status: 200 });
  });

  it("reads code, message, requestId and retryAfterSeconds from ApiErrorBody", () => {
    const body = {
      error: { code: "RATE_LIMITED", message: "Scan limit reached.", requestId: "req_body", retryAfterSeconds: 42 },
    };
    const error = catchError(() =>
      parseScanResponse({ status: 429, body: JSON.stringify(body), requestId: "req_header", retryAfter: "99" }),
    );
    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      message: "Scan limit reached.",
      requestId: "req_body",
      retryAfterSeconds: 42,
      status: 429,
    });
  });

  it("falls back to headers when the body omits requestId and retryAfterSeconds", () => {
    const body = { error: { code: "RATE_LIMITED", message: "Slow down." } };
    const error = catchError(() =>
      parseScanResponse({ status: 429, body: JSON.stringify(body), requestId: "req_header", retryAfter: "17" }),
    );
    expect(error).toMatchObject({ requestId: "req_header", retryAfterSeconds: 17 });
  });

  it.each([
    [413, "Request Entity Too Large", "IMAGE_TOO_LARGE"],
    [504, "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT", "AI_TIMEOUT"],
    [502, "Bad gateway", "INTERNAL"],
    [429, "", "RATE_LIMITED"],
    [0, "", "NETWORK_ERROR"],
  ] as const)("maps a non-JSON %i to %s with house copy", (status, body, code) => {
    const error = catchError(() => parseScanResponse({ status, body }));
    expect(error.code).toBe(code);
    expect(error.message).toBe(errorCopy(code).body);
  });

  it("maps unknown error codes by status instead of passing them through", () => {
    const body = { error: { code: "BRAND_NEW_CODE", message: "Server says no.", requestId: "req_x" } };
    const error = catchError(() => parseScanResponse({ status: 415, body: JSON.stringify(body) }));
    expect(error).toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Server says no.", requestId: "req_x" });
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");

  it("parses delta seconds and HTTP dates", () => {
    expect(parseRetryAfter("120", now)).toBe(120);
    expect(parseRetryAfter("Sat, 24 Oct 2026 12:01:30 GMT", now)).toBe(90);
  });

  it("ignores missing, zero, past and garbage values", () => {
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter("0", now)).toBeUndefined();
    expect(parseRetryAfter("Sat, 24 Oct 2026 11:00:00 GMT", now)).toBeUndefined();
    expect(parseRetryAfter("soon", now)).toBeUndefined();
  });
});

// Minimal XMLHttpRequest double: records the request and lets each test drive the events.
class FakeXHR {
  static instances: FakeXHR[] = [];
  method = "";
  url = "";
  body: FormData | null = null;
  requestHeaders: Record<string, string> = {};
  responseHeaders: Record<string, string> = {};
  status = 0;
  responseText = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  aborted = false;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name.toLowerCase()] = value;
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  respond(status: number, body: string, headers: Record<string, string> = {}) {
    this.status = status;
    this.responseText = body;
    this.responseHeaders = headers;
    this.onload?.();
  }
}

describe("uploadScan", () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "lunch.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastXhr = () => FakeXHR.instances.at(-1)!;

  it("posts multipart image + public and reports progress", async () => {
    const onProgress = vi.fn();
    const promise = uploadScan(file, { isPublic: true, onProgress });
    const xhr = lastXhr();

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe(SCANS_ENDPOINT);
    expect(xhr.body?.get("public")).toBe("true");
    expect((xhr.body?.get("image") as File).name).toBe("lunch.jpg");

    xhr.progress(50, 100);
    xhr.upload.onload?.();
    xhr.respond(201, JSON.stringify({ scan }), { "x-request-id": "req_ok" });

    await expect(promise).resolves.toEqual(scan);
    expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
  });

  it("defaults public to false", async () => {
    const promise = uploadScan(file);
    lastXhr().respond(201, JSON.stringify({ scan }));
    await promise;
    expect(lastXhr().body?.get("public")).toBe("false");
  });

  it("rejects with the parsed API error", async () => {
    const promise = uploadScan(file);
    lastXhr().respond(
      503,
      JSON.stringify({ error: { code: "CAPACITY_EXCEEDED", message: "Budget spent.", requestId: "req_c" } }),
    );
    await expect(promise).rejects.toMatchObject({ code: "CAPACITY_EXCEEDED", requestId: "req_c", status: 503 });
  });

  it("rejects with NETWORK_ERROR when the request fails", async () => {
    const promise = uploadScan(file);
    lastXhr().onerror?.();
    await expect(promise).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("aborts the request when the signal fires", async () => {
    const controller = new AbortController();
    const promise = uploadScan(file, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "ABORTED" });
    expect(lastXhr().aborted).toBe(true);
  });

  it("never sends when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(uploadScan(file, { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    expect(FakeXHR.instances).toHaveLength(0);
  });
});
