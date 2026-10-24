import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES, RECOMMENDED_MAX_DIMENSION } from "@/lib/types";
import { fitWithin, prepareImage, toJpegName } from "./prepare-image";

// Node has no image decoding or canvas, so these tests stub createImageBitmap and OffscreenCanvas
// and check the decisions prepareImage makes around them.

const MB = 1024 * 1024;
let encodedSize: (quality: number) => number = () => 300_000;
let canvases: FakeCanvas[] = [];

class FakeContext {
  calls: string[] = [];
  fillStyle = "";
  imageSmoothingQuality = "low";
  fillRect() {
    this.calls.push(`fillRect:${this.fillStyle}`);
  }
  drawImage(_image: unknown, _x: number, _y: number, width: number, height: number) {
    this.calls.push(`drawImage:${width}x${height}`);
  }
}

class FakeCanvas {
  context = new FakeContext();
  qualities: number[] = [];
  constructor(
    public width: number,
    public height: number,
  ) {
    canvases.push(this);
  }
  getContext() {
    return this.context;
  }
  async convertToBlob({ type, quality }: { type: string; quality: number }) {
    this.qualities.push(quality);
    return new Blob([new Uint8Array(encodedSize(quality))], { type });
  }
}

function stubDecode(width: number, height: number) {
  const close = vi.fn();
  const decode = vi.fn(async () => ({ width, height, close }));
  vi.stubGlobal("createImageBitmap", decode);
  return { decode, close };
}

function fileOf(bytes: number, name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  canvases = [];
  encodedSize = () => 300_000;
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prepareImage", () => {
  it("returns small, upright, accepted files untouched", async () => {
    const { decode, close } = stubDecode(1200, 900);
    const file = fileOf(500_000, "dog.png", "image/png");

    await expect(prepareImage(file)).resolves.toBe(file);
    expect(decode).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(close).toHaveBeenCalled();
    expect(canvases).toHaveLength(0);
  });

  it("downscales big photos to a JPEG on a white backdrop", async () => {
    const { close } = stubDecode(4032, 3024);
    const file = fileOf(3 * MB, "IMG_0001.png", "image/png");

    const result = await prepareImage(file);

    expect(result).not.toBe(file);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0001.jpg");
    expect(result.size).toBe(300_000);
    expect(canvases[0]).toMatchObject({ width: RECOMMENDED_MAX_DIMENSION, height: 1176 });
    expect(canvases[0].context.calls).toEqual(["fillRect:#ffffff", `drawImage:${RECOMMENDED_MAX_DIMENSION}x1176`]);
    expect(canvases[0].qualities).toEqual([0.85]);
    expect(close).toHaveBeenCalled();
  });

  it("re-encodes types the API doesn't accept, even when small", async () => {
    stubDecode(800, 600);
    const result = await prepareImage(fileOf(200_000, "photo.heic", "image/heic"));
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("photo.jpg");
  });

  it("keeps the original when re-encoding wouldn't make it smaller", async () => {
    stubDecode(1500, 1000);
    const file = fileOf(3 * MB, "already-optimized.jpg", "image/jpeg");
    encodedSize = () => 3.5 * MB;
    await expect(prepareImage(file)).resolves.toBe(file);
  });

  it("lowers quality stepwise until the result fits", async () => {
    stubDecode(6000, 4000);
    encodedSize = (quality) => (quality > 0.6 ? MAX_IMAGE_BYTES + 1 : MAX_IMAGE_BYTES - 1);
    const result = await prepareImage(fileOf(8 * MB, "huge.jpg", "image/jpeg"));
    expect(result.size).toBe(MAX_IMAGE_BYTES - 1);
    expect(canvases[0].qualities).toEqual([0.85, 0.75, 0.65, 0.55]);
  });

  it("gives up with IMAGE_TOO_LARGE at the quality floor", async () => {
    const { close } = stubDecode(6000, 4000);
    encodedSize = () => MAX_IMAGE_BYTES + 1;
    await expect(prepareImage(fileOf(8 * MB, "noise.png", "image/png"))).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE",
    });
    expect(canvases[0].qualities).toEqual([0.85, 0.75, 0.65, 0.55, 0.45]);
    expect(close).toHaveBeenCalled();
  });

  it("honors maxDimension and quality options", async () => {
    stubDecode(2000, 1000);
    await prepareImage(fileOf(100_000, "wide.webp", "image/webp"), { maxDimension: 500, quality: 0.6 });
    expect(canvases[0]).toMatchObject({ width: 500, height: 250 });
    expect(canvases[0].qualities).toEqual([0.6]);
  });

  it("explains HEIC when the browser can't decode it", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("The source image could not be decoded.", "InvalidStateError");
      }),
    );
    await expect(prepareImage(fileOf(1000, "IMG_1234.HEIC", ""))).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: expect.stringContaining("HEIC"),
    });
  });

  it("rejects undecodable non-images with UNSUPPORTED_MEDIA_TYPE", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("bad", "InvalidStateError");
      }),
    );
    await expect(prepareImage(fileOf(1000, "notes.pdf", "application/pdf"))).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: expect.stringContaining("JPEG"),
    });
  });

  it("retries without options on engines that reject imageOrientation", async () => {
    const close = vi.fn();
    const decode = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("invalid enum value"))
      .mockResolvedValueOnce({ width: 100, height: 100, close });
    vi.stubGlobal("createImageBitmap", decode);
    const file = fileOf(1000, "tiny.gif", "image/gif");

    await expect(prepareImage(file)).resolves.toBe(file);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(decode).toHaveBeenLastCalledWith(file);
  });

  it("passes files through when the browser has no createImageBitmap", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const file = fileOf(1000, "a.jpg", "image/jpeg");
    await expect(prepareImage(file)).resolves.toBe(file);
  });
});

describe("helpers", () => {
  it("fitWithin scales the long edge and never upscales", () => {
    expect(fitWithin(4032, 3024, 1568)).toEqual({ width: 1568, height: 1176 });
    expect(fitWithin(3024, 4032, 1568)).toEqual({ width: 1176, height: 1568 });
    expect(fitWithin(800, 600, 1568)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 1568)).toEqual({ width: 1568, height: 1 });
  });

  it("toJpegName swaps the extension", () => {
    expect(toJpegName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
    expect(toJpegName("my.lunch.png")).toBe("my.lunch.jpg");
    expect(toJpegName("noext")).toBe("noext.jpg");
    expect(toJpegName("")).toBe("scan.jpg");
    expect(toJpegName(".png")).toBe("scan.jpg");
  });
});
