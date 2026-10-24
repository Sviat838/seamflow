"use client";

import { useEffect, useId, useState } from "react";
import { LiveDot } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { formatCount, formatPercent } from "@/components/ui/format";
import type { FeedSnapshot } from "@/lib/types";
import { FEED_POLL_MS, feedUrl, nextPollDelay, parseFeedSnapshot } from "./feed-polling";
import { FeedStats } from "./feed-stats";
import { FeedFootnote, GlobalFeedTable } from "./global-feed-table";

export interface LiveFeedProps {
  initial: FeedSnapshot;
  /** Sent as ?case= so the server can mark the viewer's own case as "This case". */
  caseNumber?: string | null;
  variant?: "card" | "fullscreen";
  title?: string;
  titleId?: string;
  headingLevel?: "h1" | "h2" | "h3";
  /** Rows shown. */
  limit?: number;
  showStats?: boolean;
  pollMs?: number;
  className?: string;
}

/** Polls the feed while the tab is visible; backs off on errors and keeps the last good rows. */
function useLiveSnapshot(initial: FeedSnapshot, caseNumber: string | null | undefined, pollMs: number) {
  const [snapshot, setSnapshot] = useState(initial);
  const [failures, setFailures] = useState(0);
  // A fresh server snapshot (router.refresh, new case) replaces the polled one.
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setSnapshot(initial);
  }

  useEffect(() => {
    let cancelled = false;
    let consecutive = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };

    async function tick() {
      // Hidden tabs don't poll; the visibility handler restarts the loop.
      if (document.visibilityState === "hidden") return;
      const request = new AbortController();
      controller = request;
      try {
        const res = await fetch(feedUrl(caseNumber), {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: request.signal,
        });
        if (!res.ok) throw new Error(`feed ${res.status}`);
        const next = parseFeedSnapshot(await res.json());
        if (!next) throw new Error("feed payload");
        if (cancelled) return;
        consecutive = 0;
        setFailures(0);
        setSnapshot(next);
      } catch {
        if (cancelled || request.signal.aborted) return;
        consecutive += 1;
        setFailures(consecutive);
      }
      if (!cancelled) schedule(nextPollDelay(consecutive, pollMs));
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        schedule(0);
      } else {
        clearTimeout(timer);
        controller?.abort();
      }
    }

    schedule(pollMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [caseNumber, pollMs]);

  return { snapshot, reconnecting: failures > 0 };
}

/** The Global feed card (right rail, landing) or the full-screen feed, updating every 5 s. */
export function LiveFeed({
  initial,
  caseNumber,
  variant = "card",
  title = "Global feed",
  titleId,
  headingLevel: Heading = "h2",
  limit = 12,
  showStats = true,
  pollMs = FEED_POLL_MS,
  className,
}: LiveFeedProps) {
  const generatedId = useId();
  const headingId = titleId ?? `feed-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { snapshot, reconnecting } = useLiveSnapshot(initial, caseNumber, pollMs);
  const fullscreen = variant === "fullscreen";
  const today = formatCount(snapshot.verdictsToday);
  const status = (
    <LiveDot
      muted={reconnecting}
      label={
        <span className="tabular-nums">
          {reconnecting ? "Reconnecting" : "Live"} · {today} {snapshot.verdictsToday === 1 ? "verdict" : "verdicts"} today
        </span>
      }
    />
  );

  return (
    <section aria-labelledby={headingId} className={cx("overflow-hidden rounded-card border border-hairline bg-white", className)}>
      <div className={cx("border-b border-hairline", fullscreen ? "px-6 py-5" : "px-5 pt-4 pb-3.5")}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Heading
            id={headingId}
            className={cx("font-serif leading-snug font-semibold text-navy", fullscreen ? "text-[30px] sm:text-[40px]" : "text-[22px]")}
          >
            {title}
          </Heading>
          <p className={fullscreen ? "text-base" : "text-13"}>{status}</p>
        </div>
        {showStats && !fullscreen ? (
          <p className="mt-1 text-13 text-secondary tabular-nums">
            Today: {today} {snapshot.verdictsToday === 1 ? "verdict" : "verdicts"}
            {snapshot.hotDogShareToday != null ? ` · ${formatPercent(snapshot.hotDogShareToday)} hot dogs` : null}
          </p>
        ) : null}
        {showStats && fullscreen ? (
          <FeedStats snapshot={snapshot} include={["today", "share", "p50", "ambiguous"]} size="lg" className="mt-5" />
        ) : null}
      </div>

      <GlobalFeedTable items={snapshot.items.slice(0, limit)} size={fullscreen ? "fullscreen" : "card"} footnote={false} />

      <div className={fullscreen ? "border-t border-hairline px-6 py-4" : "px-4 pt-3 pb-3.5"}>
        <FeedFootnote />
        {showStats && !fullscreen ? (
          <p className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-hairline pt-2.5 text-13 text-body">
            <span>Ambiguous verdicts issued, all time</span>
            <strong className="font-serif text-lg leading-none font-semibold text-navy">{snapshot.ambiguousAllTime}</strong>
          </p>
        ) : null}
      </div>
    </section>
  );
}
