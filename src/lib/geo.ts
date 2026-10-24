// Coarse processing region for the public feed, from Vercel's geo headers. Pure, so it's cheap to
// test; the headers are set by the platform (clients can't spoof them on Vercel) and absent locally.
import type { RegionCode } from "@/lib/types";

// US states (and DC) by rough time zone. Anything not listed in E or W is Central.
const US_EAST = new Set([
  "CT", "DC", "DE", "FL", "GA", "IN", "KY", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC",
  "VA", "VT", "WV",
]);
const US_WEST = new Set(["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NM", "NV", "OR", "UT", "WA", "WY"]);

// Canadian provinces and territories follow the nearest US region.
const CA_WEST = new Set(["BC", "AB", "YT", "NT"]);
const CA_CENTRAL = new Set(["SK", "MB", "NU"]);

const COUNTRY_REGIONS: Partial<Record<RegionCode, readonly string[]>> = {
  // Western Europe and the Atlantic edge.
  "EU-W": ["GB", "IE", "FR", "ES", "PT", "BE", "NL", "LU", "MC", "AD", "GI", "IM", "JE", "GG"],
  // The Nordics and the Baltics.
  "EU-N": ["SE", "NO", "FI", "DK", "IS", "FO", "AX", "SJ", "GL", "EE", "LV", "LT"],
  // Central, southern and eastern Europe, plus the Levant and Turkey (closest to Frankfurt).
  "EU-C": [
    "DE", "AT", "CH", "LI", "IT", "SM", "VA", "MT", "PL", "CZ", "SK", "HU", "SI", "HR", "BA", "RS", "ME", "MK", "AL",
    "XK", "RO", "BG", "GR", "CY", "MD", "UA", "BY", "RU", "TR", "IL", "PS", "JO", "LB", "SY", "GE", "AM", "AZ",
  ],
  // The Gulf and South/Central Asia are closest to Mumbai.
  "AP-S": [
    "IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF", "IR", "IQ", "SA", "AE", "QA", "BH", "KW", "OM", "YE", "KZ", "UZ",
    "TM", "KG", "TJ",
  ],
  "AP-NE": ["JP", "KR", "KP", "CN", "TW", "HK", "MO", "MN"],
  // Mexico and Central America sit nearest the central US.
  "US-C": ["MX", "GT", "BZ", "SV", "HN", "NI", "CR", "PA"],
};

const BY_COUNTRY = new Map<string, RegionCode>(
  Object.entries(COUNTRY_REGIONS).flatMap(([region, countries]) =>
    countries.map((country) => [country, region as RegionCode] as const),
  ),
);

// Everything else on a continent goes to that continent's region (Caribbean → US-E, Oceania → AP-SE).
const BY_CONTINENT: Record<string, RegionCode> = {
  NA: "US-E",
  SA: "SA-E",
  EU: "EU-C",
  AF: "AF-S",
  AS: "AP-SE",
  OC: "AP-SE",
};

function headerCode(headers: Headers, name: string, pattern: RegExp): string | null {
  const value = headers.get(name)?.trim().toUpperCase();
  return value && pattern.test(value) ? value : null;
}

function usRegion(state: string | null): RegionCode {
  if (state && US_EAST.has(state)) return "US-E";
  if (state && US_WEST.has(state)) return "US-W";
  // Unknown state: the middle of the country is the least-wrong guess.
  return "US-C";
}

function canadaRegion(province: string | null): RegionCode {
  if (province && CA_WEST.has(province)) return "US-W";
  if (province && CA_CENTRAL.has(province)) return "US-C";
  return "US-E";
}

/** Maps x-vercel-ip-country / -country-region / -continent to a REGION_CODES entry; null when unknown. */
export function regionFromHeaders(headers: Headers): RegionCode | null {
  const country = headerCode(headers, "x-vercel-ip-country", /^[A-Z]{2}$/);
  const subdivision = headerCode(headers, "x-vercel-ip-country-region", /^[A-Z0-9]{1,3}$/);
  const continent = headerCode(headers, "x-vercel-ip-continent", /^[A-Z]{2}$/);

  if (country === "US") return usRegion(subdivision);
  if (country === "CA") return canadaRegion(subdivision);
  const byCountry = country ? BY_COUNTRY.get(country) : undefined;
  if (byCountry) return byCountry;
  // Antarctica ("AN") and unknown continents have no sensible region.
  return (continent && BY_CONTINENT[continent]) || null;
}
