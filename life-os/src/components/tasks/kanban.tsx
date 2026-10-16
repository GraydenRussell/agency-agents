"use client";
import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskStatus } from "@/generated/prisma/enums";
import { useAction } from "@/components/ui/use-action";
import { KANBAN_COLUMNS, STATUS_META } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { moveTaskAction } from "@/app/(app)/tasks/actions";
import { TaskRow, type TaskRowData } from "./task-row";
import { useOpenTask } from "./use-open-task";

/**
 * Prefer whatever is under the pointer (a card, else its column); fall back to closest corners
 * for keyboard drags. Pure closestCorners misfires on tall, mostly-empty columns.
 */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) {
    const card = within.find((c) => !KANBAN_COLUMNS.includes(String(c.id) as TaskStatus));
    return card ? [card] : within;
  }
  return closestCorners(args);
};

export function Kanban({ tasks: initial }: { tasks: TaskRowData[] }) {
  const [tasks, setTasks] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setTasks(initial);
  }
  const { run } = useAction();
  const open = useOpenTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const columns = useMemo(() => {
    const map: Record<string, TaskRowData[]> = { TODO: [], DOING: [], DONE: [] };
    for (const t of [...tasks].sort((a, b) => a.sortOrder - b.sortOrder)) (map[t.status] ??= []).push(t);
    return map;
  }, [tasks]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;
    const overId = String(over.id);
    const targetStatus = (KANBAN_COLUMNS.includes(overId as TaskStatus) ? overId : tasks.find((t) => t.id === overId)?.status) as TaskStatus | undefined;
    if (!targetStatus) return;
    const col = (columns[targetStatus] ?? []).filter((t) => t.id !== task.id);
    let index = col.findIndex((t) => t.id === overId);
    if (index === -1) index = col.length;
    const before = col[index - 1]?.sortOrder ?? null;
    const after = col[index]?.sortOrder ?? null;
    const sortOrder = before !== null && after !== null ? (before + after) / 2 : before !== null ? before + 1 : after !== null ? after - 1 : 0;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: targetStatus, sortOrder } : t)));
    run(() => moveTaskAction(task.id, targetStatus, before, after));
  };

  const active = tasks.find((t) => t.id === activeId);
  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {KANBAN_COLUMNS.map((status) => (
          <Column key={status} status={status} tasks={columns[status] ?? []} onOpen={open} />
        ))}
      </div>
      <DragOverlay>{active ? <div className="rounded-lg border border-primary bg-card shadow-xl"><TaskRow task={active} showTop3={false} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, tasks, onOpen }: { status: TaskStatus; tasks: TaskRowData[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={STATUS_META[status].label} className={cn("min-h-40 rounded-xl border border-border bg-card/50 p-2 transition-colors", isOver && "border-primary bg-primary/5")}>
      <h2 className="flex items-center justify-between px-2 py-1 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {STATUS_META[status].label} <span>{tasks.length}</span>
      </h2>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, onOpen }: { task: TaskRowData; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-lg border border-border bg-card", isDragging && "opacity-40")} {...attributes} {...listeners}>
      <TaskRow task={task} onOpen={onOpen} showTop3={false} />
    </div>
  );
}
