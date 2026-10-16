"use client";
import { useState } from "react";
import type { Area, GoalLevel } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { AREAS, AREA_META } from "@/lib/labels";
import { monthRange, today, weekRange } from "@/lib/time";
import { createGoalAction, deleteGoalAction, updateGoalAction } from "@/app/(app)/goals/actions";

export type GoalFormValue = {
  id?: string;
  title: string;
  description: string;
  level: GoalLevel;
  area: Area;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  parentId: string;
};

export function defaultPeriod(level: GoalLevel): { start: string; end: string } {
  const t = today();
  const y = t.slice(0, 4);
  if (level === "YEAR") return { start: `${y}-01-01`, end: `${y}-12-31` };
  if (level === "WEEK") return weekRange(t);
  const q = Math.ceil(Number(t.slice(5, 7)) / 3);
  return { start: `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`, end: monthRange(`${y}-${String(q * 3).padStart(2, "0")}-01`).end };
}

export function GoalDialog({ open, onOpenChange, initial, parents }: { open: boolean; onOpenChange: (v: boolean) => void; initial: GoalFormValue; parents: Array<{ id: string; title: string; level: GoalLevel }> }) {
  const [v, setV] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setV(initial);
  }
  const { pending, run } = useAction();
  const set = <K extends keyof GoalFormValue>(k: K, val: GoalFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const parentLevel: GoalLevel | null = v.level === "WEEK" ? "QUARTER" : v.level === "QUARTER" ? "YEAR" : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: v.title,
      description: v.description || null,
      level: v.level,
      area: v.area,
      periodStart: new Date(v.periodStart),
      periodEnd: new Date(v.periodEnd),
      targetValue: v.targetValue ? Number(v.targetValue) : null,
      currentValue: v.currentValue ? Number(v.currentValue) : null,
      unit: v.unit || null,
      parentId: v.parentId || null,
    };
    run(() => (v.id ? updateGoalAction(v.id, payload) : createGoalAction(payload)), { success: v.id ? "Goal updated" : "Goal created", onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{v.id ? "Edit goal" : "New goal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-title">Title</Label>
            <Input id="g-title" required value={v.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Level</Label>
              <NativeSelect
                value={v.level}
                onChange={(e) => {
                  const level = e.target.value as GoalLevel;
                  const p = defaultPeriod(level);
                  setV((s) => ({ ...s, level, periodStart: p.start, periodEnd: p.end, parentId: "" }));
                }}
              >
                <option value="YEAR">Yearly</option>
                <option value="QUARTER">Quarterly</option>
                <option value="WEEK">Weekly</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label>Area</Label>
              <NativeSelect value={v.area} onChange={(e) => set("area", e.target.value as Area)}>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_META[a].label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="date" required value={v.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="date" required value={v.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
            </div>
          </div>
          {parentLevel && (
            <div className="space-y-1.5">
              <Label>Rolls up to</Label>
              <NativeSelect value={v.parentId} onChange={(e) => set("parentId", e.target.value)}>
                <option value="">None</option>
                {parents
                  .filter((p) => p.level === parentLevel && p.id !== v.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </NativeSelect>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Target</Label>
              <Input type="number" step="any" min={0} value={v.targetValue} onChange={(e) => set("targetValue", e.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Current</Label>
              <Input type="number" step="any" min={0} value={v.currentValue} onChange={(e) => set("currentValue", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={v.unit} onChange={(e) => set("unit", e.target.value)} placeholder="$, leads…" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Without a target, progress comes from linked tasks and sub-goals.</p>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <DialogFooter>
            {v.id && (
              <Button type="button" variant="ghost" className="mr-auto text-red-400" onClick={() => run(() => deleteGoalAction(v.id as string), { success: "Goal deleted", onSuccess: () => onOpenChange(false) })}>
                Delete
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
