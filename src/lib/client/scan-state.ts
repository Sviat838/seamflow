import type { Scan } from "@/lib/types";
import { errorCopy, type ClientErrorCode, type ErrorCopy } from "./errors";

/**
 * What the scan UI should render. `previewUrl` is a local object URL of the picked file, so the
 * photo can be shown while analyzing and after the verdict (scan.imageUrl is null when not persisted).
 */
export type ScanState =
  | { status: "idle" }
  | { status: "preparing"; previewUrl: string | null }
  | { status: "uploading"; previewUrl: string | null; progress: number }
  | { status: "analyzing"; previewUrl: string | null }
  | { status: "done"; previewUrl: string | null; scan: Scan }
  | {
      status: "error";
      previewUrl: string | null;
      code: ClientErrorCode;
      /** User-safe message from the server or helper; `copy` is the house-style version. */
      message: string;
      copy: ErrorCopy;
      requestId?: string;
      retryAfterSeconds?: number;
    };

export type ScanStatus = ScanState["status"];

type ActiveState = Extract<ScanState, { status: "preparing" | "uploading" | "analyzing" }>;

/** Reducer state: `run` identifies the current submission so late results from older ones are dropped. */
export interface ScanMachine {
  run: number;
  state: ScanState;
}

export const initialScanMachine: ScanMachine = { run: 0, state: { status: "idle" } };

export interface ScanFailure {
  code: ClientErrorCode;
  message: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

export type ScanAction =
  | { type: "start"; run: number; previewUrl: string | null }
  | { type: "prepared"; run: number }
  | { type: "progress"; run: number; fraction: number }
  | { type: "succeeded"; run: number; scan: Scan }
  | { type: "failed"; run: number; error: ScanFailure }
  | { type: "reset"; run: number };

export function isActiveScan(state: ScanState): state is ActiveState {
  return state.status === "preparing" || state.status === "uploading" || state.status === "analyzing";
}

export function scanReducer(machine: ScanMachine, action: ScanAction): ScanMachine {
  if (action.type === "start") {
    return { run: action.run, state: { status: "preparing", previewUrl: action.previewUrl } };
  }
  if (action.type === "reset") return { run: action.run, state: { status: "idle" } };
  // A result from a superseded or cancelled submission must never overwrite the current one.
  if (action.run !== machine.run) return machine;

  const { state } = machine;
  const next = (nextState: ScanState): ScanMachine => ({ run: machine.run, state: nextState });

  switch (action.type) {
    case "prepared":
      return state.status === "preparing"
        ? next({ status: "uploading", previewUrl: state.previewUrl, progress: 0 })
        : machine;
    case "progress": {
      if (state.status !== "uploading") return machine;
      const progress = Math.min(1, Math.max(0, action.fraction));
      if (progress >= 1) return next({ status: "analyzing", previewUrl: state.previewUrl });
      // Progress only moves forward; out-of-order events would make the bar jitter.
      return progress > state.progress ? next({ ...state, progress }) : machine;
    }
    case "succeeded":
      return isActiveScan(state) ? next({ status: "done", previewUrl: state.previewUrl, scan: action.scan }) : machine;
    case "failed": {
      if (!isActiveScan(state)) return machine;
      const { code, message, requestId, retryAfterSeconds } = action.error;
      return next({
        status: "error",
        previewUrl: state.previewUrl,
        code,
        message,
        copy: errorCopy(code, { retryAfterSeconds }),
        requestId,
        retryAfterSeconds,
      });
    }
  }
}
