import { describe, expect, it } from "vitest";
import { siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("prefers the production domain", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "hdx.app", VERCEL_URL: "x.vercel.app" }).href).toBe("https://hdx.app/");
  });

  it("falls back to the deployment URL", () => {
    expect(siteUrl({ VERCEL_URL: "seamflow-abc.vercel.app" }).origin).toBe("https://seamflow-abc.vercel.app");
  });

  it("keeps an explicit protocol", () => {
    expect(siteUrl({ VERCEL_URL: "http://localhost:4000" }).origin).toBe("http://localhost:4000");
  });

  it("uses localhost when nothing is set", () => {
    expect(siteUrl({}).origin).toBe("http://localhost:3000");
    expect(siteUrl({ VERCEL_URL: " " }).origin).toBe("http://localhost:3000");
  });
});
