"use client";
import { Flame, Minus, Plus } from "lucide-react";
import type { HabitStatus } from "@/lib/services/habits";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { cn } from "@/lib/utils";
import { logHabitAction } from "@/app/(app)/routines/actions";

export function HabitCheckins({ habits }: { habits: HabitStatus[] }) {
  const { pending, run } = useAction();
  if (habits.length === 0) return <p className="text-sm text-muted-foreground">No habits yet. Add some on the Routines page.</p>;
  return (
    <ul className="space-y-2">
      {habits.map((h) => {
        const met = h.periodValue >= h.target;
        return (
          <li key={h.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className={cn(met && "text-emerald-400")}>{h.name}</span>
                {h.streak > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-400" title={`${h.streak}-${h.cadence === "DAILY" ? "day" : "week"} streak`}>
                    <Flame className="size-3" /> {h.streak}
                  </span>
                )}
              </div>
              <div className="mt-1 flex gap-0.5" aria-hidden>
                {h.last7.map((d) => (
                  <span key={d.date} className={cn("h-1.5 flex-1 rounded-full", d.value >= h.target ? "bg-emerald-500" : d.value > 0 ? "bg-emerald-500/40" : "bg-muted")} />
                ))}
              </div>
            </div>
            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
              {h.periodValue}/{h.target}
              {h.unit ? ` ${h.unit}` : ""}
            </span>
            {h.target > 1 && (
              <Button variant="ghost" size="icon-sm" disabled={pending || h.todayValue === 0} aria-label={`Decrease ${h.name}`} onClick={() => run(() => logHabitAction(h.id, -1))}>
                <Minus />
              </Button>
            )}
            <Button
              variant={met ? "secondary" : "outline"}
              size="icon-sm"
              disabled={pending}
              aria-label={h.target === 1 && h.todayValue > 0 ? `Undo ${h.name}` : `Log ${h.name}`}
              onClick={() => run(() => logHabitAction(h.id, h.target === 1 && h.todayValue > 0 ? -1 : 1))}
            >
              <Plus className={cn(h.target === 1 && h.todayValue > 0 && "rotate-45 transition-transform")} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
