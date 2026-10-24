import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CERTIFICATE } from "@/lib/certificates/sample";
import { AppError } from "@/lib/errors";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getPublicCertificate: vi.fn(),
  renderCertificatePdf: vi.fn(),
}));

vi.mock("@/lib/certificates/service", () => ({ getPublicCertificate: mocks.getPublicCertificate }));
vi.mock("@/lib/pdf/certificate", () => ({ renderCertificatePdf: mocks.renderCertificatePdf }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const PDF = new TextEncoder().encode("%PDF-1.3 fake");
const params = (code: string) => ({ params: Promise.resolve({ code }) });
const request = (headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/v/7KQ2-M9XD/certificate.pdf", { headers: { "x-request-id": "req_pdf", ...headers } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.renderCertificatePdf.mockResolvedValue(PDF);
});

describe("GET /v/[code]/certificate.pdf", () => {
  it("downloads the PDF without counting a verification", async () => {
    mocks.getPublicCertificate.mockResolvedValue(SAMPLE_CERTIFICATE);

    const res = await GET(request({ "x-forwarded-host": "hdx.app", "x-forwarded-proto": "https" }), params("7kq2m9xd"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="HDX-Certificate-HDX-C-0088213.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    expect(res.headers.get("X-Request-Id")).toBe("req_pdf");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(mocks.getPublicCertificate).toHaveBeenCalledWith("7kq2m9xd");
    // The QR targets the host the visitor used.
    expect(mocks.renderCertificatePdf).toHaveBeenCalledWith(SAMPLE_CERTIFICATE, { origin: "https://hdx.app" });
  });

  it("falls back to the request URL's origin when forwarding headers are missing", async () => {
    mocks.getPublicCertificate.mockResolvedValue(SAMPLE_CERTIFICATE);
    await GET(request(), params("7KQ2-M9XD"));
    expect(mocks.renderCertificatePdf).toHaveBeenCalledWith(SAMPLE_CERTIFICATE, { origin: "http://localhost:3000" });
  });

  it("serves the app's 404 for unknown codes", async () => {
    mocks.getPublicCertificate.mockResolvedValue(null);
    await expect(GET(request(), params("ZZZZ-ZZZZ"))).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    expect(mocks.renderCertificatePdf).not.toHaveBeenCalled();
  });

  it("maps lookup failures to a JSON error", async () => {
    mocks.getPublicCertificate.mockRejectedValue(new AppError("INTERNAL", "We couldn't check that certificate right now."));

    const res = await GET(request(), params("7KQ2-M9XD"));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "INTERNAL", requestId: "req_pdf" } });
  });
});
