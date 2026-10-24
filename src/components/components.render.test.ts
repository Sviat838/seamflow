// Smoke-renders the shared components to HTML: catches runtime errors and checks the
// accessibility wiring that matters (live regions, labels, aria-current, real QR output).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FeedSnapshot, Usage, Viewer } from "@/lib/types";

vi.mock("@/app/actions/auth", () => ({ signOut: async () => {}, signInWithGoogle: async () => {} }));
// Outside a Next app there is no mounted router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/cases" }));

const { QrCode } = await import("./brand/qr-code");
const { Seal } = await import("./brand/seal");
const { Wordmark } = await import("./brand/wordmark");
const { GlobalFeedTable } = await import("./feed/global-feed-table");
const { FeedStats } = await import("./feed/feed-stats");
const { LiveFeed } = await import("./feed/live-feed");
const { AppShell } = await import("./layout/app-shell");
const { SiteFooter } = await import("./layout/site-footer");
const { SiteHeader } = await import("./layout/site-header");
const { Button } = await import("./ui/button");
const { Field, Input } = await import("./ui/form");
const { KeyValueList } = await import("./ui/table");
const { RatingBadge } = await import("./verdict/rating-badge");
const { VerdictBand, VerdictStats } = await import("./verdict/verdict-band");
const { VerdictChip } = await import("./verdict/verdict-chip");

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

const snapshot: FeedSnapshot = {
  items: [
    { key: "1", time: "2026-10-24T14:32:07Z", region: "EU-C", verdict: "hot_dog", confidence: 0.992, highlight: true },
    { key: "2", time: "2026-10-24T14:32:06Z", region: null, verdict: "not_hot_dog", confidence: 0.974, highlight: false },
  ],
  verdictsToday: 1204,
  hotDogShareToday: 0.314,
  ambiguousAllTime: 0,
  p50LatencyMs: 412,
  generatedAt: "2026-10-24T14:32:08Z",
};

const anonymous: Viewer = {
  isAuthenticated: false,
  userId: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  jobTitle: null,
  company: null,
  needsOnboarding: false,
};

const dana: Viewer = {
  ...anonymous,
  isAuthenticated: true,
  userId: "u1",
  email: "dana@ballpark.example",
  displayName: "Dana Kessler",
  jobTitle: "Quality Lead",
  company: { id: "c1", name: "Ballpark Holdings — QA", slug: "ballpark", plan: "free", role: "owner", isListed: true },
};

const freeUsage: Usage = { plan: "free", used: 3, limit: 20, remaining: 17 };

describe("brand", () => {
  it("renders a real QR with a quiet zone and an accessible name", () => {
    const html = render(h(QrCode, { value: "https://example.test/v/7KQ2-M9XD", label: "QR for 7KQ2-M9XD", size: "40mm" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QR for 7KQ2-M9XD"');
    expect(html).toContain('width="40mm"');
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html).toMatch(/viewBox="0 0 (\d+) \1"/);
    expect(html).toContain('transform="translate(4 4)"');
  });

  it("renders decorative brand marks", () => {
    expect(render(h(Seal))).toContain('aria-hidden="true"');
    expect(render(h(Wordmark, { size: "lg" }))).toContain('aria-label="HDX home"');
    expect(render(h(Wordmark, { href: null, descriptor: "line", tone: "navy" }))).not.toContain("<a");
  });
});

describe("verdict", () => {
  it("announces the band politely and shows the review state", () => {
    const html = render(
      h(
        VerdictBand,
        { verdict: "not_hot_dog", policyClause: "3.5", reviewStatus: "pending", live: true, headingId: "v" },
        h(VerdictStats, { verdict: "not_hot_dog", items: [{ label: "Confidence", value: "98.7%" }] }),
      ),
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-labelledby="v"');
    expect(html).toContain("NOT HOT DOG");
    expect(html).toContain("Under review");
    expect(html).toContain('href="/policy#clause-3-5"');
    expect(html).toContain('data-tone="navy"');
  });

  it("renders chips and ratings", () => {
    expect(render(h(VerdictChip, { verdict: "hot_dog" }))).toContain("HOT DOG");
    expect(render(h(RatingBadge, { rating: null }))).toBe("");
    expect(render(h(RatingBadge, { rating: 92, size: "sm" }))).toContain("HDX Rating 92 out of 100, Exemplary");
  });
});

describe("ui", () => {
  it("renders buttons as button, link or anchor", () => {
    expect(render(h(Button, null, "Go"))).toContain('type="button"');
    expect(render(h(Button, { href: "/classify" }, "Go"))).toContain('href="/classify"');
    expect(render(h(Button, { href: "/x.pdf", external: true, download: true }, "PDF"))).toContain('download=""');
    const pending = render(h(Button, { pending: true }, "Saving"));
    expect(pending).toContain('aria-busy="true"');
    expect(pending).toContain("disabled");
  });

  it("wires fields to hints and errors", () => {
    const html = render(
      h(Field, { id: "company", label: "Company name", hint: "As on certificates.", error: "Required.", children: (aria) => h(Input, aria) }),
    );
    expect(html).toContain('for="company"');
    expect(html).toContain('aria-describedby="company-hint company-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="company-error"');
  });

  it("renders zebra key/value rows", () => {
    const html = render(h(KeyValueList, { rows: [{ label: "Case ID", value: "HDX-1" }, { label: "Model", value: "m" }] }));
    expect(html).toContain("bg-ground");
    expect(html).toContain("bg-white");
  });
});

describe("feed", () => {
  it("renders the table with the highlighted case and footnote", () => {
    const html = render(h(GlobalFeedTable, { items: snapshot.items }));
    expect(html).toContain("<caption");
    expect(html).toContain("This case");
    expect(html).toContain("bg-mustard-tint");
    expect(html).toContain("Unknown region");
    expect(html).toContain("Images never leave your workspace.");
  });

  it("renders the live card with honest numbers", () => {
    const html = render(h(LiveFeed, { initial: snapshot, caseNumber: "HDX-2026-1024-7731" }));
    expect(html).toContain("Live · 1,204 verdicts today");
    expect(html).toContain("31.4% hot dogs");
    expect(html).not.toContain("verdicts/s");
    expect(render(h(FeedStats, { snapshot, include: ["p50"] }))).toContain("412 ms");
  });
});

describe("layout", () => {
  it("renders the public header and footer", () => {
    const header = render(h(SiteHeader, { viewer: dana }));
    expect(header).toContain("Open workspace");
    expect(header).not.toContain(">Sign in<");
    expect(render(h(SiteHeader))).toContain(">Sign in<");
    const footer = render(h(SiteFooter));
    expect(footer).toContain('href="/policy"');
    expect(footer).not.toContain('href="#"');
  });

  it("renders the workspace shell for a member", () => {
    const html = render(
      h(AppShell, { viewer: dana, usage: freeUsage, active: "cases", breadcrumb: [{ label: "History", href: "/cases" }, { label: "HDX-1" }], region: "EU-C", children: "content" }),
    );
    expect(html).toContain('id="main"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Ballpark Holdings — QA");
    expect(html).toContain("Quality Lead · Owner");
    expect(html).toContain("3</strong> of 20 classifications used");
    expect(html).toContain("EU-Central");
    expect(html).toContain('href="/contact?source=workspace"');
  });

  it("locks company pages for visitors", () => {
    const html = render(h(AppShell, { viewer: anonymous, usage: { plan: "anonymous", used: 5, limit: 20, remaining: 15 }, children: "x" }));
    expect(html).toContain("Guest session");
    expect(html).toContain('href="/sign-in?next=%2Fcertificates"');
    expect(html).toContain("5</strong> of 20 used");
  });

  it("shows Business usage as unlimited", () => {
    const html = render(h(AppShell, { viewer: dana, usage: { plan: "business", used: 1234, limit: null, remaining: null }, children: "x" }));
    expect(html).toContain("Business plan · unlimited");
  });
});
