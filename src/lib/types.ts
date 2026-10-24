// Shared domain + API contract between the backend and the UI.
// Safe to import from server and client code: no secrets, no server-only imports.
// Changing anything here is a contract change: log it in CHANGELOG.md with a "Contract" line.

export type Verdict = "hot_dog" | "not_hot_dog";
export type ScanFeedback = "correct" | "incorrect";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** Hard upload cap. Stays under Vercel's 4.5 MB request-body limit and Claude's 5 MB image limit. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Longest edge the client should downscale to before upload. Claude downsamples anything larger. */
export const RECOMMENDED_MAX_DIMENSION = 1568;

/** Nuance chips the classifier can attach to a verdict. The verdict itself stays binary. */
export const CLASSIFICATION_FLAGS = [
  "illustration", // drawing, render, cartoon, or AI art
  "costume_or_toy", // hot dog costume, plush, model, or other non-food object
  "partial_view", // subject cropped, half-eaten, or partly obscured
  "multiple_items", // several foods or several hot dogs in frame
  "sausage_without_bun",
  "bun_without_sausage",
  "corn_dog",
  "actual_dog", // an animal. Possibly hot. Not a hot dog.
  "low_quality_image", // blurry, dark, tiny, or heavily compressed
  "text_in_image_ignored", // image contained text trying to steer the verdict
] as const;
export type ClassificationFlag = (typeof CLASSIFICATION_FLAGS)[number];

/** What the AI classifier decides about one image. Persisted in scans.details. */
export interface Classification {
  verdict: Verdict;
  /** 0..1, how sure the model is of `verdict`. */
  confidence: number;
  /** One sentence, enterprise tone. Shown as the headline under the verdict. */
  summary: string;
  /** One to three sentences explaining the call. */
  reasoning: string;
  /** Short lowercase labels of what the model saw, most salient first. */
  detectedItems: string[];
  flags: ClassificationFlag[];
  /** Policy v3.2 clause that decided the verdict (an id from POLICY_CLAUSES, e.g. "2.1"). Its verdict matches `verdict`. */
  policyClause: string;
  /** HDX Rating 0..100 (integer) for HOT DOG verdicts: how canonical the hot dog is. Null for NOT HOT DOG. */
  rating: number | null;
  /** One line explaining the rating. Null when `rating` is null. */
  ratingNote: string | null;
}

/** A scan as returned to the UI by API routes and server actions. */
export interface Scan {
  id: string;
  /** Public share id for /s/{shareSlug}; null when the scan wasn't persisted. */
  shareSlug: string | null;
  verdict: Verdict;
  confidence: number;
  summary: string;
  reasoning: string;
  detectedItems: string[];
  flags: ClassificationFlag[];
  /** Short-lived signed URL for the uploaded image, or null if it wasn't stored. */
  imageUrl: string | null;
  isPublic: boolean;
  feedback: ScanFeedback | null;
  model: string;
  latencyMs: number | null;
  /** True when an identical image was classified before and its verdict was reused. */
  cached: boolean;
  /** False when the database was unavailable: the result exists only in this response. */
  persisted: boolean;
  /** Whether the current viewer owns this scan (can give feedback, share, delete). */
  isOwner: boolean;
  /** ISO 8601. */
  createdAt: string;
  /** Human case id, e.g. "HDX-2026-1024-7731"; null when not persisted. Used in /cases/{caseNumber}. */
  caseNumber: string | null;
  policyClause: string;
  rating: number | null;
  ratingNote: string | null;
  /** Coarse processing region (REGION_CODES), null when unknown. */
  region: string | null;
  /** Original file name as uploaded (sanitized). */
  fileName: string | null;
  imageBytes: number | null;
  /** When the stored image is (or was) auto-deleted; null if no image was stored. */
  imageExpiresAt: string | null;
  imageDeleted: boolean;
  reviewStatus: ReviewStatus | null;
  certificate: CertificateSummary | null;
  /** Display name of the submitter; only for the owner and their company. */
  submittedBy: string | null;
}

export interface GlobalStats {
  totalScans: number;
  hotDogScans: number;
  notHotDogScans: number;
  scansLast24h: number;
  feedbackCorrect: number;
  feedbackIncorrect: number;
  /** feedbackCorrect / (feedbackCorrect + feedbackIncorrect), or null with no feedback yet. */
  accuracy: number | null;
  /** Since 00:00 UTC. */
  scansToday: number;
  hotDogScansToday: number;
  /** Median processing time over the last 7 days, or null with no data. */
  p50LatencyMs: number | null;
}

/** The signed-in user, or an anonymous visitor. Never includes the visitor cookie id. */
export interface Viewer {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  company: ViewerCompany | null;
  /** Signed in but hasn't picked a company yet: workspace pages redirect to /onboarding. */
  needsOnboarding: boolean;
}

// ---------------------------------------------------------------------------
// HTTP API (src/app/api/**)
// ---------------------------------------------------------------------------

/** POST /api/v1/scans: multipart/form-data with `image` (File) and optional `public` ("true" | "false"). */
export interface CreateScanResponse {
  scan: Scan;
}

/** GET /api/v1/scans?limit=20&cursor=... : the viewer's own scans, newest first. */
export interface ListScansResponse {
  scans: Scan[];
  nextCursor: string | null;
}

/** PATCH /api/v1/scans/{id} body. Owner only. */
export interface UpdateScanRequest {
  feedback?: ScanFeedback | null;
  isPublic?: boolean;
}

/** GET /api/v1/scans/{id} and GET /api/v1/shared/{slug}. */
export interface GetScanResponse {
  scan: Scan;
}

/** GET /api/v1/stats */
export interface GetStatsResponse {
  stats: GlobalStats;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  checks: {
    anthropic: "configured" | "missing";
    database: "ok" | "unavailable" | "not_configured";
  };
  time: string;
}

export const API_ERROR_CODES = [
  "INVALID_REQUEST", // malformed body or params
  "INVALID_IMAGE", // bytes aren't a decodable image
  "UNSUPPORTED_MEDIA_TYPE", // not jpeg/png/webp/gif
  "IMAGE_TOO_LARGE", // over MAX_IMAGE_BYTES
  "UNPROCESSABLE_IMAGE", // the model couldn't or wouldn't assess it
  "RATE_LIMITED", // per-visitor/user/IP limit hit; see retryAfterSeconds
  "CAPACITY_EXCEEDED", // global daily budget exhausted
  "AI_UNAVAILABLE", // provider error/overload after retries
  "AI_TIMEOUT",
  "AI_NOT_CONFIGURED", // ANTHROPIC_API_KEY missing
  "UNAUTHORIZED", // needs sign-in
  "FORBIDDEN", // signed in / identified, but not the owner
  "NOT_FOUND",
  "QUOTA_EXCEEDED", // Free plan's FREE_CLASSIFICATION_LIMIT used up
  "CONFLICT", // e.g. company name taken, case already under review
  "INTERNAL",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  code: ApiErrorCode;
  /** Safe to show to end users. */
  message: string;
  requestId: string;
  retryAfterSeconds?: number;
}

/** Body of every non-2xx API response. */
export interface ApiErrorBody {
  error: ApiError;
}

/** Return shape of every server action, so forms can use useActionState without try/catch. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// ---------------------------------------------------------------------------
// Phase 2: plans, companies, certificates, feed, appeals, audit, leads (docs/APP.md)
// ---------------------------------------------------------------------------

/** Free plan: classifications included in total (not per month). */
export const FREE_CLASSIFICATION_LIMIT = 20;
/** Uploaded images are deleted automatically after this many hours. */
export const IMAGE_RETENTION_HOURS = 24;

export const CERTIFICATE_DISCLAIMER =
  "This certificate attests to the visual classification of the submitted image under Policy v3.2. It makes no claim about ingredients, nutrition or food safety.";
export const SHORT_DISCLAIMER =
  "Visual classification only. HDX makes no claim about ingredients, nutrition or food safety.";

/** Coarse processing regions shown in the global feed. */
export const REGION_CODES = ["EU-C", "EU-W", "EU-N", "US-E", "US-C", "US-W", "SA-E", "AP-NE", "AP-SE", "AP-S", "AF-S"] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export type PlanTier = "anonymous" | "free" | "business";
export interface Usage {
  plan: PlanTier;
  used: number;
  /** null = unlimited (Business). */
  limit: number | null;
  remaining: number | null;
}

export type CompanyRole = "owner" | "member";
export interface ViewerCompany {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "business";
  role: CompanyRole;
  isListed: boolean;
}

export interface OnboardingInput {
  companyName: string;
  jobTitle?: string | null;
}
export interface OnboardingResult {
  /** "joined" when the email domain matched an existing company. */
  kind: "created" | "joined";
  company: ViewerCompany;
}

export type ReviewStatus = "pending" | "upheld" | "overturned";
export type CertificateStatus = "valid" | "revoked";

export interface CertificateSummary {
  /** "HDX-C-0088301" */
  number: string;
  /** "7KQ2-M9XD", printed on labels and encoded in the QR (/v/{code}). */
  code: string;
  status: CertificateStatus;
  issuedTo: string;
  productName: string | null;
  sku: string | null;
  /** ISO 8601. */
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  verificationCount: number;
}

/** Everything the public verify page and the PDF show. No images, people or case numbers. */
export interface PublicCertificate extends CertificateSummary {
  verdict: Verdict;
  confidence: number;
  policyClause: string;
  rating: number | null;
  ratingNote: string | null;
  /** Shortened SHA-256 of the image, e.g. "9f2c…e41a"; null if unknown. */
  fingerprint: string | null;
  /** Set only when the issuing company is publicly listed. */
  companySlug: string | null;
  model: string | null;
  /** Built-in sample record (SAMPLE_CERTIFICATE_CODE), never stored. */
  isSample: boolean;
}

/** A certificate in the workspace list, with its case. */
export interface ViewerCertificate extends CertificateSummary {
  caseNumber: string;
  verdict: Verdict;
  rating: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  slug: string;
  /** Smoothed company HDX Rating, 0..100, one decimal. */
  score: number;
  ratedHotDogs: number;
  certifiedHotDogs: number;
  totalScans: number;
  /** 0..1 */
  hotDogShare: number;
  lastActivity: string;
}

export interface CertifiedProduct {
  certificateNumber: string;
  code: string;
  productName: string | null;
  sku: string | null;
  rating: number | null;
  ratingNote: string | null;
  issuedAt: string;
}

export interface CompanyProfile {
  name: string;
  slug: string;
  memberSince: string;
  /** null when the company has no HOT DOG yet (not ranked). */
  entry: LeaderboardEntry | null;
  products: CertifiedProduct[];
}

export interface FeedItem {
  /** Stable opaque row key (not a scan id). */
  key: string;
  /** ISO 8601. */
  time: string;
  region: string | null;
  verdict: Verdict;
  confidence: number;
  /** The viewer's own case, highlighted as "This case". */
  highlight: boolean;
}

export interface FeedSnapshot {
  items: FeedItem[];
  verdictsToday: number;
  /** 0..1, null with no verdicts today. */
  hotDogShareToday: number | null;
  /** Always 0. The product has never issued a third answer. */
  ambiguousAllTime: 0;
  p50LatencyMs: number | null;
  generatedAt: string;
}

export interface AppealView {
  status: ReviewStatus;
  reason: string;
  ruling: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export const AUDIT_EVENT_TYPES = [
  "uploaded",
  "screened",
  "classified",
  "certificate_issued",
  "product_updated",
  "appeal_filed",
  "appeal_upheld",
  "appeal_overturned",
  "certificate_revoked",
  "image_deleted",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditEvent {
  event: AuditEventType;
  actor: string;
  detail: string;
  occurredAt: string;
  hash: string;
  prevHash: string | null;
}

export const MONTHLY_VOLUMES = ["<1k", "1k-10k", "10k-100k", "100k-1m", ">1m"] as const;
export type MonthlyVolume = (typeof MONTHLY_VOLUMES)[number];

export interface LeadInput {
  name: string;
  email: string;
  company: string;
  role?: string | null;
  monthlyVolume?: MonthlyVolume | null;
  useCase?: string | null;
  /** Where the form was opened from, e.g. "plans", "verify". */
  source?: string | null;
}
