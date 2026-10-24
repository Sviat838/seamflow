# Backend architecture and contract

Seamflow ("Hot Dog or Not, Enterprise Edition"): upload an image, Claude vision decides **Hot Dog** or **Not Hot Dog**, and the result can be saved, shared, and rated.

This file is the contract between backend modules and the UI. Shared types live in `src/lib/types.ts`. If you change a signature here, update this file and add a `Contract:` line to `CHANGELOG.md`.

## Principles

- **The core flow never depends on optional services.** With only `ANTHROPIC_API_KEY` set, classification works and returns `persisted: false`. Supabase adds history, sharing, stats, and DB-backed rate limits.
- **All writes go through the Next.js server** with the secret key (`getAdminClient()`), after explicit ownership checks. Browser roles can only read their own rows.
- **One error type.** Throw `AppError(code, userSafeMessage, { cause })` from `src/lib/errors.ts`. API routes turn it into `ApiErrorBody`; server actions into `ActionResult`. Internal detail goes in `cause` and logs, never in responses.
- **Secrets stay server-side.** Any module touching env, keys, or the admin client starts with `import "server-only"`.
- **Next.js 16** (`node_modules/next/dist/docs/`): Middleware is now `src/proxy.ts`; `cacheComponents` is on (use `'use cache'` + `cacheLife`/`cacheTag`, not route `dynamic` exports); read the bundled docs before using any Next API.

## Identity

- Signed-in users: Supabase Auth (Google OAuth), session in cookies via `@supabase/ssr`.
- Anonymous visitors: httpOnly cookie `sf_vid` holding a random UUID, set by `src/proxy.ts` on first request (1 year, `SameSite=Lax`, `Secure` in production). Stored in `scans.visitor_id`, never sent to the browser in any payload.
- On sign-in, the visitor's anonymous scans are claimed (`user_id` set where `visitor_id` matches and `user_id` is null).
- **Owner of a scan:** `scan.user_id === viewer.userId`, or `scan.user_id IS NULL && scan.visitor_id === visitorId`.

## Module map

Each module has one owner area; signatures below are what other modules may import.

### Shared primitives (done)

| File | Exports |
| --- | --- |
| `src/lib/types.ts` | Domain + API types, `ACCEPTED_IMAGE_TYPES`, `MAX_IMAGE_BYTES`, `CLASSIFICATION_FLAGS`, `API_ERROR_CODES` |
| `src/lib/errors.ts` | `AppError`, `isAppError`, `ERROR_STATUS` |
| `src/lib/env.ts` | `serverEnv(): ServerEnv` (lazy, zod-validated; optional keys are `undefined` when unset) |
| `src/lib/supabase/admin.ts` | `getAdminClient(): AdminClient \| null`, `SCANS_BUCKET` |
| `src/lib/supabase/database.types.ts` | Generated `Database` type |

### AI classifier: `src/lib/ai/**`

```ts
// src/lib/ai/index.ts
export interface ClassifyInput {
  bytes: Uint8Array;
  mimeType: AcceptedImageType;
  signal?: AbortSignal;
}
export interface ClassifierOutput {
  classification: Classification; // validated, clamped, flags filtered to CLASSIFICATION_FLAGS
  model: string;                  // model id actually used
  latencyMs: number;
}
/** Throws AppError: AI_NOT_CONFIGURED | AI_TIMEOUT | AI_UNAVAILABLE | UNPROCESSABLE_IMAGE. */
export function classifyImage(input: ClassifyInput): Promise<ClassifierOutput>;

// src/lib/ai/image.ts (pure, no server-only import; safe for tests)
/** Detects the real type from magic bytes, ignoring the declared Content-Type. */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null;
/** Throws AppError: IMAGE_TOO_LARGE | UNSUPPORTED_MEDIA_TYPE | INVALID_IMAGE. Returns the sniffed type. */
export function assertValidImage(bytes: Uint8Array): AcceptedImageType;
```

- Model: `CLASSIFIER_MODEL` (default `claude-opus-5-5`, effort low; `claude-haiku-5-5` is the overload fallback and the cheaper/faster override). An override must support structured outputs and `effort`.
- Error mapping: missing key → `AI_NOT_CONFIGURED`; 25 s budget exceeded → `AI_TIMEOUT` (retryable); 429/5xx/529/connection → `AI_UNAVAILABLE` (retryable, `retryAfterSeconds` passed through); bad key or unknown model (401/403/404) → `AI_UNAVAILABLE` (not retryable); 400/413/422, a refusal, or unusable output after one repair retry → `UNPROCESSABLE_IMAGE`. If the caller's `signal` aborts, its abort reason is rethrown as is.
- The classifier doesn't log; `createScan` logs one `scans.verdict` line per scan (model, latencyMs, cached, persisted), and `jsonError`/`toActionError` log failures with the full `cause` chain.

### Supabase session + auth: `src/lib/supabase/{server,browser}.ts`, `src/lib/auth/**`, `src/proxy.ts`, `src/app/auth/**`, `src/app/actions/auth.ts`

```ts
// src/lib/supabase/server.ts
/** Cookie-bound, user-scoped client (RLS applies). Null when Supabase isn't configured. */
export function createServerSupabase(): Promise<SupabaseClient<Database> | null>;

// src/lib/supabase/browser.ts ("use client" safe)
export function getBrowserSupabase(): SupabaseClient<Database> | null;

// src/lib/auth/viewer.ts
export interface ViewerContext {
  viewer: Viewer;     // safe to pass to client components
  visitorId: string;  // server-only; never serialize to the client
}
/** Reads the Supabase session and the sf_vid cookie (creating it if allowed in this context). */
export function getViewerContext(): Promise<ViewerContext>;

// src/lib/auth/claim.ts
/** Moves a visitor's anonymous scans to a user. Returns how many were claimed. No-op without Supabase. */
export function claimVisitorScans(userId: string, visitorId: string): Promise<number>;

// src/app/actions/auth.ts ("use server")
export function signInWithGoogle(formData?: FormData): Promise<void>; // redirects; optional `next` field
export function signOut(): Promise<void>;                             // redirects to "/"
/** Email + password, no confirmation email. Form fields: mode ("sign_in" | "sign_up"), email, password, next. */
export function passwordAuthAction(prev: unknown, formData: FormData): Promise<PasswordAuthState>; // redirects on success; returns { error, email, mode, field } on failure

// src/lib/auth/password.ts: authenticateWithPassword(credentials, { headers, requestId })
// src/lib/auth/credentials.ts (pure): parseCredentialsForm, mapAuthError (GoTrue error code -> friendly AppError)
// src/lib/auth/after-sign-in.ts: finishSignIn() claims visitor scans and reports hasCompany (shared with /auth/callback)
```

**Email + password.** Sign-up never depends on the dashboard's "Confirm email" setting and sends no email: the account is created server-side with `auth.admin.createUser({ email, password, email_confirm: true })`, then `signInWithPassword` on the cookie-bound client sets the session. Passwords are 8 to 72 characters on sign-up. Attempts are rate limited through `consume_rate_limit()` (`enforceAuthRateLimit`): per IP hash (sign-in 10/min and 60/h, sign-up 5/min and 20/h) and, for sign-in, per HMAC'd email (20/h). Errors: taken email → `CONFLICT` "An account with this email already exists…"; wrong email or password → `UNAUTHORIZED` "Wrong email or password." (never says which); too many attempts → `RATE_LIMITED`. After sign-in the flow is the same as Google: visitor scans are claimed and accounts without a company go to `/onboarding?next=...`.

Routes: `GET /auth/callback` (exchange code, claim visitor scans, redirect to `next`, same-origin only). Error display is the UI's job: failed or cancelled sign-in lands on `/?auth_error=1`, and on `/?auth_error=not_configured` when Supabase isn't configured.

`signInWithGoogle` sends `redirectTo=<origin>/auth/callback?next=...`. Supabase matches non-Site-URL hosts against the Redirect URLs allow-list as globs that include the query string, so the allow-list needs globstar entries (`http://localhost:3000/**`, `https://*-<team>.vercel.app/**`), with the Site URL set to the production origin.

### Platform: `src/lib/http/**`, `src/lib/log.ts`, `src/lib/rate-limit.ts`, `src/app/api/health/route.ts`, `vitest.config.ts`

```ts
// src/lib/http/request.ts
export function getRequestId(headers: Headers): string;     // x-request-id / x-vercel-id, else random
export function getClientIp(headers: Headers): string | null; // x-forwarded-for first hop, x-real-ip
export function hashIp(ip: string | null): string | null;   // HMAC-SHA256 with APP_SECRET, hex, truncated

// src/lib/http/respond.ts
export function jsonOk<T>(data: T, init?: ResponseInit & { requestId?: string }): Response;
/** Maps AppError (and unknown errors as INTERNAL) to ApiErrorBody; sets Retry-After and X-Request-Id; logs. */
export function jsonError(error: unknown, requestId: string): Response;
/** Same mapping for server actions. */
export function toActionError(error: unknown, requestId: string): { ok: false; error: ApiError };

// src/lib/log.ts
export const log: {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}; // one JSON line per event; never log secrets, raw IPs, or image bytes

// src/lib/rate-limit.ts
export interface RateLimitSubject { userId: string | null; visitorId: string; ipHash: string | null }
/**
 * Per-subject per-minute and per-day limits plus the global daily cap.
 * Throws AppError RATE_LIMITED (with retryAfterSeconds) or CAPACITY_EXCEEDED.
 * DB-backed via consume_rate_limit(); falls back to an in-memory limiter without Supabase.
 */
export function enforceScanRateLimit(subject: RateLimitSubject): Promise<void>;
```

- Buckets are consumed in two steps: subject and IP buckets first (in parallel), the global bucket only if they pass, so a throttled client can't burn the global daily cap.
- If an RPC call fails, only the failed buckets fall back to the in-memory limiter (per instance, logged once per request).
- `jsonError` and `toActionError` rethrow Next.js control-flow errors (`redirect()`, `notFound()`, prerender bailouts) via `unstable_rethrow`; every application error comes back as a value.

### Scans: `src/lib/scans/**`, `src/app/api/v1/**`, `src/app/actions/scans.ts`

```ts
// src/lib/scans/service.ts
export interface CreateScanInput {
  file: File | Blob;
  isPublic?: boolean;
  requestId: string;
  headers: Headers; // for IP hashing
}
/** validate → rate limit → reuse by sha256 or classify (image upload runs in parallel) → persist → DTO. */
export function createScan(input: CreateScanInput): Promise<Scan>;
export function updateScan(id: string, patch: UpdateScanRequest): Promise<Scan>; // owner only
export function deleteScan(id: string): Promise<void>;                            // owner only; removes image too

// src/lib/scans/queries.ts (for Server Components and route handlers)
export function getScanForViewer(id: string): Promise<Scan | null>;     // owner, or public
export function getPublicScanBySlug(slug: string): Promise<Scan | null>; // only is_public scans
export function listViewerScans(opts?: { limit?: number; cursor?: string | null }): Promise<ListScansResponse>;
export function getGlobalStats(): Promise<GlobalStats>; // cached ('use cache', tag "stats"); zeros without Supabase

// src/app/actions/scans.ts ("use server"; all return ActionResult, never throw)
export function createScanAction(prev: unknown, formData: FormData): Promise<ActionResult<Scan>>; // useActionState-compatible
export function updateScanAction(id: string, patch: UpdateScanRequest): Promise<ActionResult<Scan>>;
export function deleteScanAction(id: string): Promise<ActionResult<{ id: string }>>;
```

- The create form field `public` accepts `"true"`, `"false"`, or `"on"` (what a plain checkbox sends).
- Reused verdicts (identical bytes, by sha256) have `cached: true` and `latencyMs: null`. Results that weren't saved have `persisted: false`, `shareSlug: null`, `imageUrl: null` and `isPublic: false`.
- Actions call `refresh()` after a successful mutation, so the current route re-renders in the same response. The HTTP API can't do that; `useScan` callers use `router.refresh()`.
- `getScanForViewer`/`getPublicScanBySlug` return null for unknown, malformed or invisible ids; routes turn that into 404. A non-owner changing a public scan gets FORBIDDEN, a private one NOT_FOUND.
- `listViewerScans` (and the other viewer queries) always read the viewer's cookies, so they're request-time even without Supabase: call them inside `<Suspense>`.
- `getGlobalStats` always uses `cacheLife("minutes")`. A failed or slow (3 s) stats RPC returns zeros instead of throwing, so a DB blip during `next build` can't fail pages that render stats in the static shell.
- Pages hosting `createScanAction` should `export const maxDuration = 60` (route config can't live in a `"use server"` file); `POST /api/v1/scans` already does.

### Client helpers: `src/lib/client/**` (browser-only, no server imports)

Import from `@/lib/client`. Practical usage is in [`FRONTEND_INTEGRATION.md`](./FRONTEND_INTEGRATION.md).

```ts
type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "ABORTED";
export function prepareImage(file: File, opts?: { maxDimension?: number; quality?: number }): Promise<File>; // EXIF-aware downscale → JPEG (alpha flattened on white) under MAX_IMAGE_BYTES; small valid files pass through
export function uploadScan(file: File, opts?: { isPublic?: boolean; onProgress?: (fraction: number) => void; signal?: AbortSignal }): Promise<Scan>;
export class ScanRequestError extends Error { code: ClientErrorCode; requestId?: string; retryAfterSeconds?: number; status?: number }
export function errorCopy(code: ClientErrorCode, opts?: { retryAfterSeconds?: number }): { title: string; body: string }; // enterprise-tone UI copy
export function isRetryableCode(code: ClientErrorCode): boolean;
export const FLAG_LABELS: Record<ClassificationFlag, string>;
export const FLAG_DESCRIPTIONS: Record<ClassificationFlag, string>;
// ScanState is defined in src/lib/client/scan-state.ts: idle → preparing → uploading → analyzing → done | error
export function useScan(): { state: ScanState; isBusy: boolean; submit(file: File, opts?: { isPublic?: boolean }): void; retry(): void; reset(): void };
```

## HTTP API

All JSON. Errors: `ApiErrorBody` with the status from `ERROR_STATUS`. Every response carries `X-Request-Id`.

| Method | Path | Auth | Body / query | 2xx |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/scans` | visitor or user | multipart: `image` (File), `public` ("true"/"false"/"on") | 201 `CreateScanResponse` |
| GET | `/api/v1/scans` | visitor or user | `?limit=1..50&cursor=` | 200 `ListScansResponse` |
| GET | `/api/v1/scans/{id}` | owner, or anyone if public | | 200 `GetScanResponse` |
| PATCH | `/api/v1/scans/{id}` | owner | `UpdateScanRequest` | 200 `GetScanResponse` |
| DELETE | `/api/v1/scans/{id}` | owner | | 204 |
| GET | `/api/v1/shared/{slug}` | anyone | | 200 `GetScanResponse` (public scans only) |
| GET | `/api/v1/stats` | anyone | | 200 `GetStatsResponse` |
| GET | `/api/health` | anyone | | 200 `HealthResponse` (`degraded` still 200) |
| GET | `/auth/callback` | | `?code=&next=` | 307 |

Rate limits (defaults, env-tunable): 10 scans/min and 100/day per subject (user, else visitor), the same limits x3 per IP hash (shared IPs: offices, carrier NAT), 2000 scans/day globally. Reused (cached) verdicts still count; invalid uploads are rejected before they spend quota.

## Database

Schema: `supabase/migrations/`. Tables `profiles`, `scans`; `private.rate_limits`; RPCs `consume_rate_limit`, `get_global_stats` (service role only); private bucket `scans` with objects at `{userId|"anon"}/{scanId}.{ext}`.

Regenerate types after any migration (Supabase connector `generate_typescript_types` with project `buuyvmasbomxzyrwfkxo`) into `src/lib/supabase/database.types.ts`.
