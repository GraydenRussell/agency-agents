import Link from "next/link";
import type { TimelineItem } from "@/lib/services/today";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<TimelineItem["kind"], string> = {
  event: "border-l-brand-azure bg-brand-azure/10",
  routine: "border-l-muted-foreground/40 bg-muted/40 text-muted-foreground",
  task: "border-l-amber-400 bg-amber-400/10",
  job: "border-l-brand-cyan bg-brand-cyan/10",
};

export function Timeline({ items, now = new Date() }: { items: TimelineItem[]; now?: Date }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing scheduled. Add routine blocks or connect Google Calendar.</p>;
  const allDay = items.filter((i) => i.allDay);
  const timed = items.filter((i) => !i.allDay);
  const nowIndex = timed.findIndex((i) => i.end > now);
  return (
    <ol className="space-y-1.5" aria-label="Today's schedule">
      {allDay.map((i) => (
        <li key={i.id} className={cn("rounded-md border-l-4 px-3 py-1.5 text-sm", KIND_STYLE[i.kind])}>
          <span className="mr-2 text-xs text-muted-foreground">All day</span>
          {i.title}
        </li>
      ))}
      {timed.map((i, idx) => {
        const current = i.start <= now && i.end > now;
        const body = (
          <div className={cn("flex gap-3 rounded-md border-l-4 px-3 py-1.5 text-sm", KIND_STYLE[i.kind], current && "ring-1 ring-brand-cyan", i.end <= now && "opacity-50")}>
            <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(i.start)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{i.title}</span>
              {i.location && <span className="block truncate text-xs text-muted-foreground">{i.location}</span>}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatTime(i.end)}</span>
          </div>
        );
        return (
          <li key={`${i.kind}-${i.id}`}>
            {idx === nowIndex && !current && <div className="my-1 flex items-center gap-2 text-[10px] font-semibold text-brand-cyan uppercase" aria-label="Now"><span className="h-px flex-1 bg-brand-cyan" />now {formatTime(now)}<span className="h-px flex-1 bg-brand-cyan" /></div>}
            {i.href ? <Link href={i.href}>{body}</Link> : body}
          </li>
        );
      })}
    </ol>
  );
}
