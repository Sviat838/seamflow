// Pure row <-> DTO mapping for scans. No server-only imports, so it's cheap to unit test.
import { z } from "zod";
import { toCertificateSummary } from "@/lib/certificates/mappers";
import { defaultClauseFor, getClause } from "@/lib/policy";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  CLASSIFICATION_FLAGS,
  IMAGE_RETENTION_HOURS,
  type CertificateSummary,
  type Classification,
  type ClassificationFlag,
  type GlobalStats,
  type ReviewStatus,
  type Scan,
  type Verdict,
  type Viewer,
} from "@/lib/types";

type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
type CertificateRow = Database["public"]["Tables"]["certificates"]["Row"];
type StatsRow = Database["public"]["Functions"]["get_global_stats"]["Returns"][number];

/**
 * Columns every scan read selects, plus the scan's certificate (one-to-one, so an object or null).
 * Owner columns, company_id and image_path are needed for checks and signing; they never reach a DTO.
 */
export const SCAN_COLUMNS =
  "id, case_number, share_slug, user_id, visitor_id, company_id, verdict, confidence, summary, details, policy_clause, rating, rating_note, region, file_name, image_path, image_bytes, image_deleted_at, model, latency_ms, is_public, feedback, review_status, created_at, certificates(*)";

export type ScanRecord = Pick<
  ScanRow,
  | "id"
  | "case_number"
  | "share_slug"
  | "user_id"
  | "visitor_id"
  | "company_id"
  | "verdict"
  | "confidence"
  | "summary"
  | "details"
  | "policy_clause"
  | "rating"
  | "rating_note"
  | "region"
  | "file_name"
  | "image_path"
  | "image_bytes"
  | "image_deleted_at"
  | "model"
  | "latency_ms"
  | "is_public"
  | "feedback"
  | "review_status"
  | "created_at"
> & { certificates: CertificateRow | null };

export interface ScanOwnerContext {
  userId: string | null;
  visitorId: string;
}

/** Who is looking, reduced to what the access rule needs. */
export interface ScanViewer extends ScanOwnerContext {
  companyId: string | null;
}

export interface ScanAccess {
  /** Submitted it (same user, or the same visitor cookie for an unclaimed anonymous scan). */
  isOwner: boolean;
  /** The scan belongs to the viewer's company. */
  isCompanyMember: boolean;
  /** Owner or company member: may read the case and change it (feedback, sharing, product, delete). */
  canManage: boolean;
}

export function toScanViewer({ viewer, visitorId }: { viewer: Viewer; visitorId: string }): ScanViewer {
  return { userId: viewer.userId, visitorId, companyId: viewer.company?.id ?? null };
}

/** Owner: same user, or an unclaimed anonymous scan from the same visitor cookie. */
export function isScanOwner(
  row: Pick<ScanRow, "user_id" | "visitor_id">,
  { userId, visitorId }: ScanOwnerContext,
): boolean {
  if (row.user_id !== null) return row.user_id === userId;
  return row.visitor_id !== null && row.visitor_id === visitorId;
}

/** The phase-1 owner rule plus same-company members. */
export function scanAccess(row: Pick<ScanRow, "user_id" | "visitor_id" | "company_id">, viewer: ScanViewer): ScanAccess {
  const isOwner = isScanOwner(row, viewer);
  const isCompanyMember = row.company_id !== null && row.company_id === viewer.companyId;
  return { isOwner, isCompanyMember, canManage: isOwner || isCompanyMember };
}

const FLAGS: ReadonlySet<string> = new Set(CLASSIFICATION_FLAGS);
const isFlag = (value: unknown): value is ClassificationFlag =>
  typeof value === "string" && FLAGS.has(value);

const flagList = z
  .array(z.unknown())
  .catch([])
  .transform((items) => [...new Set(items.filter(isFlag))]);

const stringList = z
  .array(z.unknown())
  .catch([])
  .transform((items) => items.filter((item): item is string => typeof item === "string"));

const EMPTY_DETAILS = { reasoning: "", detectedItems: [], flags: [], cached: false };

// Lenient on purpose: old or partial rows still render, with blanks instead of a crash.
const detailsSchema = z
  .object({
    reasoning: z.string().catch(""),
    detectedItems: stringList,
    flags: flagList,
    cached: z.boolean().catch(false),
  })
  .catch(EMPTY_DETAILS);

export type ScanDetails = z.infer<typeof detailsSchema>;

export function parseScanDetails(details: Json | null | undefined): ScanDetails {
  return detailsSchema.parse(details);
}

/** Cuts by code points, so a limit never splits an emoji into an invalid surrogate. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

// The DB caps rating_note at 200 characters.
const MAX_RATING_NOTE_LENGTH = 200;

export interface VerdictFields {
  policyClause: string;
  rating: number | null;
  ratingNote: string | null;
}

/**
 * Applies the product rules to clause and rating: the clause must exist and match the verdict
 * (else the verdict's default clause), and only HOT DOG verdicts carry a 0–100 integer rating.
 */
export function toVerdictFields(
  verdict: Verdict,
  input: { policyClause?: string | null; rating?: number | null; ratingNote?: string | null },
): VerdictFields {
  const clause = input.policyClause ? getClause(input.policyClause) : undefined;
  const policyClause = clause && clause.verdict === verdict ? clause.id : defaultClauseFor(verdict);
  const rating =
    verdict === "hot_dog" && typeof input.rating === "number" && Number.isFinite(input.rating)
      ? Math.round(Math.min(100, Math.max(0, input.rating)))
      : null;
  const note = rating !== null ? input.ratingNote?.trim() : undefined;
  return { policyClause, rating, ratingNote: note ? truncate(note, MAX_RATING_NOTE_LENGTH) : null };
}

// Strict: a verdict is only reused when the stored row has everything a fresh one would.
const reusableSchema = z
  .object({
    verdict: z.enum(["hot_dog", "not_hot_dog"]),
    confidence: z.number().min(0).max(1),
    summary: z.string().min(1),
    reasoning: z.string().min(1),
    detectedItems: z.array(z.string()),
    flags: z.array(z.unknown()).transform((items) => [...new Set(items.filter(isFlag))]),
    policyClause: z.string(),
    rating: z.number().int().min(0).max(100).nullable(),
    ratingNote: z.string().nullable(),
  })
  // Phase-1 rows have no clause or rating: ask the model again rather than invent them.
  .refine((c) => getClause(c.policyClause)?.verdict === c.verdict)
  .refine((c) => (c.verdict === "hot_dog") === (c.rating !== null));

/** Rebuilds a stored Classification for sha256 reuse, or null if the row is incomplete. */
export function toReusableClassification(
  row: Pick<ScanRow, "verdict" | "confidence" | "summary" | "details" | "policy_clause" | "rating" | "rating_note">,
): Classification | null {
  const details =
    row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {};
  // Columns win over the JSON copy: they're what the UI, stats and certificates already show.
  const parsed = reusableSchema.safeParse({
    ...details,
    verdict: row.verdict,
    confidence: row.confidence,
    summary: row.summary,
    policyClause: row.policy_clause,
    rating: row.rating,
    ratingNote: row.rating_note,
  });
  return parsed.success ? parsed.data : null;
}

/** What goes into scans.details: the classifier's original output plus whether it was reused. */
export function toScanDetails(classification: Classification, cached: boolean): Json {
  return {
    verdict: classification.verdict,
    confidence: classification.confidence,
    summary: classification.summary,
    reasoning: classification.reasoning,
    detectedItems: [...classification.detectedItems],
    flags: [...classification.flags],
    policyClause: classification.policyClause,
    rating: classification.rating,
    ratingNote: classification.ratingNote,
    cached,
  };
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

function toIsoString(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}

const RETENTION_MS = IMAGE_RETENTION_HOURS * 60 * 60 * 1000;

export interface ImageRetention {
  /** ISO 8601; null when no image was ever stored. */
  expiresAt: string | null;
  /** Purged, or past the retention window (the daily purge may not have run yet). */
  deleted: boolean;
  /** Stored and still inside the window: the only case where a signed URL may be issued. */
  available: boolean;
}

export function imageRetention(
  row: Pick<ScanRow, "image_path" | "image_deleted_at" | "created_at">,
  now: number = Date.now(),
): ImageRetention {
  const wasStored = row.image_path !== null || row.image_deleted_at !== null;
  const created = Date.parse(row.created_at);
  const expiresMs = wasStored && Number.isFinite(created) ? created + RETENTION_MS : null;
  const deleted = row.image_deleted_at !== null || (expiresMs !== null && now >= expiresMs);
  return {
    expiresAt: expiresMs !== null ? new Date(expiresMs).toISOString() : null,
    deleted,
    available: row.image_path !== null && !deleted,
  };
}

const REVIEW_STATUSES: ReadonlySet<string> = new Set<ReviewStatus>(["pending", "upheld", "overturned"]);
const toReviewStatus = (value: string | null): ReviewStatus | null =>
  value !== null && REVIEW_STATUSES.has(value) ? (value as ReviewStatus) : null;

function certificateOf(row: ScanRecord): CertificateSummary | null {
  // PostgREST returns an object for this one-to-one embed; tolerate an array all the same.
  const embedded: unknown = row.certificates;
  const cert = Array.isArray(embedded) ? embedded[0] : embedded;
  return cert ? toCertificateSummary(cert as CertificateRow) : null;
}

export interface ToScanOptions {
  /** Whether the viewer can manage the scan (owner or company member); see ScanAccess.canManage. */
  isOwner: boolean;
  imageUrl: string | null;
  /** Submitter's display name; only shown to viewers who can manage the scan. */
  submittedBy?: string | null;
  /** Overrides the embedded certificate (e.g. one issued after the row was read). */
  certificate?: CertificateSummary | null;
  now?: number;
}

export function toScan(row: ScanRecord, opts: ToScanOptions): Scan {
  const details = parseScanDetails(row.details);
  const retention = imageRetention(row, opts.now);
  return {
    id: row.id,
    shareSlug: row.share_slug,
    verdict: row.verdict,
    confidence: clamp01(row.confidence),
    summary: row.summary,
    reasoning: details.reasoning,
    detectedItems: details.detectedItems,
    flags: details.flags,
    // Belt and braces: never hand out an image past its retention window, whoever signed it.
    imageUrl: retention.available ? opts.imageUrl : null,
    isPublic: row.is_public,
    feedback: row.feedback,
    model: row.model,
    latencyMs: row.latency_ms,
    cached: details.cached,
    persisted: true,
    isOwner: opts.isOwner,
    createdAt: toIsoString(row.created_at),
    caseNumber: row.case_number,
    ...toVerdictFields(row.verdict, {
      policyClause: row.policy_clause,
      rating: row.rating,
      ratingNote: row.rating_note,
    }),
    region: row.region,
    // File names can carry people's names; a public share shows neither.
    fileName: opts.isOwner ? row.file_name : null,
    imageBytes: row.image_bytes,
    imageExpiresAt: retention.expiresAt,
    imageDeleted: retention.deleted,
    reviewStatus: toReviewStatus(row.review_status),
    certificate: opts.certificate !== undefined ? opts.certificate : certificateOf(row),
    submittedBy: opts.isOwner ? (opts.submittedBy ?? null) : null,
  };
}

export interface UnsavedScanInput {
  id: string;
  classification: Classification;
  model: string;
  latencyMs: number | null;
  cached: boolean;
  createdAt: string;
  fileName?: string | null;
  region?: string | null;
  imageBytes?: number | null;
  submittedBy?: string | null;
}

/** A verdict that exists only in this response (no database, or the insert failed). */
export function toUnsavedScan({
  id,
  classification,
  model,
  latencyMs,
  cached,
  createdAt,
  fileName = null,
  region = null,
  imageBytes = null,
  submittedBy = null,
}: UnsavedScanInput): Scan {
  return {
    id,
    shareSlug: null,
    verdict: classification.verdict,
    confidence: clamp01(classification.confidence),
    summary: classification.summary,
    reasoning: classification.reasoning,
    detectedItems: classification.detectedItems,
    flags: classification.flags,
    imageUrl: null,
    // Nothing was stored, so nothing is shared, whatever the request asked for.
    isPublic: false,
    feedback: null,
    model,
    latencyMs,
    cached,
    persisted: false,
    isOwner: true,
    createdAt,
    caseNumber: null,
    ...toVerdictFields(classification.verdict, classification),
    region,
    fileName,
    imageBytes,
    imageExpiresAt: null,
    imageDeleted: false,
    reviewStatus: null,
    certificate: null,
    submittedBy,
  };
}

const count = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function toGlobalStats(row: StatsRow | null | undefined): GlobalStats {
  const feedbackCorrect = count(row?.feedback_correct);
  const feedbackIncorrect = count(row?.feedback_incorrect);
  const rated = feedbackCorrect + feedbackIncorrect;
  // The RPC returns null p50 with no scans in the last 7 days, whatever the generated type says.
  const p50: unknown = row?.p50_latency_ms;
  return {
    totalScans: count(row?.total_scans),
    hotDogScans: count(row?.hot_dog_scans),
    notHotDogScans: count(row?.not_hot_dog_scans),
    scansLast24h: count(row?.scans_last_24h),
    feedbackCorrect,
    feedbackIncorrect,
    accuracy: rated > 0 ? feedbackCorrect / rated : null,
    scansToday: count(row?.scans_today),
    hotDogScansToday: count(row?.hot_dog_scans_today),
    p50LatencyMs: typeof p50 === "number" && Number.isFinite(p50) && p50 >= 0 ? Math.round(p50) : null,
  };
}
