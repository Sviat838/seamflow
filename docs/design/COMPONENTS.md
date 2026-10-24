# HDX component reference

Shared UI for every page. Written by the UI foundation session; page sessions build from it. Everything here is a Server Component unless marked **client**. Import with the `@/` alias, for example `import { Button } from "@/components/ui/button"`.

Rules that apply everywhere:

- **Tokens, not hex.** Use the Tailwind tokens below (`bg-navy`, `text-body`, `border-hairline`, ...). Don't hard-code colours in components.
- **Navy surfaces:** put `data-tone="navy"` on any element with a navy background (hero, CTA band, footer, sidebar). Focus rings inside it switch from navy to mustard so they stay visible. The shared components already do this.
- **Page landmark:** every page renders exactly one `<main id="main">` (the root layout's skip link targets `#main`). `AppShell` renders it for you; landing-style pages render it themselves between `SiteHeader` and `SiteFooter`.
- **Request-time data** (viewer, usage, cookies, `searchParams`) must be read inside `<Suspense>` (Next 16 `cacheComponents`). These components only take plain props and never fetch, so wrap the async component that loads the data, not these.
- **No fake controls.** If something does not work yet, don't render it as a control. `AppShell` already shows Business-only features as locked links to `/contact`.
- **Print:** add `data-print-hide` to anything that should vanish when printing (nav, buttons).

## Tokens (`src/app/globals.css`)

| Token | Value | Tailwind | Use |
| --- | --- | --- | --- |
| navy | `#0B1F3A` | `bg-navy`, `text-navy`, `border-navy` | Ink, headings, bands, NOT HOT DOG |
| navy-raised | `#13294B` | `bg-navy-raised` | Raised panel on navy |
| navy-raised-2 | `#1E3A63` | `bg-navy-raised-2` | Active nav item on navy |
| navy-border | `#24395A` | `border-navy-border` | Rules and borders on navy |
| navy-hover | `#1D3A66` | `hover:text-navy-hover` | Link hover on white |
| mustard | `#F2B705` | `bg-mustard`, `text-mustard` (on navy only) | Primary action, HOT DOG |
| mustard-tint | `#FDF3D0` | `bg-mustard-tint` | "This case" row, gentle highlight |
| ground | `#F3F5F8` | `bg-ground` | Section ground, zebra rows |
| ground-soft | `#F7F8FA` | `bg-ground-soft` | Drop zone |
| hairline | `#D9DEE5` | `border-hairline` | 1 px borders, separators |
| field | `#7A8699` | `border-field` | Input and drop-zone borders (3:1) |
| body | `#3F4A5A` | `text-body` | Body text on white (default) |
| secondary | `#5B6676` | `text-secondary` | Labels, meta text on white |
| on-navy-secondary | `#B8C2D1` | `text-on-navy-secondary` | Labels on navy |
| on-navy-sub | `#D5DCE6` | `text-on-navy-sub` | Sub-copy on navy |
| on-navy-muted | `#9AA8BC` | `text-on-navy-muted` | Small meta text on navy (sidebar) |
| status-green | `#1E7B4F` | `text-status-green`, `bg-status-green` | Live dot, "Live", "Valid" |
| danger | `#9B1C1C` | `text-danger`, `border-danger` | Form errors only (not in the boards; 7.9:1 on white) |

Fonts: `font-serif` (Source Serif 4, 600 only: always pair with `font-semibold`), `font-sans` (Source Sans 3, 400/600/700; the body default), `font-mono` (system monospace for codes and ids). Use `tabular-nums` for times, counts and case numbers.

Extra font sizes: `text-13` (13 px), `text-15` (15 px), `text-17` (17 px). Radii: `rounded-card` (6 px: cards, buttons, inputs), `rounded-chip` (4 px: chips, tags). Page width: `max-w-page` (1200 px).

Never put mustard text on white, never use gradients, emoji or coloured left borders.

## Helpers

`@/components/ui/cx`: `cx(...classes)` joins truthy class names.

`@/components/ui/format` (pure, safe anywhere; all dates in UTC, en-US):

| Function | Example |
| --- | --- |
| `formatConfidence(0.992)` | `"99.2%"` |
| `formatConfidenceValue(0.992)` | `"99.2"` (feed rows) |
| `formatPercent(0.314)` | `"31.4%"` |
| `formatCount(48213906)` | `"48,213,906"` |
| `formatLatency(412)` | `"412 ms"`; `1530` gives `"1.5 s"` |
| `formatBytes(2516582)` | `"2.4 MB"` |
| `formatUtcTime(iso)` | `"14:32:07"`; `{ ms: true }` gives `"14:32:07.530"` |
| `formatDate(iso)` | `"Oct 24, 2026"` |
| `formatDateTimeUtc(iso)` | `"Oct 24, 2026 · 14:32:07 UTC"` |
| `verdictLabel("hot_dog")` | `"HOT DOG"` / `"NOT HOT DOG"` |
| `regionLabel("EU-C")` | `"EU-Central"`; unknown or null gives `"Unknown region"` |
| `initials("Dana Kessler")` | `"DK"` |
| `ratingBandLabel(92)` | `"Exemplary"` (from `ratingBand()` in `@/lib/policy`) |
| `usageSummary(usage)` | `"3 of 20 classifications used"` / `"Business plan · unlimited"` |

Icons: `@/components/ui/icons` exports stroke icons drawn from the boards, all `aria-hidden` and sized by `size` (default 20): `ArrowRightIcon`, `ChevronDownIcon`, `ChevronRightIcon`, `MenuIcon`, `CloseIcon`, `PlusIcon`, `CheckIcon`, `CheckCircleIcon`, `ClockIcon`, `LockIcon`, `GlobeIcon`, `ShieldIcon`, `DownloadIcon`, `PrinterIcon`, `LinkIcon`, `CopyIcon`, `UploadIcon`, `CameraIcon`, `ScanIcon` (Classify), `HistoryIcon`, `CertificateIcon`, `LayersIcon` (Batch), `ListIcon` (Audit), `KeyIcon`, `SlidersIcon` (Settings), `ScaleIcon` (review/appeal), `TagIcon`, `ExpandIcon`, `LogOutIcon`, `BuildingIcon`, `TrophyIcon`, `AlertIcon`, `InfoIcon`, `QrIcon`, `ExternalIcon`, `SearchIcon`.

## UI primitives (`src/components/ui/`)

### Button: `@/components/ui/button`

```tsx
<Button>Classify an image</Button>                                  // primary, md (44 px)
<Button href="/#classify" size="lg" iconRight={<ArrowRightIcon size={18} />}>Classify an image</Button>
<Button variant="secondary" icon={<PrinterIcon size={18} />}>Print QR labels</Button>
<Button variant="navy" block href={pdfUrl}>Download certificate (PDF)</Button>
<Button pending>Submitting</Button>                                  // spinner, aria-busy, disabled
```

Props: `variant?: "primary" | "secondary" | "navy" | "quiet" | "ghost" | "link" | "onNavy"` (default `primary`), `size?: "md" | "lg"` (44 / 52 px), `block?: boolean` (full width), `icon?` / `iconRight?: ReactNode`, `pending?: boolean`, plus native `<button>` props. Pass `href` to render a Next `<Link>` instead (plus `prefetch`, `target`, `rel`, `download`). Pass `external` with `href` for a plain `<a>` (PDF downloads, API URLs).

| Variant | Look | Board use |
| --- | --- | --- |
| `primary` | Mustard fill, navy text | "Classify an image", "Browse files", "Scan another" |
| `secondary` | White, 1 px navy border, navy text | "New classification", "Print QR labels", "Request human review" |
| `navy` | Navy fill, white text | "Download certificate (PDF)" |
| `quiet` | White, hairline border, navy text | Low-emphasis tiles (sample images, filters) |
| `ghost` | No border, navy text | Icon buttons, toolbar actions |
| `link` | Underlined bold navy text, no box | "View in History", "Export audit log (CSV)" |
| `onNavy` | Transparent, white 1.5 px border, white text | "Contact us" on navy bands |

`buttonClasses({ variant, size, block, iconOnly })` returns the same class string, for a `<label htmlFor>` styled as a button (file inputs). `iconOnly` makes a square 44/52 px button; give it an `aria-label`.

Don't pass display utilities (`hidden`, `block`, `xl:inline-flex`) in `className`: Button sets its own `inline-flex`, so wrap it instead (`<div className="hidden xl:block"><Button …/></div>`).

### SubmitButton (**client**): `@/components/ui/submit-button`

Same props as `Button` (no `href`) plus `pendingLabel?: string`. Reads `useFormStatus()` so it shows the pending state while its parent `<form action={...}>` is submitting.

### CopyButton (**client**): `@/components/ui/copy-button`

```tsx
<CopyButton text={verifyUrl(origin, code)} label="Copy verification link" block variant="secondary" />
```

Props: `text`, `label?` (default "Copy"), `copiedLabel?` (default "Copied"), `variant?`, `size?`, `block?`, `className?`. Announces "Copied" (or a failure message) in a polite live region and reverts after 2 s.

### Card: `@/components/ui/card`

```tsx
<Card aria-labelledby="report-title">
  <CardHeader title="Classification report" titleId="report-title" meta="Generated automatically · Read-only" />
  <KeyValueList rows={rows} />
  <CardFooter><Button variant="link" href={csvUrl} external>Export audit log (CSV)</Button></CardFooter>
</Card>
```

- `Card`: `as?: "section" | "div" | "article" | "li"` (default `section`), white, hairline border, 6 px radius, clips overflow. Native props pass through.
- `CardHeader`: `title`, `titleId?`, `as?: "h2" | "h3"` (default `h2`), `meta?` (right/below small text), `actions?`. Serif 22 px title, bottom hairline.
- `CardBody`: padded content (`p-5 sm:p-6`). `CardFooter`: top hairline, padded.

### Chip, Badge, tags: `@/components/ui/chip`, `@/components/ui/badge`

- `Chip`: detected-item chip from the report ("Split bun"): 28 px, white, hairline border, 13 px 600 navy. `ChipList` wraps a list of chips: `<ChipList items={scan.detectedItems} />`.
- `Badge`: small tag, `tone?: "neutral" | "navy" | "mustard" | "outline" | "outlineOnNavy" | "ground"`. 4 px radius, 12 px 700.
- `BusinessTag`: lock icon + "Business" (locked Business-plan features). `label?` overrides the text, `tone?: "light" | "navy"`.
- `LiveDot`: 8 px green dot + optional label in status green ("Live · 12 verdicts today"). `tone?: "light" | "navy"` (on navy the dot is lighter green and the text white).

### SectionHeading: `@/components/ui/section-heading`

```tsx
<SectionHeading eyebrow="§ 1 — Live global feed" title="One question, asked all day." titleId="feed-title"
  lead="Every verdict HDX issues appears in the global feed..." />
<SectionHeading eyebrow="§ 7 — Plans" title="Two plans. Still only two answers." aside="Start free. When the answer..." />
```

Props: `eyebrow?` (mustard rule + uppercase 13 px label), `title`, `titleId?`, `as?: "h1" | "h2"` (default `h2`), `lead?` (paragraph under the title), `aside?` (lead set in a right-hand column, as on Use cases and Plans), `tone?: "light" | "navy"`, `size?: "section" | "page"` (page = slightly smaller for app pages), `className?`.

### Container: `@/components/ui/container`

`<Container as="section" className="py-12">` centres content at 1200 px with 16 px gutters on phones (24 px from `sm`). `size?: "page" | "narrow"` (narrow = 760 px, for forms and policy text).

### Forms: `@/components/ui/form`

```tsx
<Field id="companyName" label="Company name" hint="As it should appear on certificates." error={fieldError}>
  {(aria) => <Input {...aria} name="companyName" required autoComplete="organization" />}
</Field>
```

- `Field`: `id`, `label`, `hint?`, `error?`, `optional?` (adds "(optional)"), `children: (aria) => ReactNode`. `aria` is `{ id, "aria-describedby", "aria-invalid" }`, so the control is wired to its hint and error.
- Primitives for custom layouts: `Label` (`htmlFor`, `optional?`), `Input`, `Textarea`, `Select` (native, with chevron), `FieldHint` (`id`), `FieldError` (`id`; renders nothing when empty; alert icon + `text-danger`). Inputs are 44 px tall, `border-field`, 6 px radius; `aria-invalid` turns the border `danger`.
- `fieldAria(id, { hint, error })` returns the same `aria` object if you build the markup yourself.

### Notice and EmptyState: `@/components/ui/notice`, `@/components/ui/empty-state`

- `Notice`: `tone?: "info" | "success" | "warning" | "error"`, `title?`, `children`, `action?`. Ground background, hairline border, icon. Use `role="alert"` yourself for errors that appear after an action (or put it in a live region).
- `EmptyState`: `title`, `body?`, `action?` (a `Button`), `icon?`. Centred, used for empty History, Certificates and Audit log.

### VisuallyHidden: `@/components/ui/visually-hidden`

`<VisuallyHidden>Opens in a new tab</VisuallyHidden>` (`as?` any tag, default `span`). Tailwind's `sr-only` works too.

### Stat: `@/components/ui/stat`

```tsx
<StatList columns="auto">
  <Stat label="Verdicts today" value={formatCount(n)} />
  <Stat label="Classified HOT DOG" value={formatPercent(share)} />
</StatList>
```

- `StatList`: a `<dl>` grid (`columns?: "auto" | 2 | 3 | 4`).
- `Stat`: `label`, `value`, `size?: "sm" | "md" | "lg"` (26 / 28 / 36 px serif), `rule?: "left" | "top" | "none"` (left hairline as in the landing metrics, top 2 px rule as in the verdict band), `tone?: "light" | "navy" | "hot"` (hot = navy on mustard). Renders `<div><dt/><dd/></div>`, so keep it inside `StatList` or another `<dl>`.

### Tables: `@/components/ui/table`

```tsx
<Table caption="Certificates issued to Ballpark Holdings" captionHidden>
  <THead><Tr><Th>Certificate</Th><Th align="right">Scans</Th></Tr></THead>
  <TBody>{rows.map((r) => <Tr key={r.code}><Td mono>{r.number}</Td><Td align="right" numeric>{r.count}</Td></Tr>)}</TBody>
</Table>
```

- `Table`: horizontal scroll wrapper + `<table>`; `caption` (required for accessibility), `captionHidden?`, `minWidth?` (CSS length, default `36rem`; set `"0"` for small tables).
- `THead`, `TBody` (zebra: odd rows `ground`, even white, hairline separators), `Tr` (`highlight?` = mustard tint), `Th` (`align?`, uppercase 12 px 600 secondary, `scope="col"` by default), `Td` (`align?`, `numeric?` = tabular nums, `mono?`, `strong?`).
- `KeyValueList`: the zebra `<dl>` from the Classification report. `rows: { label: ReactNode; value: ReactNode }[]`, `labelWidth?` (CSS length, default `196px`). Labels stack above values on phones.

## Brand (`src/components/brand/`)

- `Wordmark` (`@/components/brand/wordmark`): HDX mark + "HDX" + descriptor. `tone?: "light" | "navy"` (the surface it sits on), `size?: "sm" | "md" | "lg"` (mobile bar / sidebar / landing nav), `descriptor?: "stacked" | "line" | "none"` (stacked = "Hot Dog or Not / Enterprise Cloud" after a divider, as in the landing nav; line = "Hot Dog or Not · Enterprise Cloud" under HDX, as in the sidebar), `href?: string | null` (default `/`; `null` renders no link), `className?`. Accessible name: "HDX home".
- `HdxMark` (`@/components/brand/hdx-mark`): the 32×32 logo alone. `size?`, `framed?` (thin outline for navy surfaces), `title?` (otherwise decorative).
- `Seal` (`@/components/brand/seal`): navy ring, mustard centre, "HDX · CERTIFIED · POLICY 3.2". `size?` (px, default 64), `title?` (otherwise decorative).
- `QrCode` (`@/components/brand/qr-code`): real, scannable QR as inline SVG with a 4-module quiet zone. Server-render it (it pulls in the `qrcode` library; pass the rendered element to Client Components as `children` rather than importing it there).

```tsx
<QrCode value={verifyUrl(origin, cert.code)} size={132} label={`QR code for certificate ${cert.number}, verification code ${cert.code}`} />
<QrCode value={url} size="40mm" label="..." fg="#0B1F3A" />   // print sizes accept any CSS length
```

Props: `value`, `label` (accessible name, required), `size?: number | string` (px number or CSS length, default 132), `fg?` (default navy), `bg?` (default white), `quietZone?` (modules, default 4), `className?`. Uses `shape-rendering="crispEdges"`. Get the origin from the request (`originFromHeaders(await headers())` in `@/lib/auth/redirect`); never hard-code a domain.

## Verdict (`src/components/verdict/`)

- `VerdictChip` (`@/components/verdict/verdict-chip`): `verdict`, `size?: "sm" | "md" | "lg"` (24 / 28 / 32 px), `onNavy?` (NOT HOT DOG becomes a white outline so it shows on navy). HOT DOG = mustard + navy text; NOT HOT DOG = navy + white text.
- `VerdictBand` (`@/components/verdict/verdict-band`): the big result band.

```tsx
<VerdictBand verdict={scan.verdict} policyClause={scan.policyClause} reviewStatus={scan.reviewStatus}
  live headingId="verdict-title" media={<ScanFigure scan={scan} />}>
  <VerdictStats verdict={scan.verdict} items={[
    { label: "Confidence", value: formatConfidence(scan.confidence) },
    { label: "Processing time", value: formatLatency(scan.latencyMs) },
    { label: "Clause applied", value: `§${scan.policyClause}` },
  ]} />
</VerdictBand>
```

  For a reliable announcement after an upload, keep an `aria-live` container mounted *before* the result arrives (e.g. a wrapper that holds the upload status and then the band); `live` adds that wrapper around the band itself, which suits pages where the band renders with the page.

  Props: `verdict`, `policyClause`, `reviewStatus?: ReviewStatus | null` (null = "Final · Subject to appeal"; `pending` = "Under review"; `upheld` = "Upheld on appeal"; `overturned` = "Overturned on appeal"), `clauseLine?: ReactNode` (replaces the default linked "Hot Dog Definition Policy v3.2, §2.1 — Canonical form"), `headingId?`, `headingLevel?: "h1" | "h2"` (default `h2`), `live?: boolean` (wraps the band in an `aria-live="polite"` region; use it wherever the verdict appears after an upload), `size?: "default" | "compact"` (compact = the phone band from Final-Mobile, short "Final" tag), `media?` (left column, e.g. the image figure), `children?` (under the clause line, usually `VerdictStats`). Sets `data-tone="navy"` for NOT HOT DOG.
- `VerdictStats`: the 2 px-rule stat grid inside the band. `verdict`, `items: { label: string; value: ReactNode }[]`.
- `verdictStatusLabel(reviewStatus, { compact })` (`@/components/verdict/status`): the tag text above.
- `ConfidenceStat` (`@/components/verdict/confidence-stat`): `<Stat>` preset: `confidence` (0..1), `tone?`, `size?`, `rule?`, `label?` (default "Confidence"). Keep inside a `<dl>`.
- `RatingBadge` (`@/components/verdict/rating-badge`): `rating: number | null` (renders nothing for null), `size?: "sm" | "md" | "lg"`, `showBand?` (default true: "Exemplary" / "Compliant" / "Marginal"), `tone?: "light" | "navy"`. Reads as "HDX Rating 92, Exemplary".
- `ClauseLink` (`@/components/verdict/clause-link`): links to the clause on `/policy`. `clause` (id like "2.1"), `format?: "full" | "short" | "ref"` ("Hot Dog Definition Policy v3.2, §2.1 — Canonical form" / "v3.2, §2.1 — Canonical form" / "§2.1"), `children?` (custom text), `className?`. Anchor helpers from `@/components/verdict/clause`: `clauseAnchorId("2.1")` = `"clause-2-1"` (the policy page must give each clause row this `id`), `clauseHref("2.1")` = `"/policy#clause-2-1"`.

## Feed (`src/components/feed/`)

- `GlobalFeedTable` (`@/components/feed/global-feed-table`): `items: FeedItem[]`, `size?: "card" | "fullscreen"`, `caption?` (default "Latest verdicts worldwide, newest first"), `emptyMessage?`, `footnote?: boolean` (default true: the "Anonymised. ..." line). Zebra rows; a `highlight` item gets the mustard tint and a "This case" tag. A real `<table>`; in containers narrower than 368 px the Confidence header shortens to "Conf." so it fits a 360 px phone. The same file exports `FeedFootnote` and `FEED_FOOTNOTE`.
- `LiveFeed` (**client**, `@/components/feed/live-feed`): the Global feed card with live updates.

```tsx
const snapshot = await getFeedSnapshot({ limit: 12, highlightScanId: scan.id });
<LiveFeed initial={snapshot} caseNumber={scan.caseNumber} />                       // right rail card
<LiveFeed initial={snapshot} variant="fullscreen" title="Global feed" headingLevel="h1" limit={20} />  // /feed
```

  Props: `initial: FeedSnapshot`, `caseNumber?: string | null` (sent as `?case=` so the server can mark "This case"), `variant?: "card" | "fullscreen"`, `title?` (default "Global feed"), `titleId?`, `headingLevel?: "h1" | "h2" | "h3"` (default `h2`), `limit?` (rows shown, default 12), `showStats?` (card: today line + ambiguous footer; fullscreen: big stats row; default true), `pollMs?` (default 5000). Polls `GET /api/v1/feed` every 5 s, backs off up to 60 s on errors (and says "Reconnecting"), pauses while the tab is hidden and refreshes when it returns. The header shows "Live · {n} verdicts today" (never a per-second rate).
- `FeedStats` (`@/components/feed/feed-stats`): `snapshot` (any object with the `FeedSnapshot` stat fields), `include?: ("today" | "share" | "ambiguous" | "p50")[]`, `tone?: "light" | "navy"`, `size?`. The landing "Verdicts today / Classified HOT DOG / Ambiguous, all time" row.

## Layout (`src/components/layout/`)

- `SiteHeader` (`@/components/layout/site-header`): landing header. Utility bar (green dot "Live global feed · Hot Dog Definition Policy v3.2 in force" linking to `/feed`, since we have no real status page or uptime figure; "Verify a certificate", which opens a code form in a native popover that goes to `/v/{CODE}`; Contact sales `/contact?source=header`; Sign in), main nav (Wordmark; Platform `/#platform`, Use cases `/#use-cases`, Live feed `/#feed`, Certificates `/#certificates`, Plans `/#plans`, Companies `/companies`; primary "Classify an image" `/#classify`) and an accessible mobile menu (below 1280 px: a disclosure panel with the links, the verify form and the CTA). Props: `viewer?: Viewer | null` (signed in: shows "Open workspace" and "Sign out" instead of "Sign in"). It never fetches; pass the viewer from a Suspense-wrapped loader if you need it, or omit it (the static version shows "Sign in").
  **Landing section ids:** the landing page must use `id="classify"` (hero upload card), `feed`, `use-cases`, `certificates`, `platform`, `plans`.
- `SiteFooter` (`@/components/layout/site-footer`): navy footer with links to real routes and landing anchors only (Classify, `/feed`, certificates anchor, Business API → `/contact`, `/policy`, the sample record `/v/7KQ2-M9XD`, use cases, `/companies`, plans, contact, `/sign-in`, `/cases`) and `SHORT_DISCLAIMER`. No props. Link lists live in `@/components/layout/site-nav-links` (`SITE_NAV_LINKS`, `CLASSIFY_HREF`, `CONTACT_SALES_HREF`).
- `VerifyCodeForm` (**client**, `@/components/layout/verify-code-form`): code input + "Verify" button that navigates to `/v/{CODE}`; normalises "7kq2m9xd" to "7KQ2-M9XD" and explains invalid input. Props: `id?` (unique per page), `tone?: "light" | "navy"`, `autoFocus?`, `className?`, `onNavigate?`. `VerifyPopover` (same file) is the header's link-style trigger + popover. Helpers in `@/components/layout/verification-code`: `normalizeVerificationCode(input)` (string or null), `VERIFICATION_CODE_PATTERN`.
- `AppShell` (`@/components/layout/app-shell`): the workspace frame from Final-Verdict (sidebar on desktop, top bar + drawer on phones).

```tsx
<AppShell viewer={viewer} usage={usage} active="cases"
  breadcrumb={[{ label: "History", href: "/cases" }, { label: scan.caseNumber }]}>
  <PageHeader title="Classification result" meta={<>Case {scan.caseNumber} · Submitted ...</>}
    actions={<Button variant="secondary" href="/classify" icon={<PlusIcon size={18} />}>New classification</Button>} />
  ...
</AppShell>
```

  Props: `viewer: Viewer`, `usage: Usage`, `active?: "classify" | "cases" | "certificates" | "audit" | "settings"` (if omitted the nav works it out from the URL on the client), `breadcrumb?: { label: string; href?: string }[]`, `region?: string | null` (a `REGION_CODES` value shown as a chip in the top bar; omit when unknown), `children`. Renders `<main id="main">`. Sidebar: Wordmark, workspace (company name, or "Guest session"), nav (Classify `/classify`, History `/cases`, Certificates `/certificates`, Audit log `/audit`, Settings `/settings`; for anonymous viewers the last three link to `/sign-in?next=...` with a "Sign in" tag), locked Business items (Batch jobs, API keys → `/contact?source=workspace`), usage card (Free "N of 20 classifications used" with a bar; anonymous "Free · N of 20 used" + Sign in; Business "Business plan · unlimited"), user card (initials, name, job title · role, Sign out form posting to `signOut`).
- `PageHeader` (`@/components/layout/page-header`): workspace page title row. `title`, `meta?`, `actions?`, `as?: "h1" | "h2"` (default `h1`).
- `Breadcrumb` (`@/components/layout/breadcrumb`): `items: { label: string; href?: string }[]`; the last item gets `aria-current="page"`.
- `siteUrl(env)` (`@/components/layout/site-url`): canonical origin for metadata (`VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`, then `http://localhost:3000`). For URLs printed on certificates or labels, use the request origin instead.

## Root files

- `src/app/layout.tsx`: fonts, metadata (title template `"%s · HDX"`, so pages export `metadata = { title: "History" }`), theme colour, skip link, body defaults (`bg-white text-body font-sans`). No request-time data.
- `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`: HDX-voice fallbacks (the 404 page includes the certificate code form). Add segment-level `error.tsx` / `not-found.tsx` in your own routes only if you need different copy. Next 16 error boundaries receive `{ error: unknown; retry: () => void }` (not `reset`); narrow `error` before reading `digest`.
- `src/app/icon.svg`: the HDX mark as the favicon (the default `favicon.ico` was removed).
