// The first three audit-trail entries of every case (uploaded, screened, classified), in the board's
// wording. Pure: only claims what intake actually checked.
import type { AuditEventInput } from "@/lib/audit/record";
import { shortFingerprint } from "@/lib/certificates/mappers";
import { POLICY_ENGINE, POLICY_VERSION } from "@/lib/policy";
import { IMAGE_RETENTION_HOURS, type AcceptedImageType, type Verdict } from "@/lib/types";

/** Where uploads come from. Every upload today goes through the web app (API keys are Business-only). */
export const UPLOAD_CHANNEL = "Web console";
export const INTAKE_ACTOR = "HDX intake";

const TYPE_LABELS: Record<AcceptedImageType, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "HOT DOG at 99.2% confidence under Policy v3.2, §2.1." */
export function verdictSentence(verdict: Verdict, confidence: number, policyClause: string): string {
  const label = verdict === "hot_dog" ? "HOT DOG" : "NOT HOT DOG";
  return `${label} at ${(confidence * 100).toFixed(1)}% confidence under Policy v${POLICY_VERSION}, §${policyClause}.`;
}

export interface IntakeAuditInput {
  /** Who submitted, as people see them: display name, email, or "Anonymous visitor". */
  submitter: string;
  fileName: string | null;
  mimeType: AcceptedImageType;
  imageBytes: number;
  sha256: string;
  /** Whether the image made it into storage (it's then deleted after the retention window). */
  imageStored: boolean;
  verdict: Verdict;
  confidence: number;
  policyClause: string;
  model: string;
  /** The verdict was reused from an identical earlier image. */
  cached: boolean;
}

export function intakeAuditEvents(input: IntakeAuditInput): AuditEventInput[] {
  const fingerprint = shortFingerprint(input.sha256);
  const retention = input.imageStored
    ? `Image retained ${IMAGE_RETENTION_HOURS} hours, then deleted automatically.`
    : "Image not retained.";
  return [
    {
      event: "uploaded",
      actor: `${input.submitter} · ${UPLOAD_CHANNEL}`,
      detail: `${input.fileName ?? "Image"} received from ${input.submitter} via ${UPLOAD_CHANNEL}.`,
    },
    {
      event: "screened",
      actor: INTAKE_ACTOR,
      detail:
        `Image screened: ${TYPE_LABELS[input.mimeType]} verified from file contents, ${formatBytes(input.imageBytes)}` +
        `${fingerprint ? `, SHA-256 ${fingerprint}` : ""}. ${retention} No raw IP address stored.`,
    },
    {
      event: "classified",
      actor: `${input.model} · ${POLICY_ENGINE}`,
      detail:
        verdictSentence(input.verdict, input.confidence, input.policyClause) +
        (input.cached ? " Verdict reused from an identical earlier submission." : ""),
    },
  ];
}
