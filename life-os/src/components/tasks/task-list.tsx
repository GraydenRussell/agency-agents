"use client";
import { EmptyState } from "@/components/ui/states";
import { CheckCircle2 } from "lucide-react";
import { TaskRow, type TaskRowData } from "./task-row";
import { useOpenTask } from "./use-open-task";

export function TaskList({ tasks, emptyTitle = "Nothing here", emptyDescription }: { tasks: TaskRowData[]; emptyTitle?: string; emptyDescription?: string }) {
  const open = useOpenTask();
  if (tasks.length === 0) return <EmptyState icon={CheckCircle2} title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="divide-y divide-border/50">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={open} />
      ))}
    </div>
  );
}
