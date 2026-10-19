import { Badge } from "@/components/ui/badge";
import { formatWait } from "@/lib/services/lead-format";
import { cn } from "@/lib/utils";

export function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <Badge variant="outline">scoring…</Badge>;
  const tone = score >= 70 ? "bg-emerald-500/15 text-emerald-400" : score >= 40 ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums", tone)} title="Lead score (0–100)">{score}</span>;
}

export function WaitBadge({ minutes, threshold }: { minutes: number | null; threshold: number }) {
  if (minutes == null) return null;
  return <Badge variant={minutes >= threshold ? "danger" : "warning"}>waiting {formatWait(minutes)}</Badge>;
}
