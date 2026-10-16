"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useAction } from "@/components/ui/use-action";
import { toggleChecklistItemAction } from "@/app/(app)/routines/actions";

type Checklist = { id: string; name: string; kind: string; items: Array<{ id: string; label: string }>; checked: string[] };

export function ChecklistGroup({ checklists }: { checklists: Checklist[] }) {
  const { run } = useAction();
  if (checklists.length === 0) return <p className="text-sm text-muted-foreground">No checklists yet.</p>;
  return (
    <div className="space-y-4">
      {checklists.map((c) => {
        const done = c.items.filter((i) => c.checked.includes(i.id)).length;
        return (
          <div key={c.id}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-semibold tracking-wide text-muted-foreground uppercase">{c.name}</span>
              <span className="text-muted-foreground">
                {done}/{c.items.length}
              </span>
            </div>
            <Progress value={c.items.length ? (done / c.items.length) * 100 : 0} className="mb-2 h-1" />
            <ul className="space-y-1.5">
              {c.items.map((i) => {
                const checked = c.checked.includes(i.id);
                return (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={checked} onCheckedChange={() => run(() => toggleChecklistItemAction(c.id, i.id))} />
                      <span className={checked ? "text-muted-foreground line-through" : ""}>{i.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
