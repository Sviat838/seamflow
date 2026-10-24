"use client";

import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useScan, isRetryableCode } from "@/lib/client";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { CameraIcon, UploadIcon } from "@/components/ui/icons";
import { cx } from "@/components/ui/cx";
import { VerdictBand, VerdictStats } from "@/components/verdict/verdict-band";
import { formatConfidence, formatLatency } from "@/components/ui/format";

export interface UploadCardProps {
  variant?: "hero" | "workspace";
}

const ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

/** Drag-and-drop, browse, paste and camera intake for a classification. */
export function UploadCard({ variant = "hero" }: UploadCardProps) {
  const router = useRouter();
  const { state, isBusy, submit, retry, reset } = useScan();
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const cameraId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigated = useRef<string | null>(null);

  const caseNumber = state.status === "done" ? state.scan.caseNumber : null;
  useEffect(() => {
    if (caseNumber && navigated.current !== caseNumber) {
      navigated.current = caseNumber;
      router.push(`/cases/${caseNumber}`);
    }
  }, [caseNumber, router]);

  function take(file: File | null | undefined) {
    if (!file || isBusy) return;
    submit(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files?.[0]);
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(event.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (item) {
      event.preventDefault();
      take(item);
    }
  }

  const statusText =
    state.status === "preparing"
      ? "Preparing image…"
      : state.status === "uploading"
        ? `Uploading… ${Math.round(state.progress * 100)}%`
        : state.status === "analyzing"
          ? "Analyzing against Hot Dog Definition Policy v3.2…"
          : state.status === "done" && state.scan.caseNumber
            ? `Verdict: ${state.scan.verdict === "hot_dog" ? "HOT DOG" : "NOT HOT DOG"}. Opening case ${state.scan.caseNumber}…`
            : "";

  const progress = state.status === "uploading" ? state.progress : state.status === "analyzing" ? 1 : null;
  const isHero = variant === "hero";

  return (
    <div
      className={cx("rounded-card border border-hairline bg-white text-body", isHero ? "p-5 sm:p-6" : "p-5")}
      onPaste={onPaste}
    >
      <h2 className="font-serif text-xl font-semibold text-navy">Classify an image</h2>
      <p className="mt-1 text-15 text-secondary">JPEG, PNG, WebP or GIF. One image per classification.</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          "mt-4 flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-8 text-center",
          dragging ? "border-navy bg-mustard-tint" : "border-field bg-ground-soft",
        )}
      >
        <UploadIcon size={28} />
        <p className="text-15 font-semibold text-navy">Drop an image here, paste it, or choose a file</p>
        <div className="flex flex-wrap justify-center gap-2">
          <label htmlFor={inputId} className={cx(buttonClasses({ variant: "primary" }), "has-[+input:focus-visible]:outline-[3px] has-[+input:focus-visible]:outline-offset-2 has-[+input:focus-visible]:outline-navy")} aria-disabled={isBusy}>
            Browse files
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={isBusy}
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <label htmlFor={cameraId} className={cx(buttonClasses({ variant: "secondary" }), "has-[+input:focus-visible]:outline-[3px] has-[+input:focus-visible]:outline-offset-2 has-[+input:focus-visible]:outline-navy")} aria-disabled={isBusy}>
            <CameraIcon size={18} />
            <span className="ml-2">Take a photo</span>
          </label>
          <input
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={isBusy}
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div aria-live="polite" className="mt-4 space-y-4">
        {statusText ? (
          <div>
            <p className="text-15 font-semibold text-navy" role="status">
              {statusText}
            </p>
            {progress !== null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-chip bg-ground" aria-hidden="true">
                <div
                  className={cx("h-full bg-navy transition-[width]", state.status === "analyzing" && "animate-pulse")}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        ) : null}

        {state.status === "done" && !state.scan.caseNumber && (
          <div className="space-y-3">
            <VerdictBand
              verdict={state.scan.verdict}
              policyClause={state.scan.policyClause}
              reviewStatus={state.scan.reviewStatus}
              size="compact"
            >
              <VerdictStats
                verdict={state.scan.verdict}
                items={[
                  { label: "Confidence", value: formatConfidence(state.scan.confidence) },
                  {
                    label: "Processing time",
                    value: state.scan.latencyMs != null ? formatLatency(state.scan.latencyMs) : "—",
                  },
                  { label: "Clause applied", value: `§${state.scan.policyClause}` },
                ]}
              />
            </VerdictBand>
            <p className="text-13 text-secondary">
              This verdict was not saved to a case record, so it has no case page. {state.scan.summary}
            </p>
            <Button variant="secondary" onClick={reset}>
              Classify another image
            </Button>
          </div>
        )}

        {state.status === "error" && (
          <div role="alert" className="rounded-card border border-hairline bg-ground p-4">
            <p className="font-semibold text-navy">{state.copy.title}</p>
            <p className="mt-1 text-15">{state.copy.body}</p>
            {state.requestId && (
              <p className="mt-1 font-mono text-13 text-secondary">Reference: {state.requestId}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {state.code === "QUOTA_EXCEEDED" ? (
                <>
                  <Button href="/sign-in">Sign in</Button>
                  <Button variant="secondary" href="/contact">
                    Contact us
                  </Button>
                </>
              ) : isRetryableCode(state.code) ? (
                <Button onClick={retry}>Try again</Button>
              ) : (
                <Button
                  onClick={() => {
                    reset();
                    inputRef.current?.click();
                  }}
                >
                  Choose another image
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
