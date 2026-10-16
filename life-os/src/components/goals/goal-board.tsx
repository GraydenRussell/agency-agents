"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil, Plus, Target } from "lucide-react";
import type { GoalLevel } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/states";
import { AREA_META } from "@/lib/labels";
import { formatLocalDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { defaultPeriod, GoalDialog, type GoalFormValue } from "./goal-dialog";

export type GoalNodeView = {
  id: string;
  title: string;
  description: string | null;
  level: GoalLevel;
  area: keyof typeof AREA_META;
  status: string;
  periodStart: string;
  periodEnd: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  parentId: string | null;
  progress: number;
  taskCounts: { done: number; total: number };
  children: GoalNodeView[];
};

const LEVEL_LABEL: Record<GoalLevel, string> = { YEAR: "Year", QUARTER: "Quarter", WEEK: "Week" };

function blank(level: GoalLevel, parentId = ""): GoalFormValue {
  const p = defaultPeriod(level);
  return { title: "", description: "", level, area: "BUSINESS", periodStart: p.start, periodEnd: p.end, targetValue: "", currentValue: "", unit: "", parentId };
}

export function GoalBoard({ tree }: { tree: GoalNodeView[] }) {
  const [editing, setEditing] = useState<GoalFormValue | null>(null);
  const flat: GoalNodeView[] = [];
  const walk = (ns: GoalNodeView[]) => ns.forEach((n) => (flat.push(n), walk(n.children)));
  walk(tree);
  const parents = flat.map((g) => ({ id: g.id, title: g.title, level: g.level }));

  const edit = (g: GoalNodeView) =>
    setEditing({ id: g.id, title: g.title, description: g.description ?? "", level: g.level, area: g.area, periodStart: g.periodStart, periodEnd: g.periodEnd, targetValue: g.targetValue?.toString() ?? "", currentValue: g.currentValue?.toString() ?? "", unit: g.unit ?? "", parentId: g.parentId ?? "" });

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["YEAR", "QUARTER", "WEEK"] as const).map((l) => (
          <Button key={l} variant={l === "YEAR" ? "default" : "outline"} size="sm" onClick={() => setEditing(blank(l))}>
            <Plus /> {LEVEL_LABEL[l]} goal
          </Button>
        ))}
      </div>
      {tree.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" description="Start with a yearly goal, break it into quarters, then pick weekly focus." />
      ) : (
        <div className="space-y-3">
          {tree.map((g) => (
            <GoalCard key={g.id} goal={g} depth={0} onEdit={edit} onAddChild={(parent) => setEditing(blank(parent.level === "YEAR" ? "QUARTER" : "WEEK", parent.id))} />
          ))}
        </div>
      )}
      {editing && <GoalDialog open onOpenChange={(v) => !v && setEditing(null)} initial={editing} parents={parents} />}
    </>
  );
}

function GoalCard({ goal, depth, onEdit, onAddChild }: { goal: GoalNodeView; depth: number; onEdit: (g: GoalNodeView) => void; onAddChild: (g: GoalNodeView) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const pct = Math.round(goal.progress);
  return (
    <div className={cn(depth === 0 ? "rounded-xl border border-border bg-card p-4" : "border-l border-border pl-4")}>
      <div className="flex items-start gap-2">
        {goal.children.length > 0 ? (
          <button type="button" aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} className="mt-1 text-muted-foreground">
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{LEVEL_LABEL[goal.level]}</Badge>
            <span className={cn("text-xs", AREA_META[goal.area].text)}>{AREA_META[goal.area].label}</span>
            <span className="text-xs text-muted-foreground">
              {formatLocalDate(goal.periodStart)} – {formatLocalDate(goal.periodEnd)}
            </span>
            {goal.status === "ACHIEVED" && <Badge variant="success">Achieved</Badge>}
          </div>
          <p className={cn("mt-1 font-medium", depth === 0 && "text-lg")}>{goal.title}</p>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={pct} className="h-1.5 flex-1" indicatorClassName={pct >= 100 ? "bg-emerald-500" : undefined} />
            <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
              {goal.targetValue ? `${goal.currentValue ?? 0}/${goal.targetValue} ${goal.unit ?? ""}` : goal.taskCounts.total ? `${goal.taskCounts.done}/${goal.taskCounts.total} tasks` : `${pct}%`}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {goal.taskCounts.total > 0 && (
            <Button asChild variant="ghost" size="icon-sm" aria-label="Linked tasks">
              <Link href={`/tasks?goal=${goal.id}&status=ALL`}>
                <Target />
              </Link>
            </Button>
          )}
          {goal.level !== "WEEK" && (
            <Button variant="ghost" size="icon-sm" aria-label="Add sub-goal" onClick={() => onAddChild(goal)}>
              <Plus />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Edit goal" onClick={() => onEdit(goal)}>
            <Pencil />
          </Button>
        </div>
      </div>
      {open && goal.children.length > 0 && (
        <div className="mt-3 space-y-3">
          {goal.children.map((c) => (
            <GoalCard key={c.id} goal={c} depth={depth + 1} onEdit={onEdit} onAddChild={onAddChild} />
          ))}
        </div>
      )}
    </div>
  );
}
