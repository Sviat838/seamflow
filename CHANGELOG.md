# Changelog

Shared log for every session (human or Claude) working in this repo, so parallel work stays in sync.

## Rules for every session

1. **Read this file before you start**, and re-read it before you finish: another session may have changed something you depend on.
2. **Add an entry when you finish a chunk of work**, newest first under today's date. Say who you are (session name or "user"), what changed, and which files.
3. **Flag anything others must act on** with one of these tags at the start of a bullet:
   - `Contract:` changes to `src/lib/types.ts`, API routes, server actions, or the DB schema.
   - `Env:` new or renamed environment variables (also update `.env.example`).
   - `Migration:` a new file in `supabase/migrations/` (also regenerate `src/lib/supabase/database.types.ts`).
   - `Action needed:` something a human has to do (dashboard settings, keys, etc.).
4. **Stay inside your area** (table below). If you must touch another area's files, say so in your entry.
5. Don't rewrite or delete other sessions' entries; add a new one that corrects them.

## Areas and ownership

| Area | Paths | Owner |
| --- | --- | --- |
| Frontend / design | `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/globals.css`, `src/components/**`, `public/**` | Design session |
| Backend | `src/lib/**`, `src/app/api/**`, `src/app/auth/**`, `src/app/actions/**`, `src/proxy.ts`, `supabase/**` | Backend session |
| Shared contract | `src/lib/types.ts`, `docs/BACKEND.md`, `docs/FRONTEND_INTEGRATION.md` | Backend writes, frontend reads; ask before changing |
| Project config | `package.json`, `next.config.ts`, `tsconfig.json`, `.env.example` | Either, with a changelog entry |

Supabase project: **seamflow** (`buuyvmasbomxzyrwfkxo`, eu-west-1). Use the Supabase connector tools that take a `project_id`. The project-scoped `supabase` connector in some sessions points at a different, unrelated project; don't run migrations through it.

---

## 2026-10-24

### Backend session: review results and what is still open

- A read-only review (security/framework, product logic, design/accessibility) found 27 issues. **Fixed and live (database):** case numbers no longer collide past sequence 9999, browser roles can't write `profiles.company_id/company_role`, `classification_usage` ledger (backfilled), certificates snapshot their determination and issuing company, appeals have `attempts`/`last_error`, leaderboard counts company-issued certificates (`20261024120421`, `20261024120535`).
- **Not yet fixed in code (deadline):** quota still counts live scans, so deleting a scan refills the free 20 (switch `src/lib/usage.ts` to `classification_usage`, write a ledger row in `createScan`); revoked certificates still read the scan row, so they show the corrected verdict (read the snapshot columns); verdict reuse after an overturn; unbounded appeal retries; non-Latin company names collide on slug `company`; purge handles 500 images per run; unknown `/v/{code}` returns HTTP 200; no focus ring on the upload buttons; verdict not announced to screen readers; upload below the fold on phones; `/`, `/feed`, `/policy` headers ignore the signed-in user; case-not-found shows two headers; onboarding/contact forms clear input on error; suspicious-label report goes to the sales form; phone order on the case page; label text too small; double padding on workspace pages; duplicate "· HDX · HDX" titles; landing section numbering.

### Backend session (side session): email + password sign-up, demo seed

- **Email + password auth** next to "Continue with Google" on `/sign-in` (tabs: Sign in / Create account). Sign-up sends no confirmation email and doesn't depend on the dashboard's "Confirm email" setting: `auth.admin.createUser({ email_confirm: true })` with the admin client, then `signInWithPassword` on the cookie-bound client sets the session. After sign-in visitor scans are claimed and accounts without a company go to `/onboarding`, exactly like the Google callback (shared `finishSignIn()` in `src/lib/auth/after-sign-in.ts`, now used by `/auth/callback` too). Zod validation (password 8 to 72 chars), friendly errors (email already registered, "Wrong email or password.", rate limited), per-IP rate limits for sign-up (5/min, 20/h) and sign-in (10/min, 60/h) plus per-account sign-in (20/h) through `consume_rate_limit()` (`enforceAuthRateLimit` in `src/lib/rate-limit.ts`; emails are HMAC'd). Files: `src/lib/auth/{credentials,password,password-rules,after-sign-in}.ts`, `src/app/actions/auth.ts`, `src/components/forms/password-auth-form.tsx`, `src/app/sign-in/page.tsx`. Checked against real GoTrue (`email_exists`, `invalid_credentials`) and in the browser locally.
- `Contract:` new server action `passwordAuthAction(prev, formData)` in `src/app/actions/auth.ts` (documented in `docs/BACKEND.md`). No DB change.
- **Demo seed** `npm run seed:demo` (`scripts/seed-demo.ts`, `scripts/seed-demo/*`): 10 imagined hot dog businesses (stadium suppliers, deli, food trucks, street carts, a vegan brand, two forecourt chains), one email + password account and one company each (`qa+<slug>@hdx-demo.example`), 20 programmatically drawn, unique product photos per company (SVG via sharp; quality per company drives burnt/tiny sausage, torn or soggy bun, condiment landslide, blur, darkness, off-centre framing; 14 borderline shots: bun only, sausage only, pastry roll, burger). Every image goes through the real `classifyImage`; scans are persisted like `createScan` (same mappers, storage, `recordAuditEvents`, `issueCertificate`), dated over the last 6 hours with the company's region. Idempotent (keyed by company + file name), 4 at a time, aborts above 10% errors or 200 classifier calls. Seeded against the real project: 200 scans (190 HOT DOG), 200 certificates, 10 companies, 0 classifier errors. Leaderboard spread 84.4 down to 63.2.
- `Env:` `SEED_DEMO_PASSWORD` (local `.env.local` only, never in Vercel or git; documented in `.env.example`).
- Config: devDependencies `tsx` and `sharp`; `vitest.config.ts` also runs `scripts/**/*.test.ts`. Touched Backend files outside my area only for `src/app/auth/callback/route.ts` (refactor onto `finishSignIn`).
- Checks: `tsc`, `eslint`, 869 tests, `next build` green.

### Backend session: full app shipped (first deploy)

- Built all pages on the phase 2 backend: landing (hero upload, live feed, use cases, certificates, policy rulings, plans), `/policy`, `/feed`, workspace (`/classify`, `/cases`, `/cases/[caseNumber]` result page with rating, appeal, audit trail, certificate card, `/certificates`, `/audit`, `/settings`), `/v/[code]` verify page, `/labels/[caseNumber]` print sheet, `/sign-in`, `/onboarding`, `/companies`, `/companies/[slug]`, `/contact`. Onboarding now follows one account = one company.
- `Migration:` `20261024113824_one_account_one_company` applied (dropped `companies.email_domain`; `profiles.company_id` unique). Types updated.
- Checks: `tsc`, `eslint`, 838 tests, `next build` green. Real E2E locally and on production: upload → verdict with clause and rating → case page → certificate → verify page → PDF → audit CSV (hash chain in order) → feed highlight → usage counter. Test rows removed afterwards.
- Deployed: public repo https://github.com/Sviat838/seamflow (`main`), Vercel project `seamflow` (functions in `dub1`), live at https://seamflowtest.sviat.info. Vercel env vars set (secrets as sensitive).
- Known gaps: the planned multi-agent review/fix pass was skipped to meet the deadline; unknown `/v/{code}` renders the not-found UI with HTTP 200 (streamed); landing sample images not added; the repo isn't linked to Vercel for auto-deploys (deploys go through the Vercel API).

### Backend session: company sign-up corrected (one account = one company)

- `Contract:` per the user (relayed by the design session): **one account = one company**. Onboarding always creates a new company owned by the signing-in account. Removed from the design: work-email-domain matching, auto-join, membership, invites and admin roles. Company names stay unique (case-insensitive); a taken name gets "This company name is already registered. Please choose another." `docs/APP.md` updated. Supersedes the "Company matching" decision in the phase 2 entry below.
- `Migration:` (pending, applied before the first deploy) drop `companies.email_domain` and make `profiles.company_id` unique.

### Backend session: phase 2 contract (full app from the final design)

- Took over Frontend / design per the handover; building the whole app in this session (see `docs/APP.md` for product rules, module map and routes).
- `Migration:` `20261024104635_companies_certificates` applied: `companies` (+ `profiles.company_id/company_role/job_title`), scan `case_number` / `company_id` / `rating` / `rating_note` / `policy_clause` / `region` / `file_name` / `image_deleted_at` / `review_status`, `certificates` (number + `XXXX-XXXX` code, revocation, verification counter RPC), `appeals` (one per scan), `audit_events` (append-only, SHA-256 chained per scan by trigger), `leads`, `get_global_stats` v2 (today, p50), `get_company_leaderboard`. Types regenerated. Security advisor: info-only notes for server-only tables (RLS on, no browser policies, by design).
- `Contract:` `src/lib/types.ts` v2 (Classification gains policyClause/rating/ratingNote; Scan gains caseNumber, certificate, review status, retention fields; Viewer gains company/jobTitle/needsOnboarding; new Usage, ViewerCompany, CertificateSummary, PublicCertificate, LeaderboardEntry, CompanyProfile, FeedSnapshot, AppealView, AuditEvent, LeadInput; error codes `QUOTA_EXCEEDED` 402 and `CONFLICT` 409). New `src/lib/policy.ts` (Hot Dog Definition Policy v3.2 clauses, rating rubric), `src/lib/qr.ts`, `src/lib/audit/record.ts`.
- Decisions: **HDX Rating** as the design session proposed (0–100, HOT DOG only; company score = Bayesian-smoothed mean with prior weight 5 at the global mean; identical images count once per company). **Company matching:** same work email domain auto-joins the existing company; otherwise a taken name returns "already registered, ask its admin" (no silent joins, no invites yet). **Free plan:** 20 classifications in total, per company (signed in) or per visitor cookie (anonymous). Corn dogs are HOT DOG under §2.4, per the design's policy table.
- `Env:` `REVIEW_MODEL` (optional) and `CRON_SECRET` (generated in `.env.local`; must be set in Vercel for the daily image purge).
- Config: added `qrcode`, `@react-pdf/renderer`, `@types/qrcode`.

### Backend session: phase 1 integrated

- Five module agents built the AI classifier, auth/identity/proxy, platform utilities (logging, responses, rate limiting, health), scans API + server actions, and browser upload helpers; an integrator wired them together. 373 tests, lint and build green before the phase 2 contract landed. Review/fix deferred to the end of phase 2 at the user's request.

### Design session: final design handed over

- Added `docs/design/`, containing the final design boards (`boards/*.dc.html`), `FINAL-SPEC.md`, `use-cases.json` and a `README.md` with tokens and product decisions.
- `Action needed:` the user asked the **Backend session** to implement the whole application, frontend included, from this design. It also needs two new features: the company name captured at registration, and a public companies page ranked by hot dog rating. From now on the Backend session owns the Frontend / design area as well; the design session no longer edits app code.

### Backend session: scaffolding and contracts

- `Migration:` `20261024101556_core_schema` and `20261024101616_stats_server_only` applied to seamflow:
  - `profiles` (auto-created from the Google identity on sign-up), `scans` (verdict, confidence, summary, details jsonb, image path/hash, share slug, visibility, feedback).
  - `private.rate_limits` + `consume_rate_limit()` RPC (service role only).
  - `get_global_stats()` RPC (service role only; the server caches it).
  - Private storage bucket `scans` (5 MB, jpeg/png/webp/gif).
  - RLS on everything; browser roles can only read their own scans and profile. All writes go through the Next.js server with the secret key. Security advisors: clean.
- `Contract:` added `src/lib/types.ts` (Scan, Classification, GlobalStats, Viewer, API request/response shapes, error codes, ActionResult) and `docs/BACKEND.md` (module map, endpoints, conventions).
- Added shared primitives: `src/lib/env.ts` (lazy zod-validated env), `src/lib/errors.ts` (AppError + status map), `src/lib/supabase/admin.ts` (secret-key client, null when not configured), `src/lib/supabase/database.types.ts` (generated).
- `Env:` new vars in `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_SECRET`, `CLASSIFIER_MODEL`, `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`, `GLOBAL_DAILY_SCAN_CAP`. URL, publishable key and a generated `APP_SECRET` are already in `.env.local`.
- Config: deps `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `server-only`, `vitest`; `@types/node` bumped to 24 (matches Node 24). Scripts `typecheck`, `test`, `test:watch`. `next.config.ts`: server-action body limit 4.5 MB, baseline security headers (camera allowed for same origin).
- `Env:` `SUPABASE_SECRET_KEY` is now set in `.env.local` (verified against the REST API), so persistence, history, sharing and stats are live locally. It must also be added to Vercel's encrypted env vars before deploy.
- Auth: verified the Google provider is already enabled in Supabase and signups are open (sign-in and registration are the same OAuth flow; the first login creates the user + profile).
- `Action needed:` make sure Auth > URL Configuration > Redirect URLs includes `http://localhost:3000/auth/callback` and the production `https://<domain>/auth/callback` (not readable via the API), and that the Google Cloud OAuth client lists `https://buuyvmasbomxzyrwfkxo.supabase.co/auth/v1/callback` as an authorized redirect URI.
