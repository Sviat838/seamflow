import { formatConfidence } from "@/components/ui/format";
import { Stat, type StatProps } from "@/components/ui/stat";

export interface ConfidenceStatProps extends Omit<StatProps, "label" | "value"> {
  /** 0..1 */
  confidence: number;
  label?: string;
}

/** "Confidence 99.2%" as a Stat. Keep it inside a <dl> (StatList). */
export function ConfidenceStat({ confidence, label = "Confidence", ...props }: ConfidenceStatProps) {
  return <Stat {...props} label={label} value={formatConfidence(confidence)} />;
}
