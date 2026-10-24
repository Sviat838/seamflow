import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { Scan } from "@/lib/types";
import { DELETE, GET as GET_ONE, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  createScan: vi.fn(),
  updateScan: vi.fn(),
  deleteScan: vi.fn(),
  listViewerScans: vi.fn(),
  getScanForViewer: vi.fn(),
}));

vi.mock("@/lib/scans/service", () => ({
  createScan: mocks.createScan,
  updateScan: mocks.updateScan,
  deleteScan: mocks.deleteScan,
}));
vi.mock("@/lib/scans/queries", () => ({
  listViewerScans: mocks.listViewerScans,
  getScanForViewer: mocks.getScanForViewer,
}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const ID = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const scan = { id: ID, verdict: "hot_dog", persisted: true } as Scan;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function upload(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest("http://localhost/api/v1/scans", {
    method: "POST",
    body: form,
    headers: { "x-request-id": "req_route" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/scans", () => {
  it("creates a scan from multipart and returns 201", async () => {
    mocks.createScan.mockResolvedValue(scan);
    const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], "dog.jpg", { type: "image/jpeg" });

    const res = await POST(upload({ image, public: "true" }));

    expect(res.status).toBe(201);
    expect(res.headers.get("X-Request-Id")).toBe("req_route");
    expect(await res.json()).toEqual({ scan });
    expect(mocks.createScan).toHaveBeenCalledWith(
      expect.objectContaining({
        isPublic: true,
        fileName: "dog.jpg",
        requestId: "req_route",
        headers: expect.any(Headers),
      }),
    );
    expect(mocks.createScan.mock.calls[0][0].file).toBeInstanceOf(File);
  });

  it("rejects non-multipart bodies and missing images with 400", async () => {
    const json = new NextRequest("http://localhost/api/v1/scans", {
      method: "POST",
      body: JSON.stringify({ image: "x" }),
      headers: { "content-type": "application/json" },
    });
    expect((await POST(json)).status).toBe(400);

    const res = await POST(upload({ public: "true" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: "INVALID_REQUEST", requestId: "req_route" });
    expect(mocks.createScan).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before parsing it", async () => {
    const req = upload({ image: new File(["x"], "a.jpg") });
    req.headers.set("content-length", String(10 * 1024 * 1024));
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(mocks.createScan).not.toHaveBeenCalled();
  });

  it("returns 402 QUOTA_EXCEEDED once the Free plan is used up", async () => {
    mocks.createScan.mockRejectedValue(new AppError("QUOTA_EXCEEDED", "Your Free plan's 20 classifications have all been used."));
    const res = await POST(upload({ image: new File(["x"], "a.jpg") }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toEqual({
      code: "QUOTA_EXCEEDED",
      message: "Your Free plan's 20 classifications have all been used.",
      requestId: "req_route",
    });
  });

  it("maps service errors, including Retry-After", async () => {
    mocks.createScan.mockRejectedValue(new AppError("RATE_LIMITED", "Slow down.", { retryAfterSeconds: 42 }));
    const res = await POST(upload({ image: new File(["x"], "a.jpg") }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });
});

describe("GET /api/v1/scans", () => {
  it("passes validated paging params through", async () => {
    mocks.listViewerScans.mockResolvedValue({ scans: [scan], nextCursor: "next" });
    const res = await GET(new NextRequest("http://localhost/api/v1/scans?limit=5&cursor=abc"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scans: [scan], nextCursor: "next" });
    expect(mocks.listViewerScans).toHaveBeenCalledWith({ limit: 5, cursor: "abc" });
  });

  it("rejects an out-of-range limit", async () => {
    const res = await GET(new NextRequest("http://localhost/api/v1/scans?limit=500"));
    expect(res.status).toBe(400);
    expect(mocks.listViewerScans).not.toHaveBeenCalled();
  });
});

describe("/api/v1/scans/[id]", () => {
  it("GET returns 404 when the scan isn't visible", async () => {
    mocks.getScanForViewer.mockResolvedValue(null);
    const res = await GET_ONE(new NextRequest(`http://localhost/api/v1/scans/${ID}`), params(ID));
    expect(res.status).toBe(404);
  });

  it("PATCH validates the JSON body", async () => {
    const bad = new NextRequest(`http://localhost/api/v1/scans/${ID}`, { method: "PATCH", body: "{not json" });
    expect((await PATCH(bad, params(ID))).status).toBe(400);

    const wrong = new NextRequest(`http://localhost/api/v1/scans/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ feedback: "meh" }),
    });
    expect((await PATCH(wrong, params(ID))).status).toBe(400);
    expect(mocks.updateScan).not.toHaveBeenCalled();

    mocks.updateScan.mockResolvedValue({ ...scan, feedback: "correct" });
    const ok = new NextRequest(`http://localhost/api/v1/scans/${ID}`, {
      method: "PATCH",
      body: JSON.stringify({ feedback: "correct" }),
    });
    const res = await PATCH(ok, params(ID));
    expect(res.status).toBe(200);
    expect(mocks.updateScan).toHaveBeenCalledWith(ID, { feedback: "correct" });
  });

  it("DELETE returns 204 with no body, or the owner error", async () => {
    mocks.deleteScan.mockResolvedValue(undefined);
    const res = await DELETE(new NextRequest(`http://localhost/api/v1/scans/${ID}`, { method: "DELETE" }), params(ID));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();

    mocks.deleteScan.mockRejectedValue(new AppError("FORBIDDEN", "Only the owner can change this scan."));
    const denied = await DELETE(
      new NextRequest(`http://localhost/api/v1/scans/${ID}`, { method: "DELETE" }),
      params(ID),
    );
    expect(denied.status).toBe(403);
  });
});
