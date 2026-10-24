import { describe, expect, it } from "vitest";
import { REGION_CODES } from "@/lib/types";
import { regionFromHeaders } from "./geo";

function geo(country?: string, region?: string, continent?: string): Headers {
  const headers = new Headers();
  if (country !== undefined) headers.set("x-vercel-ip-country", country);
  if (region !== undefined) headers.set("x-vercel-ip-country-region", region);
  if (continent !== undefined) headers.set("x-vercel-ip-continent", continent);
  return headers;
}

describe("regionFromHeaders", () => {
  it.each([
    ["NY", "US-E"],
    ["FL", "US-E"],
    ["TX", "US-C"],
    ["IL", "US-C"],
    ["CA", "US-W"],
    ["WA", "US-W"],
    ["HI", "US-W"],
  ])("splits US state %s into %s", (state, expected) => {
    expect(regionFromHeaders(geo("US", state, "NA"))).toBe(expected);
  });

  it("puts a US request without a state in the central region", () => {
    expect(regionFromHeaders(geo("US"))).toBe("US-C");
  });

  it("maps Canada by province", () => {
    expect(regionFromHeaders(geo("CA", "BC", "NA"))).toBe("US-W");
    expect(regionFromHeaders(geo("CA", "MB", "NA"))).toBe("US-C");
    expect(regionFromHeaders(geo("CA", "ON", "NA"))).toBe("US-E");
  });

  it.each([
    ["GB", "EU-W"],
    ["FR", "EU-W"],
    ["DE", "EU-C"],
    ["PL", "EU-C"],
    ["SE", "EU-N"],
    ["EE", "EU-N"],
  ])("splits European country %s into %s", (country, expected) => {
    expect(regionFromHeaders(geo(country, undefined, "EU"))).toBe(expected);
  });

  it.each([
    ["JP", "AS", "AP-NE"],
    ["KR", "AS", "AP-NE"],
    ["SG", "AS", "AP-SE"],
    ["AU", "OC", "AP-SE"],
    ["IN", "AS", "AP-S"],
    ["AE", "AS", "AP-S"],
    ["IL", "AS", "EU-C"],
    ["BR", "SA", "SA-E"],
    ["MX", "NA", "US-C"],
    ["ZA", "AF", "AF-S"],
    ["NG", "AF", "AF-S"],
  ])("maps %s (%s) to %s", (country, continent, expected) => {
    expect(regionFromHeaders(geo(country, undefined, continent))).toBe(expected);
  });

  it("falls back to the continent for countries without an explicit entry", () => {
    expect(regionFromHeaders(geo("JM", undefined, "NA"))).toBe("US-E");
    expect(regionFromHeaders(geo("XX", undefined, "EU"))).toBe("EU-C");
    expect(regionFromHeaders(geo(undefined, undefined, "SA"))).toBe("SA-E");
  });

  it("normalizes case and whitespace", () => {
    expect(regionFromHeaders(geo(" us ", "ny"))).toBe("US-E");
  });

  it("returns null when the location is unknown or garbage", () => {
    expect(regionFromHeaders(new Headers())).toBeNull();
    expect(regionFromHeaders(geo("AQ", undefined, "AN"))).toBeNull();
    expect(regionFromHeaders(geo("United States", undefined, "Earth"))).toBeNull();
  });

  it("only ever returns known region codes", () => {
    const countries = ["US", "CA", "GB", "DE", "SE", "JP", "SG", "IN", "BR", "ZA", "AE", "TR", "RU", "NZ", "MX"];
    for (const country of countries) {
      const region = regionFromHeaders(geo(country, undefined, "EU"));
      expect(region === null || (REGION_CODES as readonly string[]).includes(region)).toBe(true);
    }
  });
});
