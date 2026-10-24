# Frontend integration guide

How to wire the UI to the backend. Signatures live in [`BACKEND.md`](./BACKEND.md) and types in `src/lib/types.ts`; this guide is the practical "what do I call, and what do I render" version.

Import map:

| What | From | Where it runs |
| --- | --- | --- |
| `useScan`, `prepareImage`, `uploadScan`, `errorCopy`, `isRetryableCode`, `FLAG_LABELS`, `FLAG_DESCRIPTIONS` | `@/lib/client` | Client Components (copy and labels also work in Server Components) |
| `createScanAction`, `updateScanAction`, `deleteScanAction` | `@/app/actions/scans` | Server actions, callable from Client Components |
| `signInWithGoogle`, `signOut` | `@/app/actions/auth` | Server actions, used as `<form action>` |
| `getViewerContext` | `@/lib/auth/viewer` | Server Components only |
| `listViewerScans`, `getPublicScanBySlug`, `getScanForViewer`, `getGlobalStats` | `@/lib/scans/queries` | Server Components only |
| `Scan`, `Viewer`, `GlobalStats`, `ApiErrorCode`, ... | `@/lib/types` | Anywhere |

**Next 16 + `cacheComponents` rule:** anything that reads the session, cookies, `params` or `searchParams` must sit inside a `<Suspense>` boundary, or the build fails. Every query above except `getGlobalStats` reads the viewer's cookies, so wrap the component that calls it, not the whole page.

## 1. Upload a photo

### Recommended: `useScan`

One hook handles resizing (EXIF-aware, so iPhone photos aren't sideways), upload progress, cancellation, and error copy.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isRetryableCode, useScan } from "@/lib/client";

export function Scanner() {
  const router = useRouter();
  const { state, isBusy, submit, retry, reset } = useScan();

  // The upload goes through the HTTP API, so server-rendered history doesn't refresh on its own.
  useEffect(() => {
    if (state.status === "done" && state.scan.persisted) router.refresh();
  }, [state, router]);

  return (
    <>
      <input
        type="file"
        accept="image/*"
        disabled={isBusy}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) submit(file, { isPublic: false });
          e.currentTarget.value = ""; // lets the user pick the same file again
        }}
      />
      <p aria-live="polite">{/* announce state.status changes here */}</p>
      {state.status === "uploading" && <progress value={state.progress} max={1} />}
      {state.status === "done" && <ScanResult scan={state.scan} previewUrl={state.previewUrl} />}
      {state.status === "error" && (
        <div role="alert">
          <h3>{state.copy.title}</h3>
          <p>{state.copy.body}</p>
          {isRetryableCode(state.code) ? <button onClick={retry}>Try again</button> : <button onClick={reset}>Choose another photo</button>}
          {state.requestId && <small>Reference: {state.requestId}</small>}
        </div>
      )}
    </>
  );
}
```

`useScan()` returns `{ state, isBusy, submit(file, { isPublic }), retry(), reset() }`. `submit` cancels any scan already in flight, `reset` cancels and returns to idle, and unmounting cancels too. Late results from a cancelled scan are dropped.

| `state.status` | Extra fields | What to show |
| --- | --- | --- |
| `idle` | | Drop zone, "Upload" and "Take photo" buttons |
| `preparing` | `previewUrl` | The photo, "Optimizing image…" (usually well under a second) |
| `uploading` | `previewUrl`, `progress` (0..1) | The photo with a progress bar |
| `analyzing` | `previewUrl` | The photo with a scanning animation. The model usually answers in a few seconds |
| `done` | `previewUrl`, `scan` | The result card (section 2) |
| `error` | `previewUrl`, `code`, `copy {title, body}`, `message`, `requestId?`, `retryAfterSeconds?` | `copy.title` + `copy.body`, then "Try again" or "Choose another photo" |

`previewUrl` is a local object URL of the picked file. Use it while waiting and as a fallback when `scan.imageUrl` is null. The hook revokes it on reset, on the next submit, and on unmount.

### Alternative: `createScanAction` with `useActionState`

Fine for a minimal form. You lose upload progress, and you should still run `prepareImage` first: phone photos are often over the 4 MB limit.

```tsx
"use client";

import { startTransition, useActionState, useState } from "react";
import { createScanAction } from "@/app/actions/scans";
import { errorCopy, prepareImage, toScanRequestError, type ErrorCopy } from "@/lib/client";

export function SimpleScanner() {
  const [result, formAction, pending] = useActionState(createScanAction, null);
  const [pickError, setPickError] = useState<ErrorCopy | null>(null);

  async function onPick(file: File) {
    setPickError(null);
    try {
      const form = new FormData();
      form.set("image", await prepareImage(file));
      form.set("public", "false");
      startTransition(() => formAction(form));
    } catch (error) {
      const err = toScanRequestError(error); // e.g. UNSUPPORTED_MEDIA_TYPE for HEIC on Chrome
      setPickError(errorCopy(err.code, err));
    }
  }
  // result: null | { ok: true, data: Scan } | { ok: false, error: ApiError }
  // Render result.data, or errorCopy(result.error.code, result.error), or pickError.
}
```

`createScanAction` calls `refresh()` on success, so server-rendered history updates without extra work. Add `export const maxDuration = 60;` to the `page.tsx` that uses it: a slow model call plus a retry can exceed the platform's default limit, and route config can't live in the actions file. (`useScan` goes through `POST /api/v1/scans`, which already sets it.) A plain `<form action={formAction}>` with `<input type="file" name="image">` and a `name="public"` checkbox works without JavaScript too, but skips resizing.

### File input tips

- `accept="image/*"` everywhere. The backend takes JPEG, PNG, WebP and GIF. `prepareImage` converts anything else the browser can decode (Safari decodes HEIC, so iPhone photos work there).
- Offer two buttons on mobile: **Take photo** with `capture="environment"` (opens the rear camera directly) and **Upload** without `capture` (opens the library). With `capture` set, iOS skips the library entirely.
- Drag and drop: `onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) submit(f); }}` plus `onDragOver={(e) => e.preventDefault()}`.
- Paste: `onPaste={(e) => { const f = e.clipboardData.files[0]; if (f) submit(f); }}` makes screenshots one keystroke away.
- `next.config.ts` already allows the camera for our own origin, so a live `getUserMedia` viewfinder will work if you build one.

## 2. Render a scan

| Field | Meaning | How to render |
| --- | --- | --- |
| `verdict` | `"hot_dog"` or `"not_hot_dog"`. Always binary | The hero: **Hot Dog** / **Not Hot Dog** |
| `confidence` | 0..1, how sure the model is of *this verdict* (a 0.97 Not Hot Dog is a confident "no") | `${Math.round(confidence * 100)}%`, a meter, or a "Confidence" stat |
| `summary` | One dry corporate sentence | Headline under the verdict |
| `reasoning` | One to three sentences explaining the call | Body text, or behind "View analyst notes" |
| `detectedItems` | Lowercase labels, most salient first (`["sausage", "bun", "mustard"]`) | Small tags or "Detected: sausage, bun, mustard" |
| `flags` | Nuance chips (`ClassificationFlag[]`), often empty | `FLAG_LABELS[flag]` as chip text, `FLAG_DESCRIPTIONS[flag]` as tooltip |
| `imageUrl` | Signed image URL, expires after 1 hour, or `null` | See section 8. Fall back to `previewUrl` or a placeholder |
| `cached` | An identical image was scanned before and its verdict was reused | Badge like "Retrieved from archive". `latencyMs` will be tiny or null |
| `persisted` | `false` when the database was unavailable: the result exists only in this response | Hide share, feedback and delete. Optional note: "This result wasn't saved" |
| `isOwner` | The current viewer owns the scan | Show feedback, share toggle, delete only when true |
| `isPublic` | Visible at `/s/{shareSlug}` | Share toggle state |
| `shareSlug` | Share id, set whenever `persisted` (even while private) | Share URL: `${location.origin}/s/${shareSlug}` |
| `feedback` | `"correct"`, `"incorrect"` or `null` | Thumbs up/down toggle state |
| `model`, `latencyMs` | Model id and classification time in ms | Fine print: "Processed by {model} in {latencyMs} ms" |
| `createdAt` | ISO 8601 | Format in a Client Component (or with a fixed `timeZone`) to avoid hydration mismatches |

```tsx
import { FLAG_DESCRIPTIONS, FLAG_LABELS } from "@/lib/client";

{scan.flags.map((flag) => (
  <span key={flag} title={FLAG_DESCRIPTIONS[flag]}>{FLAG_LABELS[flag]}</span>
))}
```

## 3. Errors

Every error carries a `code` (`ApiErrorCode`, plus the client-only `NETWORK_ERROR` and `ABORTED`). Render copy with `errorCopy(code, { retryAfterSeconds })`, which returns `{ title, body }` in the house voice and covers every code. Passing the whole error object works because it has `retryAfterSeconds`:

- `useScan`: already done for you in `state.copy`.
- Server action result: `errorCopy(result.error.code, result.error)`.
- Thrown by `prepareImage` / `uploadScan`: `errorCopy(err.code, err)` (they throw `ScanRequestError`; `toScanRequestError(anything)` normalizes).

Guidance:

- `isRetryableCode(code)` says whether to offer **Try again** (network, timeout, provider overload, rate limit, internal) or **Choose another photo** (bad, unsupported, oversized or unassessable image).
- `RATE_LIMITED` includes `retryAfterSeconds`; the copy already says "Capacity frees up in 30 seconds". You can also disable the button with a countdown.
- `CAPACITY_EXCEEDED` means the global daily budget is spent. Nothing to retry today.
- Show `requestId` as small "Reference: …" text on `INTERNAL` errors so reports can be traced in logs.
- `message` is a user-safe sentence from the server. Prefer `copy` for consistent tone.

## 4. Sign in and out

```tsx
import { signInWithGoogle, signOut } from "@/app/actions/auth";

<form action={signInWithGoogle}>
  <input type="hidden" name="next" value="/history" /> {/* optional: where to land after sign-in */}
  <button>Sign in with Google</button>
</form>

<form action={signOut}>
  <button>Sign out</button>
</form>
```

Show the current user from a Server Component inside `<Suspense>`:

```tsx
import { Suspense } from "react";
import { getViewerContext } from "@/lib/auth/viewer";

// In the header: the rest of the page stays in the static shell.
<Suspense fallback={<AccountSkeleton />}>
  <AccountMenu />
</Suspense>

async function AccountMenu() {
  const { viewer } = await getViewerContext();
  return viewer.isAuthenticated ? <UserMenu viewer={viewer} /> : <SignInButton />;
}
```

- Pass `viewer` (type `Viewer`: `isAuthenticated`, `userId`, `email`, `displayName`, `avatarUrl`) to Client Components freely. Never pass `visitorId` anywhere.
- Google avatars can 403 when sent a referrer: `<img src={viewer.avatarUrl} referrerPolicy="no-referrer" alt="" />`.
- Anonymous visitors already get history (by cookie). On first sign-in their anonymous scans move to the account automatically, so you can pitch sign-in as "keep your scans on every device".
- Failed or cancelled sign-in redirects to `/?auth_error=1` (`/?auth_error=not_configured` if Supabase is missing). Show a toast from a small client component that reads `useSearchParams()`, wrapped in `<Suspense fallback={null}>`.

## 5. History

```tsx
import { Suspense } from "react";
import { listViewerScans } from "@/lib/scans/queries";

export default function HistoryPage() {
  return (
    <Suspense fallback={<HistorySkeleton />}>
      <History />
    </Suspense>
  );
}

async function History() {
  const { scans, nextCursor } = await listViewerScans({ limit: 20 });
  if (scans.length === 0) return <EmptyState />; // "No assets processed yet"
  return <ScanGrid initialScans={scans} nextCursor={nextCursor} />;
}
```

Newest first, the viewer's own scans only. For "Load more", a Client Component fetches `GET /api/v1/scans?limit=20&cursor=${nextCursor}` (returns `ListScansResponse`) until `nextCursor` is `null`.

## 6. Share page: `/s/[slug]`

```tsx
// src/app/s/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { getPublicScanBySlug } from "@/lib/scans/queries";

type Props = { params: Promise<{ slug: string }> };

// Metadata and page share one lookup per request.
const getScan = cache(getPublicScanBySlug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const scan = await getScan((await params).slug);
  if (!scan) return { title: "Scan not found" };
  const verdict = scan.verdict === "hot_dog" ? "Hot Dog" : "Not Hot Dog";
  return { title: `${verdict} (${Math.round(scan.confidence * 100)}% confidence)`, description: scan.summary };
}

export default function SharedScanPage({ params }: Props) {
  return (
    <Suspense fallback={<ScanSkeleton />}>
      <SharedScan params={params} />
    </Suspense>
  );
}

async function SharedScan({ params }: Props) {
  const scan = await getScan((await params).slug);
  if (!scan) notFound();
  return <ScanResult scan={scan} />; // scan.isOwner tells you whether to show owner controls
}
```

- Only public scans resolve here, even for their owner. Private or deleted scans return `null`, so render `notFound()`. Because the page streams, an unknown slug renders the not-found UI with `noindex` but HTTP 200; that's expected with Suspense.
- Don't put `scan.imageUrl` in Open Graph metadata: it expires in an hour and crawlers cache previews for much longer. Use a static OG image, or an `opengraph-image.tsx` that renders the verdict text with `ImageResponse`.
- Share button flow: if `!scan.isPublic`, call `updateScanAction(scan.id, { isPublic: true })` first, then `navigator.share({ url })` on mobile with a clipboard fallback.

## 7. Stats, feedback, visibility, delete

**Stats** are cached site-wide, so they don't need `<Suspense>` and land in the static shell:

```tsx
import { getGlobalStats } from "@/lib/scans/queries";

async function StatsStrip() {
  const s = await getGlobalStats(); // all zeros without Supabase
  // s.totalScans, s.hotDogScans, s.notHotDogScans, s.scansLast24h,
  // s.feedbackCorrect, s.feedbackIncorrect, s.accuracy (0..1, or null before any feedback: show "—")
}
```

**Feedback, visibility, delete** from a Client Component (owner only; hide the controls when `!scan.isOwner || !scan.persisted`):

```tsx
"use client";

import { useTransition } from "react";
import { deleteScanAction, updateScanAction } from "@/app/actions/scans";
import { errorCopy } from "@/lib/client";

const [pending, startTransition] = useTransition();

function rate(feedback: "correct" | "incorrect" | null) {   // null clears it
  startTransition(async () => {
    const result = await updateScanAction(scan.id, { feedback });
    if (result.ok) setScan(result.data);
    else toast(errorCopy(result.error.code, result.error));
  });
}
// Visibility: updateScanAction(scan.id, { isPublic: true | false })
// Delete:     deleteScanAction(scan.id), result.data is { id }. Also removes the image.
```

Actions never throw; they return `ActionResult` and `refresh()` the current route, so server-rendered lists update on their own. Use `useOptimistic` if you want the thumbs to flip instantly. The same operations exist over HTTP (`PATCH /api/v1/scans/{id}` with JSON `{ feedback?, isPublic? }`, `DELETE /api/v1/scans/{id}` → 204) if you ever need them outside React.

## 8. Images

- `scan.imageUrl` is a signed URL to a private bucket, valid for **1 hour**, and `null` when the image wasn't stored (`persisted: false`, or storage failed).
- Render with a plain `<img>` or `next/image` with `unoptimized`. The optimizer would only cache a URL that's about to expire, and `unoptimized` also means no `remotePatterns` config is needed.

  ```tsx
  const src = scan.imageUrl ?? previewUrl; // previewUrl from useScan, when you have it
  {src ? <Image src={src} alt="Submitted image" width={640} height={640} unoptimized className="object-cover" /> : <Placeholder />}
  ```

- Right after a scan, prefer `state.previewUrl` from `useScan`: it's already in memory and shows instantly.
- Pages left open longer than an hour: handle `onError` on the image by calling `router.refresh()` (fresh URLs) or showing a placeholder. Don't cache components that render `imageUrl` with `'use cache'`.

## 9. Local development

- With `ANTHROPIC_API_KEY` only: scanning works, `persisted` is `false`, history is empty, stats are zero, share links are `null`. Build the UI for this state too.
- With `SUPABASE_SECRET_KEY` set as well (it is in `.env.local` now), everything persists.
- Limits: 10 scans/minute and 100/day per visitor, 2000/day globally. Hitting them in dev is a good way to see the `RATE_LIMITED` UI.
- `GET /api/health` returns `{ status, checks: { anthropic, database } }` if you want a status dot.
