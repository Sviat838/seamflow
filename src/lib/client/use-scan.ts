"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { toScanRequestError } from "./errors";
import { prepareImage } from "./prepare-image";
import { initialScanMachine, isActiveScan, scanReducer, type ScanState } from "./scan-state";
import { uploadScan } from "./upload";

export interface SubmitScanOptions {
  /** Make the scan visible at its share link. Defaults to false. */
  isPublic?: boolean;
}

export interface UseScanResult {
  state: ScanState;
  /** True while preparing, uploading, or analyzing. */
  isBusy: boolean;
  /** Starts a scan, cancelling any scan already in flight. */
  submit(file: File, opts?: SubmitScanOptions): void;
  /** Resubmits the last file, e.g. after a timeout or network error. No-op if there isn't one. */
  retry(): void;
  /** Cancels any in-flight scan and returns to idle. */
  reset(): void;
}

/** Drives one scan at a time: idle → preparing → uploading → analyzing → done | error. */
export function useScan(): UseScanResult {
  const [machine, dispatch] = useReducer(scanReducer, initialScanMachine);
  const runRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);
  const lastRef = useRef<{ file: File; opts: SubmitScanOptions } | null>(null);

  // Stops the current run's network work and frees its preview; runs before every new run.
  const release = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  }, []);

  const submit = useCallback(
    (file: File, opts: SubmitScanOptions = {}) => {
      release();
      const run = ++runRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      const previewUrl = URL.createObjectURL(file);
      previewRef.current = previewUrl;
      lastRef.current = { file, opts };
      dispatch({ type: "start", run, previewUrl });

      void (async () => {
        try {
          const prepared = await prepareImage(file);
          // Decoding can't be cancelled, so check before starting the upload.
          if (controller.signal.aborted) return;
          dispatch({ type: "prepared", run });
          const scan = await uploadScan(prepared, {
            isPublic: opts.isPublic,
            fileName: file.name || prepared.name,
            signal: controller.signal,
            onProgress: (fraction) => dispatch({ type: "progress", run, fraction }),
          });
          dispatch({ type: "succeeded", run, scan });
        } catch (error) {
          // Cancelled by reset, unmount, or a newer submit: nobody is waiting for this result.
          if (controller.signal.aborted) return;
          const { code, message, requestId, retryAfterSeconds } = toScanRequestError(error);
          dispatch({ type: "failed", run, error: { code, message, requestId, retryAfterSeconds } });
        } finally {
          if (controllerRef.current === controller) controllerRef.current = null;
        }
      })();
    },
    [release],
  );

  const retry = useCallback(() => {
    const last = lastRef.current;
    if (last) submit(last.file, last.opts);
  }, [submit]);

  const reset = useCallback(() => {
    release();
    lastRef.current = null;
    dispatch({ type: "reset", run: ++runRef.current });
  }, [release]);

  useEffect(() => release, [release]);

  return { state: machine.state, isBusy: isActiveScan(machine.state), submit, retry, reset };
}
