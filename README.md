# HDX — Hot Dog or Not, Enterprise Edition

Upload a photo and get one of exactly two verdicts: **HOT DOG** or **NOT HOT DOG**. Every verdict cites the clause of the published *Hot Dog Definition Policy v3.2* that decided it, comes with a confidence score and reasoning, and is issued as a **Certificate of Classification** with a QR code that businesses can print on their products. Shoppers scan the label to verify it. Dead-serious enterprise software for one absurd binary question.

Live: https://seamflowtest.sviat.info

## Features

- **Classify without signing up.** Drag, drop, paste or photograph an image; 20 free classifications in total. Images are downscaled in the browser, validated by magic bytes on the server, and classified by Claude vision with structured output.
- **Binary verdict backed by policy.** Each verdict names its clause (`src/lib/policy.ts`); HOT DOG verdicts also get an **HDX Rating** (0–100: how canonical the hot dog is).
- **Certificates and QR labels.** Every saved verdict gets a certificate (`HDX-C-…`, code `XXXX-XXXX`), a downloadable A4 PDF, and a printable label sheet (60/40/25 mm). Public verification at `/v/{code}` with a scan counter.
- **Appeals.** "Request human review" sends the case to the *Hot Dog Review Board* (a second, stronger model). Overturned verdicts revoke their certificate, and every label shows *Revoked* on the next scan.
- **Audit trail.** Append-only, SHA-256 chained per case by a database trigger; CSV export.
- **Companies and leaderboard.** Google sign-in, one account = one company. `/companies` ranks companies by a smoothed average of their HDX Ratings, so one lucky photo can't top the table.
- **Live global feed.** Anonymised: time, coarse region, verdict, confidence. Never images or company names.
- **Business plan.** No prices: "Contact us" stores a lead.

## Architecture

- **Next.js 16** App Router (`cacheComponents`), React 19, Tailwind CSS v4, TypeScript strict.
- **Supabase**: Postgres (RLS on every table; all writes go through the server with the secret key), Auth (Google), Storage (private `scans` bucket, images deleted after 24 h).
- **Claude** via `@anthropic-ai/sdk` for classification (`src/lib/ai`) and appeal reviews.
- Contracts and module map: [`docs/BACKEND.md`](docs/BACKEND.md) (phase 1) and [`docs/APP.md`](docs/APP.md) (full product). Design: [`docs/design/`](docs/design/). Change log for parallel sessions: [`CHANGELOG.md`](CHANGELOG.md).

```
src/app            routes: landing, workspace (/classify, /cases, …), /v/[code], /labels, /companies, /contact, API
src/components     UI foundation (ui, brand, layout, verdict, feed) + page components
src/lib/ai         classifier + Hot Dog Review Board
src/lib/scans      create/list/access scans, quota, DTO mapping
src/lib/certificates, src/lib/pdf   certificates, verification, PDF rendering
src/lib/companies, src/lib/auth     onboarding, leaderboard, identity, proxy helpers
src/lib/appeals, feed, leads, audit engagement features
supabase/migrations                  schema (applied to the seamflow project)
```

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
```

Environment (see `.env.example`): `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_SECRET`, `CRON_SECRET`; optional `CLASSIFIER_MODEL`, `REVIEW_MODEL` and rate-limit overrides. Without Supabase keys the app still classifies but saves nothing.

Supabase: apply `supabase/migrations/*` in order, enable the Google provider, and add `http://localhost:3000/**` and `https://<domain>/auth/callback**` to Auth redirect URLs.

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` (Vitest; `LIVE_AI=1` runs the paid live classifier tests).

## Deployment

Vercel (functions in `dub1`, next to Supabase eu-west-1). Set the env vars above in the project; `vercel.json` runs the daily image-retention purge (`/api/cron/purge-images`, authorised by `CRON_SECRET`).

## Key decisions

- The verdict is binary and policy-backed; edge cases are settled by clauses (corn dogs are hot dogs under §2.4, pizza is not under §3.5).
- Free plan = 20 classifications in total (per company when signed in, per browser otherwise). Abuse limits: per-minute/day rate limits per visitor, user and IP, plus a global daily cap.
- Identical images reuse the earlier verdict (consistent answers, lower cost).
- Images are deleted after 24 hours; verdicts, certificates and audit records stay.
- Certificates make no claim about ingredients, nutrition or food safety.
