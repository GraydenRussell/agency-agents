"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Area } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/ui/use-action";
import { parseCapture } from "@/lib/capture/parse";
import { createTaskAction } from "@/app/(app)/tasks/actions";

/** Inline add with the same shorthand as quick capture ("tomorrow 3pm !1 #business"). */
export function NewTaskForm({ defaultArea, placeholder = "Add a task… (try: call Linda tomorrow 3pm !1 #business)" }: { defaultArea?: Area; placeholder?: string }) {
  const [value, setValue] = useState("");
  const { pending, run } = useAction();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const p = parseCapture(value);
        run(() => createTaskAction({ title: p.title, priority: p.priority, area: p.area ?? defaultArea, dueAt: p.at ?? null }), {
          success: "Task added",
          onSuccess: () => setValue(""),
        });
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label="New task" disabled={pending} />
      <Button type="submit" disabled={pending || !value.trim()}>
        <Plus /> Add
      </Button>
    </form>
  );
}
