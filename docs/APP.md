# HDX app: phase 2 contract (full product)

Extends `docs/BACKEND.md` (phase 1: classify, scans API, auth, rate limits). This file covers the full product from the final design in `docs/design/`: landing page, workspace, companies, ratings, certificates, verification, appeals, audit trail, leads and the live feed.

Shared types: `src/lib/types.ts`. Policy clauses and the rating rubric: `src/lib/policy.ts`. Schema: `supabase/migrations/20261024104635_companies_certificates.sql`.

## Product rules

- **Verdict stays binary.** Every verdict cites exactly one clause of Hot Dog Definition Policy v3.2 (`POLICY_CLAUSES`). Clause verdict must equal the verdict.
- **HDX Rating** (0–100): HOT DOG verdicts only, null otherwise. How canonical the hot dog is (bun, sausage, condiments, presentation; `RATING_RUBRIC`). One-line `ratingNote`.
- **Free plan:** `FREE_CLASSIFICATION_LIMIT` (20) classifications in total. Counted per company for signed-in users (per user if not onboarded yet), per visitor cookie for anonymous visitors. Cached re-verdicts count. Business plan (`companies.plan = 'business'`, set by sales) is unlimited (rate limits still apply). Over quota: `AppError("QUOTA_EXCEEDED")` (HTTP 402); the UI offers sign-in / Contact us. No prices anywhere.
- **Companies: one account = one company** (user correction, 2026-10-24; supersedes the earlier email-domain auto-join design). First sign-in (Google, or email + password: `passwordAuthAction`, no confirmation email) → `/onboarding` asks for the company name (and optional job title). Onboarding **always creates a new company owned by that account** (`company_role = 'owner'`); there is no email-domain matching, auto-join, membership, invites or admin roles. Company names are unique case-insensitively (and slugs unique): a taken name returns `AppError("CONFLICT")` with "This company name is already registered. Please choose another." Ignore `companies.email_domain` (unused; it will be dropped) and never set `company_role` to anything but `owner`. `OnboardingResult.kind` is always `"created"` (or the existing company when already onboarded).
  Signed-in users without a company are redirected to `/onboarding` from every workspace page. Scans by signed-in users carry `company_id`; the company's scans, certificates and audit log are that one account's.
- **Leaderboard** `/companies`: `get_company_leaderboard()` RPC. Score = Bayesian-smoothed mean HDX Rating (prior weight 5 at the global mean; identical images count once). Only listed companies with ≥1 HOT DOG. Owners can unlist in `/settings`.
- **Certificates.** Every persisted scan gets a certificate (number `HDX-C-0088301…`, code `XXXX-XXXX`) issued to the company name, or "Individual submitter" for anonymous / not-onboarded users. Public record at `/v/{code}` (each view increments `verification_count`); PDF at `/v/{code}/certificate.pdf`. Owners can set product name and SKU (shown on labels and the verify page). Revoked when an appeal overturns the verdict. Disclaimers: `CERTIFICATE_DISCLAIMER` (certificate) and `SHORT_DISCLAIMER` (labels, verify page).
- **Sample record.** Code `SAMPLE_CERTIFICATE_CODE` (`7KQ2-M9XD`, from the design) renders built-in sample data (Stadium Frank, Ballpark Holdings) on `/v/7KQ2-M9XD` and its PDF, clearly marked as a sample. It never touches the DB.
- **Appeals** ("Request human review"): one per scan, owner only. Stored as `pending`, then decided in the background by the **Hot Dog Review Board**: a second, stronger model reviews the image (or the record, if the image was already deleted) plus the appellant's reason. `upheld` keeps the verdict; `overturned` flips the verdict (new clause/rating), sets `scans.review_status`, and revokes the certificate. Every step lands in the audit trail.
- **Audit trail**: `audit_events`, append-only and SHA-256 chained per scan by a DB trigger. Write with `recordAuditEvents()` (`src/lib/audit/record.ts`). Events: `uploaded`, `screened`, `classified`, `certificate_issued`, `product_updated`, `appeal_filed`, `appeal_upheld`, `appeal_overturned`, `certificate_revoked`, `image_deleted`. Exportable as CSV per case.
- **Live global feed**: latest verdicts worldwide, anonymised: time, coarse region (from Vercel geo headers, `REGION_CODES`), verdict, confidence. Never images, companies, case numbers or ids. Honest numbers: "verdicts today", hot-dog share today, p50 latency, "ambiguous verdicts, all time: 0". No fake per-second rate.
- **Image retention**: `IMAGE_RETENTION_HOURS` (24). Signed URLs stop being issued after 24 h; a daily cron (`/api/cron/purge-images`, `CRON_SECRET`) deletes the objects and records `image_deleted`.
- **Leads**: `/contact` form (Business plan) stored in `leads`. Rate limited. No email sending yet.

## Module map (owner area → exports)

### Classifier `src/lib/ai/**`
```ts
classifyImage(input: ClassifyInput): Promise<ClassifierOutput>; // Classification now includes policyClause, rating, ratingNote
reviewAppeal(input: {
  bytes: Uint8Array | null;            // null when the image was already purged: review the record only
  mimeType: AcceptedImageType | null;
  original: Classification;
  reason: string;
  signal?: AbortSignal;
}): Promise<{ decision: "upheld" | "overturned"; ruling: string; classification: Classification; model: string; latencyMs: number }>;
```

### Scans `src/lib/scans/**`, `src/lib/geo.ts`, `src/lib/usage.ts`, `src/app/api/v1/scans/**`, `src/app/api/v1/usage/route.ts`, `src/app/actions/scans.ts`
```ts
createScan(input: CreateScanInput): Promise<Scan>;        // CreateScanInput gains optional fileName; enforces quota; sets company_id, region, rating, clause; issues certificate; audit
getCaseForViewer(caseNumber: string): Promise<Scan | null>; // owner or same-company member
listViewerScans(opts?): Promise<ListScansResponse>;         // company scans for members, else own
getGlobalStats(): Promise<GlobalStats>;                      // v2 fields
getUsage(ctx?: ViewerContext): Promise<Usage>;               // src/lib/usage.ts
assertWithinQuota(ctx: ViewerContext): Promise<void>;        // throws QUOTA_EXCEEDED
regionFromHeaders(headers: Headers): RegionCode | null;      // src/lib/geo.ts
// GET /api/v1/usage -> { usage: Usage }
```

### Certificates + PDF `src/lib/certificates/**`, `src/lib/pdf/**`, `src/app/v/[code]/certificate.pdf/route.ts`, `src/app/api/v1/certificates/**`, `src/app/actions/certificates.ts`
```ts
toCertificateSummary(row: CertificateRow): CertificateSummary;           // pure, src/lib/certificates/mappers.ts (scans embeds certificates(*) and uses this)
issueCertificate(input: { scanId: string; issuedTo: string }): Promise<CertificateSummary | null>; // idempotent; audit certificate_issued; null without DB
getPublicCertificate(code: string, opts?: { recordVerification?: boolean }): Promise<PublicCertificate | null>; // sample code → sample data
updateCertificateProduct(scanId: string, patch: { productName?: string | null; sku?: string | null }): Promise<CertificateSummary>; // owner/company; audit product_updated
revokeCertificate(scanId: string, reason: string): Promise<void>;        // audit certificate_revoked
listViewerCertificates(opts?: { limit?: number }): Promise<ViewerCertificate[]>;
renderCertificatePdf(cert: PublicCertificate, opts: { origin: string }): Promise<Uint8Array>; // src/lib/pdf
updateCertificateProductAction(scanId: string, patch): Promise<ActionResult<CertificateSummary>>;
SAMPLE_CERTIFICATE_CODE, SAMPLE_CERTIFICATE                                // src/lib/certificates/sample.ts
```

### QR `src/lib/qr.ts` (done)
```ts
qrMatrix(text: string): boolean[][];   // dark modules, quiet zone excluded
qrSvgPath(matrix): string;             // one <path d> in module units
verifyUrl(origin: string, code: string): string; // `${origin}/v/${code}`
```

### Companies + identity `src/lib/companies/**`, `src/lib/auth/**`, `src/app/auth/**`, `src/app/actions/auth.ts`, `src/app/actions/companies.ts`
```ts
getViewerContext(): Promise<ViewerContext>;   // viewer gains company, jobTitle, needsOnboarding
requireViewer(opts?: { company?: boolean; next?: string }): Promise<ViewerContext>; // redirects to /sign-in?next= or /onboarding?next=
completeOnboarding(input: OnboardingInput): Promise<OnboardingResult>;
setCompanyListing(isListed: boolean): Promise<ViewerCompany>; // owner only
getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;  // cached, tag "leaderboard"
getCompanyProfile(slug: string): Promise<CompanyProfile | null>; // listed companies only
completeOnboardingAction(prev: unknown, formData: FormData): Promise<ActionResult<OnboardingResult>>;
setCompanyListingAction(isListed: boolean): Promise<ActionResult<ViewerCompany>>;
// /auth/callback redirects to /onboarding?next=... when the user has no company yet
```

### Engagement `src/lib/appeals/**`, `src/lib/leads/**`, `src/lib/feed/**`, `src/lib/audit/queries.ts`, matching actions and routes, `src/app/api/cron/**`, `vercel.json`
```ts
fileAppeal(scanId: string, reason: string): Promise<AppealView>;  // decides in the background via after()
getAppealForScan(scanId: string): Promise<AppealView | null>;
fileAppealAction(scanId: string, reason: string): Promise<ActionResult<AppealView>>;
submitLead(input: LeadInput, headers: Headers): Promise<{ id: string }>;
submitLeadAction(prev: unknown, formData: FormData): Promise<ActionResult<{ id: string }>>;
getFeedSnapshot(opts?: { limit?: number; highlightScanId?: string | null }): Promise<FeedSnapshot>;
// GET /api/v1/feed?case=HDX-... -> FeedSnapshot (highlight only when the viewer can access that case)
listAuditEvents(scanId: string): Promise<AuditEvent[]>;
listViewerAuditEvents(opts?: { limit?: number }): Promise<Array<AuditEvent & { caseNumber: string }>>;
// GET /api/v1/audit/{caseNumber} -> text/csv (access-checked)
// GET /api/cron/purge-images (Bearer CRON_SECRET) + vercel.json daily cron
```

## Routes (pages)

| Route | Board | Access |
| --- | --- | --- |
| `/` | Final-Landing | public; hero upload works without signup |
| `/feed` | full-screen global feed | public |
| `/policy` | Hot Dog Definition Policy v3.2 | public |
| `/sign-in` | Google or email + password sign-in / register | public |
| `/onboarding` | company step | signed in |
| `/classify` | workspace upload | visitor or user (workspace shell) |
| `/cases` | History | visitor or user |
| `/cases/[caseNumber]` | Final-Verdict (desktop), Final-Mobile (phone) | owner / company member |
| `/certificates` | company certificates | signed in with company |
| `/audit` | audit log | signed in with company |
| `/settings` | company listing, plan, usage | signed in with company |
| `/labels/[caseNumber]` | Final-Labels, print A4 | owner / company member |
| `/v/[code]` | Final-Verify (valid / revoked / unknown) | public |
| `/v/[code]/certificate.pdf` | Final-Certificate | public |
| `/companies` | leaderboard | public |
| `/companies/[slug]` | company profile | public (listed only) |
| `/contact` | Business plan lead form | public |

Workspace nav (from Final-Verdict): Classify, History, Certificates, Audit log, Settings (labelled Admin in the board). Batch jobs and API keys are Business-plan features: show them locked with a "Business" tag linking to `/contact`. Never show non-working controls as if they worked.

## UI rules

Tokens, type and patterns: `docs/design/README.md` and `FINAL-SPEC.md`. Rebuild the boards as React + Tailwind (tokens are defined in `src/app/globals.css`); don't paste board markup. Use the real app host for URLs (never `hdx.example`). Accessibility: real buttons/links/labels, the verdict in an `aria-live` region, text contrast ≥ 4.5:1, touch targets ≥ 44 px, every page works at 390 px width.
