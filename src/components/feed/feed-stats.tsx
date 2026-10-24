import { formatCount, formatLatency, formatPercent } from "@/components/ui/format";
import { Stat, StatList } from "@/components/ui/stat";
import type { FeedSnapshot } from "@/lib/types";

export type FeedStatKey = "today" | "share" | "ambiguous" | "p50";

export interface FeedStatsProps {
  snapshot: Pick<FeedSnapshot, "verdictsToday" | "hotDogShareToday" | "ambiguousAllTime" | "p50LatencyMs">;
  include?: FeedStatKey[];
  tone?: "light" | "navy";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Honest feed numbers: verdicts today, hot-dog share, ambiguous all time (0), p50. */
export function FeedStats({ snapshot, include = ["today", "share", "ambiguous"], tone = "light", size = "sm", className }: FeedStatsProps) {
  const stats: Record<FeedStatKey, { label: string; value: string }> = {
    today: { label: "Verdicts today", value: formatCount(snapshot.verdictsToday) },
    share: {
      label: "Classified HOT DOG",
      value: snapshot.hotDogShareToday == null ? "—" : formatPercent(snapshot.hotDogShareToday),
    },
    ambiguous: { label: "Ambiguous, all time", value: formatCount(snapshot.ambiguousAllTime) },
    p50: { label: "Median time to verdict (p50)", value: formatLatency(snapshot.p50LatencyMs) },
  };
  return (
    <StatList className={className}>
      {include.map((key) => (
        <Stat key={key} label={stats[key].label} value={stats[key].value} tone={tone} size={size} />
      ))}
    </StatList>
  );
}
