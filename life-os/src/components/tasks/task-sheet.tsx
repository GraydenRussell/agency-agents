"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Area, TaskStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { AREAS, AREA_META, PRIORITY_META, STATUS_META } from "@/lib/labels";
import { RECURRENCE_PRESETS, describeRrule } from "@/lib/recurrence";
import { fromLocalInput, toLocalInput } from "@/lib/time";
import { createTaskAction, deleteTaskAction, getTaskAction, listGoalOptionsAction, setTaskStatusAction, updateTaskAction } from "@/app/(app)/tasks/actions";
import { undoDeleteToast, type TaskRowData } from "./task-row";

type GoalOption = { id: string; title: string; level: string };

/** Opens whenever the URL has ?task=<id> (from any page, the palette, or links). */
export function TaskSheetHost() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = params.get("task");

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("task");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return (
    <Sheet open={Boolean(id)} onOpenChange={(v) => !v && close()}>
      <SheetContent className="overflow-y-auto p-0">
        {id ? <TaskEditor key={id} id={id} onClose={close} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function TaskEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const [task, setTask] = useState<TaskRowData | null | undefined>(undefined);
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [newSub, setNewSub] = useState("");
  const { pending, run } = useAction();

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTaskAction(id), listGoalOptionsAction()]).then(([t, g]) => {
      if (cancelled) return;
      setTask(t.ok ? t.data : null);
      if (g.ok) setGoals(g.data);
    });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (task === undefined) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading task…
        <SheetTitle className="sr-only">Loading task</SheetTitle>
      </div>
    );
  }
  if (task === null) {
    return (
      <div className="p-6">
        <SheetTitle className="font-heading text-2xl">Task not found</SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted-foreground">It may have been deleted.</SheetDescription>
      </div>
    );
  }

  const save = (patch: Parameters<typeof updateTaskAction>[1]) => run(() => updateTaskAction(task.id, patch), { onSuccess: load });

  return (
    <div className="space-y-5 p-5">
      <div className="pr-8">
        <SheetTitle className="sr-only">Edit task</SheetTitle>
        <SheetDescription className="sr-only">Edit task details, subtasks, and recurrence.</SheetDescription>
        <Input
          aria-label="Title"
          defaultValue={task.title}
          className="h-auto border-transparent px-0 font-heading text-3xl tracking-wide shadow-none focus-visible:border-transparent focus-visible:ring-0"
          onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && save({ title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <NativeSelect value={task.status} onChange={(e) => run(() => setTaskStatusAction(task.id, e.target.value as TaskStatus), { onSuccess: load })}>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Priority">
          <NativeSelect value={task.priority} onChange={(e) => save({ priority: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p]?.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Area">
          <NativeSelect value={task.area} onChange={(e) => save({ area: e.target.value as Area })}>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_META[a].label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Due">
          <Input type="datetime-local" defaultValue={toLocalInput(task.dueAt)} onBlur={(e) => save({ dueAt: fromLocalInput(e.target.value) })} />
        </Field>
        <Field label="Goal">
          <NativeSelect value={task.goalId ?? ""} onChange={(e) => save({ goalId: e.target.value || null })}>
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.level[0]}: {g.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Repeat">
          <NativeSelect value={task.recurrenceRule ?? ""} onChange={(e) => save({ recurrenceRule: e.target.value || null })}>
            <option value="">Doesn&apos;t repeat</option>
            {RECURRENCE_PRESETS.map((p) => (
              <option key={p.rrule} value={p.rrule}>
                {p.label}
              </option>
            ))}
            {task.recurrenceRule && !RECURRENCE_PRESETS.some((p) => p.rrule === task.recurrenceRule) && <option value={task.recurrenceRule}>{describeRrule(task.recurrenceRule)}</option>}
          </NativeSelect>
        </Field>
        <Field label="Scheduled start">
          <Input type="datetime-local" defaultValue={toLocalInput(task.scheduledStart)} onBlur={(e) => save({ scheduledStart: fromLocalInput(e.target.value), scheduledEnd: e.target.value ? new Date((fromLocalInput(e.target.value) as Date).getTime() + (task.estimateMinutes ?? 30) * 60_000) : null })} />
        </Field>
        <Field label="Estimate (min)">
          <Input type="number" min={1} defaultValue={task.estimateMinutes ?? ""} onBlur={(e) => save({ estimateMinutes: e.target.value ? Number(e.target.value) : null })} />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea rows={4} defaultValue={task.notes ?? ""} placeholder="Details, links, context…" onBlur={(e) => e.target.value !== (task.notes ?? "") && save({ notes: e.target.value || null })} />
      </Field>

      <div>
        <Label className="mb-2 block text-xs text-muted-foreground uppercase">Subtasks</Label>
        <div className="space-y-1">
          {(task.subtasks ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <Checkbox checked={s.status === "DONE"} onCheckedChange={() => run(() => setTaskStatusAction(s.id, s.status === "DONE" ? "TODO" : "DONE"), { onSuccess: load })} aria-label={`Toggle ${s.title}`} />
              <span className={s.status === "DONE" ? "text-sm text-muted-foreground line-through" : "text-sm"}>{s.title}</span>
            </div>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newSub.trim()) return;
            run(() => createTaskAction({ title: newSub, parentId: task.id, area: task.area }), {
              onSuccess: () => {
                setNewSub("");
                load();
              },
            });
          }}
        >
          <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a subtask" />
          <Button type="submit" variant="outline" size="icon" aria-label="Add subtask">
            <Plus />
          </Button>
        </form>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">{pending ? "Saving…" : "Changes save automatically"}</span>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-400"
          onClick={() =>
            run(() => deleteTaskAction(task.id), {
              onSuccess: () => {
                undoDeleteToast(task.id);
                onClose();
              },
            })
          }
        >
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground uppercase">{label}</Label>
      {children}
    </div>
  );
}
