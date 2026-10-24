// Browser-side helpers for the scan flow. Only use-scan.ts is a client module, so Server
// Components can import the copy and labels from here too.
export {
  CLIENT_ERROR_CODES,
  errorCopy,
  formatRetryAfter,
  isRetryableCode,
  isScanRequestError,
  ScanRequestError,
  toScanRequestError,
  type ClientErrorCode,
  type ErrorCopy,
} from "./errors";
export { FLAG_DESCRIPTIONS, FLAG_LABELS } from "./flags";
export { prepareImage, type PrepareImageOptions } from "./prepare-image";
export type { ScanState, ScanStatus } from "./scan-state";
export { uploadScan, type UploadScanOptions } from "./upload";
export { useScan, type SubmitScanOptions, type UseScanResult } from "./use-scan";
