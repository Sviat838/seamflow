import { describe, expect, it } from "vitest";
import { isCompanySlug, normalizeText, slugCandidates, slugify, withSlugSuffix } from "./slug";

describe("normalizeText", () => {
  it("trims and collapses whitespace, including tabs, newlines and NBSP", () => {
    expect(normalizeText("  Ballpark\t\tHoldings \n Inc\u00a0 ")).toBe("Ballpark Holdings Inc");
  });

  it("drops control and zero-width characters", () => {
    expect(normalizeText("Ball\u200bpark\u0007 Holdings\ufeff")).toBe("Ballpark Holdings");
  });

  it("composes accents (NFC) so look-alike names compare equal", () => {
    expect(normalizeText("Cafe\u0301")).toBe("Caf\u00e9");
  });
});

describe("slugify", () => {
  it.each([
    ["Ballpark Holdings", "ballpark-holdings"],
    ["  Stadium   Frank, Inc. ", "stadium-frank-inc"],
    ["Café Royal & Sons", "cafe-royal-and-sons"],
    ["Joe's Hot Dogs", "joes-hot-dogs"],
    ["Müller Straße GmbH", "muller-strasse-gmbh"],
    ["Øresund Æble", "oresund-aeble"],
    ["Київський хот-дог", "kyivskyi-khot-doh"],
    ["--Hot__Dog--", "hot-dog"],
    ["3M", "3m"],
  ])("%j -> %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("falls back when nothing slug-able is left", () => {
    expect(slugify("日本")).toBe("company");
    expect(slugify("Ä")).toBe("company");
  });

  it("caps the length at 60 without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(59)} b c`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(isCompanySlug(slug)).toBe(true);
  });

  it("always returns a slug the database accepts", () => {
    for (const name of ["A&B", "!!", "x".repeat(200), "Résumé & Co.", "\u{1F32D}\u{1F32D}"]) {
      expect(isCompanySlug(slugify(name))).toBe(true);
    }
  });
});

describe("slug suffixes", () => {
  it("lists base, base-2, base-3 ...", () => {
    expect(slugCandidates("acme", 3)).toEqual(["acme", "acme-2", "acme-3"]);
  });

  it("shortens long bases so the suffixed slug still fits", () => {
    const base = `${"a".repeat(55)}-bbbb`;
    const suffixed = withSlugSuffix(base, "12");
    expect(suffixed.length).toBeLessThanOrEqual(60);
    expect(suffixed.endsWith("-12")).toBe(true);
    expect(isCompanySlug(suffixed)).toBe(true);
  });
});

describe("isCompanySlug", () => {
  it.each(["ab", "ballpark-holdings", "3m"])("accepts %j", (slug) => {
    expect(isCompanySlug(slug)).toBe(true);
  });

  it.each(["", "a", "Acme", "acme--inc", "-acme", "acme-", "acme_inc", "a".repeat(61), 42, null])(
    "rejects %j",
    (slug) => {
      expect(isCompanySlug(slug)).toBe(false);
    },
  );
});
