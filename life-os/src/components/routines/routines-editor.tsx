"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BlockKind, ChecklistKind } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/ui/use-action";
import { minutesToLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  addBlockAction,
  addChecklistItemAction,
  archiveHabitAction,
  createChecklistAction,
  createHabitAction,
  createTemplateAction,
  deleteBlockAction,
  deleteChecklistItemAction,
  deleteTemplateAction,
  updateTemplateAction,
} from "@/app/(app)/routines/actions";

type Block = { id: string; title: string; kind: BlockKind; startMin: number; endMin: number };
type Template = { id: string; name: string; dayType: string; days: number[]; active: boolean; blocks: Block[] };
type Checklist = { id: string; name: string; kind: ChecklistKind; items: Array<{ id: string; label: string }> };
type Habit = { id: string; name: string; target: number; unit: string | null; cadence: "DAILY" | "WEEKLY"; streak: number };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KINDS: BlockKind[] = ["WAKE", "GYM", "WORK", "ADMIN", "MEAL", "WIND_DOWN", "SLEEP", "OTHER"];
const KIND_COLOR: Record<BlockKind, string> = {
  WAKE: "bg-amber-400",
  GYM: "bg-emerald-400",
  WORK: "bg-brand-azure",
  ADMIN: "bg-violet-400",
  MEAL: "bg-orange-400",
  WIND_DOWN: "bg-indigo-400",
  SLEEP: "bg-slate-500",
  OTHER: "bg-muted-foreground",
};

export function RoutinesEditor({ templates, checklists, habits }: { templates: Template[]; checklists: Checklist[]; habits: Habit[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        {templates.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
        <NewTemplate />
      </div>
      <div className="space-y-4">
        <ChecklistsCard checklists={checklists} />
        <HabitsCard habits={habits} />
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const { run } = useAction();
  const [draft, setDraft] = useState({ title: "", kind: "WORK" as BlockKind, start: "09:00", end: "10:00" });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{template.name}</CardTitle>
          <div className="mt-2 flex gap-1">
            {DAYS.map((d, i) => {
              const on = template.days.includes(i + 1);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const days = on ? template.days.filter((x) => x !== i + 1) : [...template.days, i + 1].sort();
                    if (days.length) run(() => updateTemplateAction(template.id, { days }));
                  }}
                  className={cn("rounded px-1.5 py-0.5 text-[11px]", on ? "bg-primary text-white" : "bg-muted text-muted-foreground")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={template.active} onCheckedChange={(v) => run(() => updateTemplateAction(template.id, { active: v }))} aria-label="Active" />
          <Button variant="ghost" size="icon-sm" aria-label="Delete template" onClick={() => confirm(`Delete "${template.name}"?`) && run(() => deleteTemplateAction(template.id))}>
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1">
          {template.blocks.map((b) => (
            <li key={b.id} className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40">
              <span className={cn("h-6 w-1 rounded-full", KIND_COLOR[b.kind])} />
              <span className="w-32 text-xs text-muted-foreground tabular-nums">
                {minutesToLabel(b.startMin)} – {minutesToLabel(b.endMin)}
              </span>
              <span className="flex-1 text-sm">{b.title}</span>
              <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 max-lg:opacity-60" aria-label={`Delete ${b.title}`} onClick={() => run(() => deleteBlockAction(b.id))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 max-sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.title.trim()) return;
            run(() => addBlockAction(template.id, draft), { onSuccess: () => setDraft((d) => ({ ...d, title: "" })) });
          }}
        >
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="New block (e.g. Gym)" aria-label="Block title" />
          <NativeSelect value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as BlockKind })} aria-label="Kind" className="w-auto">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </NativeSelect>
          <Input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} aria-label="Start" />
          <Input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} aria-label="End" />
          <Button type="submit" size="icon" aria-label="Add block">
            <Plus />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NewTemplate() {
  const { run } = useAction();
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) run(() => createTemplateAction({ name, dayType: "CUSTOM", days: [1, 2, 3, 4, 5] }), { onSuccess: () => setName("") });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New routine template (e.g. Busy season)" aria-label="New template name" />
      <Button type="submit" variant="outline">
        <Plus /> Template
      </Button>
    </form>
  );
}

function ChecklistsCard({ checklists }: { checklists: Checklist[] }) {
  const { run } = useAction();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklists</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {checklists.map((c) => (
          <div key={c.id}>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium">
              {c.name} <Badge variant="outline">{c.kind.toLowerCase()}</Badge>
            </p>
            <ul className="space-y-0.5">
              {c.items.map((i) => (
                <li key={i.id} className="group flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-accent/40">
                  {i.label}
                  <button type="button" aria-label={`Remove ${i.label}`} className="text-muted-foreground opacity-0 group-hover:opacity-100 max-lg:opacity-60" onClick={() => run(() => deleteChecklistItemAction(i.id))}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const label = drafts[c.id]?.trim();
                if (label) run(() => addChecklistItemAction(c.id, label), { onSuccess: () => setDrafts((d) => ({ ...d, [c.id]: "" })) });
              }}
            >
              <Input value={drafts[c.id] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} placeholder="Add item" aria-label={`Add item to ${c.name}`} className="h-8" />
            </form>
          </div>
        ))}
        <form
          className="flex gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) run(() => createChecklistAction(newName, "CUSTOM"), { onSuccess: () => setNewName("") });
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New checklist" aria-label="New checklist name" className="h-8" />
          <Button type="submit" size="sm" variant="outline">
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function HabitsCard({ habits }: { habits: Habit[] }) {
  const { run } = useAction();
  const [d, setD] = useState({ name: "", target: "1", unit: "", cadence: "DAILY" as "DAILY" | "WEEKLY" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Habits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-0.5">
          {habits.map((h) => (
            <li key={h.id} className="group flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-accent/40">
              <span>
                {h.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {h.target}
                  {h.unit ? ` ${h.unit}` : "×"} / {h.cadence === "DAILY" ? "day" : "week"} · {h.streak} streak
                </span>
              </span>
              <button type="button" aria-label={`Archive ${h.name}`} className="text-muted-foreground opacity-0 group-hover:opacity-100 max-lg:opacity-60" onClick={() => run(() => archiveHabitAction(h.id), { success: "Habit archived" })}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="grid grid-cols-[1fr_4rem_5rem_auto_auto] gap-2 max-sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (d.name.trim()) run(() => createHabitAction({ name: d.name, target: Number(d.target) || 1, unit: d.unit || null, cadence: d.cadence }), { onSuccess: () => setD({ ...d, name: "" }) });
          }}
        >
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="New habit" aria-label="Habit name" />
          <Input type="number" min={1} value={d.target} onChange={(e) => setD({ ...d, target: e.target.value })} aria-label="Target" />
          <Input value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} placeholder="unit" aria-label="Unit" />
          <NativeSelect value={d.cadence} onChange={(e) => setD({ ...d, cadence: e.target.value as "DAILY" | "WEEKLY" })} aria-label="Cadence" className="w-auto">
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
          </NativeSelect>
          <Button type="submit" size="icon" aria-label="Add habit">
            <Plus />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
