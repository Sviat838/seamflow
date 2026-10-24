import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { CertificateSummary } from "@/lib/types";
import { updateCertificateProductAction } from "./certificates";

const mocks = vi.hoisted(() => ({ updateCertificateProduct: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/certificates/service", () => ({ updateCertificateProduct: mocks.updateCertificateProduct }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-request-id": "req_action" }) }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const SCAN_ID = "3e7f2a1b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateCertificateProductAction", () => {
  it("returns the certificate and refreshes the route", async () => {
    const certificate = { number: "HDX-C-0088301", sku: "BH-SF-06" } as CertificateSummary;
    mocks.updateCertificateProduct.mockResolvedValue(certificate);

    expect(await updateCertificateProductAction(SCAN_ID, { sku: "BH-SF-06" })).toEqual({ ok: true, data: certificate });
    expect(mocks.updateCertificateProduct).toHaveBeenCalledWith(SCAN_ID, { sku: "BH-SF-06" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("returns errors as values instead of throwing", async () => {
    mocks.updateCertificateProduct.mockRejectedValue(new AppError("FORBIDDEN", "Only the owner can change this scan."));

    expect(await updateCertificateProductAction(SCAN_ID, { productName: "x" })).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Only the owner can change this scan.", requestId: "req_action" },
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
