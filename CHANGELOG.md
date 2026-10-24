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
