"use client";
import { CalendarClock, ListTree, Repeat, Star } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/generated/prisma/client";
import { Checkbox } from "@/components/ui/checkbox";
import { useAction } from "@/components/ui/use-action";
import { AREA_META, PRIORITY_META } from "@/lib/labels";
import { formatTime, localDateOf, relativeDayLabel, today } from "@/lib/time";
import { cn } from "@/lib/utils";
import { restoreTaskAction, setTaskStatusAction, toggleTop3Action } from "@/app/(app)/tasks/actions";

export type TaskRowData = Task & { subtasks?: Task[]; goal?: { id: string; title: string } | null };

export function dueLabel(due: Date): { label: string; overdue: boolean } {
  const d = localDateOf(due);
  const t = today();
  const label = `${relativeDayLabel(d)}${formatTime(due) !== "5 PM" ? ` ${formatTime(due)}` : ""}`;
  return { label, overdue: d < t };
}

export function TaskRow({ task, onOpen, showTop3 = true, compact = false }: { task: TaskRowData; onOpen?: (id: string) => void; showTop3?: boolean; compact?: boolean }) {
  const { pending, run } = useAction();
  const done = task.status === "DONE";
  const subDone = task.subtasks?.filter((s) => s.status === "DONE").length ?? 0;
  const subTotal = task.subtasks?.length ?? 0;
  const due = task.dueAt ? dueLabel(task.dueAt) : null;
  const pinned = task.top3Date === today();

  const toggle = () =>
    run(() => setTaskStatusAction(task.id, done ? "TODO" : "DONE"), {
      onSuccess: (r) => {
        if (!done) {
          toast.success(r.nextDue ? `Done. Next one scheduled ${relativeDayLabel(localDateOf(new Date(r.nextDue)))}.` : "Done", {
            action: { label: "Undo", onClick: () => void setTaskStatusAction(task.id, "TODO") },
          });
        }
      },
    });

  return (
    <div className={cn("group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/40", pending && "opacity-60")} data-testid="task-row">
      <Checkbox checked={done} onCheckedChange={toggle} aria-label={done ? `Mark "${task.title}" not done` : `Complete "${task.title}"`} className="mt-0.5" />
      <button type="button" onClick={() => onOpen?.(task.id)} className="min-w-0 flex-1 text-left">
        <p className={cn("text-sm leading-snug", done && "text-muted-foreground line-through")}>{task.title}</p>
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("rounded border px-1 text-[10px] font-semibold", PRIORITY_META[task.priority]?.className)}>{PRIORITY_META[task.priority]?.short}</span>
            <span className="flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", AREA_META[task.area].dot)} />
              {AREA_META[task.area].label}
            </span>
            {due && (
              <span className={cn("flex items-center gap-1", due.overdue && !done && "text-red-400")}>
                <CalendarClock className="size-3" />
                {due.label}
              </span>
            )}
            {task.recurrenceRule && <Repeat className="size-3" aria-label="Recurring" />}
            {subTotal > 0 && (
              <span className="flex items-center gap-1">
                <ListTree className="size-3" />
                {subDone}/{subTotal}
              </span>
            )}
            {task.goal && <span className="truncate">↳ {task.goal.title}</span>}
          </div>
        )}
      </button>
      {showTop3 && !done && (
        <button
          type="button"
          aria-label={pinned ? "Remove from Top 3" : "Add to Top 3"}
          onClick={() => run(() => toggleTop3Action(task.id), { success: (r) => (r.pinned ? "Pinned to Top 3" : "Removed from Top 3") })}
          className={cn("rounded p-1 transition-opacity", pinned ? "text-amber-400" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60")}
        >
          <Star className={cn("size-4", pinned && "fill-current")} />
        </button>
      )}
    </div>
  );
}

export function undoDeleteToast(id: string) {
  toast("Task deleted", { action: { label: "Undo", onClick: () => void restoreTaskAction(id) } });
}
