import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { CertificateSummary } from "@/lib/types";
import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({ updateCertificateProduct: vi.fn() }));

vi.mock("@/lib/certificates/service", () => ({ updateCertificateProduct: mocks.updateCertificateProduct }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SCAN_ID = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
const certificate = { number: "HDX-C-0088301", productName: "Stadium Frank, 6 in.", sku: "BH-SF-06" } as CertificateSummary;
const params = { params: Promise.resolve({ scanId: SCAN_ID }) };
const patch = (body: string) =>
  new NextRequest(`http://localhost/api/v1/certificates/${SCAN_ID}`, {
    method: "PATCH",
    body,
    headers: { "content-type": "application/json", "x-request-id": "req_cert" },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/certificates/[scanId]", () => {
  it("updates the product details and returns the certificate", async () => {
    mocks.updateCertificateProduct.mockResolvedValue(certificate);

    const res = await PATCH(patch(JSON.stringify({ productName: " Stadium Frank, 6 in. ", sku: "BH-SF-06" })), params);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-Id")).toBe("req_cert");
    expect(await res.json()).toEqual({ certificate });
    expect(mocks.updateCertificateProduct).toHaveBeenCalledWith(SCAN_ID, { productName: "Stadium Frank, 6 in.", sku: "BH-SF-06" });
  });

  it("rejects bodies that aren't JSON or aren't a valid patch", async () => {
    let res = await PATCH(patch("{"), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST", message: "The request body must be JSON." } });

    res = await PATCH(patch(JSON.stringify({ price: 3 })), params);
    expect(res.status).toBe(400);
    expect(mocks.updateCertificateProduct).not.toHaveBeenCalled();
  });

  it("passes service errors through with their status", async () => {
    mocks.updateCertificateProduct.mockRejectedValue(new AppError("NOT_FOUND", "We couldn't find that scan."));

    const res = await PATCH(patch(JSON.stringify({ sku: null })), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND", requestId: "req_cert" } });
  });
});
