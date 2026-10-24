import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/lib/ai/image";
import { slugify } from "@/lib/companies/slug";
import { FREE_CLASSIFICATION_LIMIT, MAX_IMAGE_BYTES, REGION_CODES } from "@/lib/types";
import { emailFor, IMAGES_PER_COMPANY, SEED_COMPANIES } from "./companies";
import { planCompanyShots } from "./plan";
import { renderShot } from "./render";

describe("seed companies", () => {
  it("are ten distinct accounts with valid slugs, regions and example-domain emails", () => {
    expect(SEED_COMPANIES).toHaveLength(10);
    expect(new Set(SEED_COMPANIES.map((c) => c.slug)).size).toBe(10);
    expect(new Set(SEED_COMPANIES.map((c) => c.name.toLowerCase())).size).toBe(10);
    for (const company of SEED_COMPANIES) {
      expect(slugify(company.name)).toMatch(/^[a-z0-9-]+$/);
      expect(REGION_CODES).toContain(company.region);
      expect(emailFor(company)).toBe(`qa+${company.slug}@hdx-demo.example`);
      expect(company.name.length).toBeLessThanOrEqual(80);
    }
  });

  it("spread from top-tier to struggling, with a few non-hot-dog shots", () => {
    const qualities = SEED_COMPANIES.map((c) => c.quality);
    expect(Math.max(...qualities) - Math.min(...qualities)).toBeGreaterThan(0.6);
    const offKinds = SEED_COMPANIES.reduce((n, c) => n + c.offKind.length, 0);
    expect(offKinds).toBeGreaterThanOrEqual(8);
    expect(offKinds).toBeLessThanOrEqual(20);
  });
});

describe("planCompanyShots", () => {
  it("plans exactly the free-plan allowance per company, with unique stable file names", () => {
    expect(IMAGES_PER_COMPANY).toBe(FREE_CLASSIFICATION_LIMIT);
    for (const company of SEED_COMPANIES) {
      const shots = planCompanyShots(company);
      expect(shots).toHaveLength(IMAGES_PER_COMPANY);
      expect(new Set(shots.map((s) => s.fileName)).size).toBe(IMAGES_PER_COMPANY);
      expect(shots.filter((s) => s.spec.kind !== "hot_dog").map((s) => s.spec.kind).sort()).toEqual([...company.offKind].sort());
      for (const shot of shots) {
        expect(shot.fileName.length).toBeLessThanOrEqual(120);
        expect(shot.minutesAgo).toBeGreaterThanOrEqual(3);
        expect(shot.minutesAgo).toBeLessThanOrEqual(360);
      }
    }
  });

  it("is deterministic, so re-runs line up with scans that already exist", () => {
    const company = SEED_COMPANIES[4];
    expect(planCompanyShots(company)).toEqual(planCompanyShots(company));
  });

  it("plans more defects for lower-quality companies", () => {
    const defects = (slug: string) => {
      const shots = planCompanyShots(SEED_COMPANIES.find((c) => c.slug === slug)!).filter((s) => s.spec.kind === "hot_dog");
      return shots.filter((s) => s.spec.sausage.doneness === "burnt" || s.spec.bun.condition !== "fresh" || s.spec.toppings.mustard === "landslide").length;
    };
    expect(defects("stadium-frank-supply")).toBeLessThan(defects("harbourside-snag-stand"));
    expect(defects("harbourside-snag-stand")).toBeLessThan(defects("pitstop-pups-forecourt-group"));
  });
});

describe("renderShot", () => {
  it("renders unique, valid JPEGs the app accepts", async () => {
    const shots = [...planCompanyShots(SEED_COMPANIES[0]).slice(0, 2), ...planCompanyShots(SEED_COMPANIES[9]).slice(0, 2)];
    const images = await Promise.all(shots.map((s) => renderShot(s.spec)));
    for (const image of images) {
      expect(sniffImageType(image)).toBe("image/jpeg");
      expect(image.byteLength).toBeLessThan(MAX_IMAGE_BYTES);
    }
    const hashes = images.map((image) => createHash("sha256").update(image).digest("hex"));
    expect(new Set(hashes).size).toBe(images.length);
  });
});
