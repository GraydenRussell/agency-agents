import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma, Task } from "@/generated/prisma/client";
import { Area, TaskStatus } from "@/generated/prisma/enums";
import { isValidRrule, nextOccurrence } from "@/lib/recurrence";
import { endOfLocalDay, startOfLocalDay, today, type LocalDate } from "@/lib/time";

export const areaSchema = z.enum(Object.values(Area) as [Area, ...Area[]]);
export const statusSchema = z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]);

const dateish = z.coerce.date();

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  notes: z.string().max(10_000).nullish(),
  status: statusSchema.optional(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  area: areaSchema.optional(),
  dueAt: dateish.nullish(),
  scheduledStart: dateish.nullish(),
  scheduledEnd: dateish.nullish(),
  estimateMinutes: z.coerce.number().int().min(1).max(24 * 60).nullish(),
  goalId: z.string().nullish(),
  parentId: z.string().nullish(),
  recurrenceRule: z
    .string()
    .nullish()
    .refine((v) => !v || isValidRrule(v), "Invalid recurrence rule"),
  top3Date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;
export const taskUpdateSchema = taskInputSchema.partial();
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export type TaskWithMeta = Task & {
  subtasks: Task[];
  goal: { id: string; title: string } | null;
};

const withMeta = {
  subtasks: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
  goal: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;

export const taskFilterSchema = z.object({
  q: z.string().optional(),
  area: areaSchema.optional(),
  status: z.union([statusSchema, z.literal("OPEN"), z.literal("ALL")]).optional(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  due: z.enum(["today", "overdue", "week", "none"]).optional(),
  goalId: z.string().optional(),
});
export type TaskFilter = z.infer<typeof taskFilterSchema>;

export function buildTaskWhere(f: TaskFilter, now: Date = new Date()): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { deletedAt: null, parentId: null };
  const status = f.status ?? "OPEN";
  if (status === "OPEN") where.status = { in: ["TODO", "DOING"] };
  else if (status !== "ALL") where.status = status;
  if (f.area) where.area = f.area;
  if (f.priority) where.priority = f.priority;
  if (f.goalId) where.goalId = f.goalId;
  if (f.q?.trim()) {
    const contains = { contains: f.q.trim(), mode: "insensitive" as const };
    where.OR = [{ title: contains }, { notes: contains }];
  }
  const t = today(now);
  if (f.due === "today") where.dueAt = { gte: startOfLocalDay(t), lt: endOfLocalDay(t) };
  if (f.due === "overdue") where.dueAt = { lt: startOfLocalDay(t) };
  if (f.due === "week") where.dueAt = { lt: new Date(startOfLocalDay(t).getTime() + 7 * 86_400_000) };
  if (f.due === "none") where.dueAt = null;
  return where;
}

export async function listTasks(filter: TaskFilter = {}): Promise<TaskWithMeta[]> {
  return db.task.findMany({
    where: buildTaskWhere(filter),
    include: withMeta,
    orderBy: [{ status: "asc" }, { priority: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { sortOrder: "asc" }],
    take: 500,
  });
}

export async function getTask(id: string): Promise<TaskWithMeta | null> {
  return db.task.findFirst({ where: { id, deletedAt: null }, include: withMeta });
}

export async function createTask(input: TaskInput): Promise<Task> {
  const data = taskInputSchema.parse(input);
  const max = await db.task.aggregate({ _max: { sortOrder: true }, where: { parentId: data.parentId ?? null } });
  return db.task.create({
    data: {
      ...data,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      completedAt: data.status === "DONE" ? new Date() : null,
    },
  });
}

export async function updateTask(id: string, patch: TaskUpdate): Promise<Task> {
  const data = taskUpdateSchema.parse(patch);
  const extra: { completedAt?: Date | null } = {};
  if (data.status) extra.completedAt = data.status === "DONE" ? new Date() : null;
  const updated = await db.task.update({ where: { id }, data: { ...data, ...extra } });
  if (data.status === "DONE") await spawnNextRecurrence(updated);
  return updated;
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<{ task: Task; next: Task | null }> {
  const task = await db.task.update({
    where: { id },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  const next = status === "DONE" ? await spawnNextRecurrence(task) : null;
  return { task, next };
}

export const completeTask = (id: string) => setTaskStatus(id, "DONE");

/**
 * Recurring tasks: the task holding `recurrenceRule` is the live instance. When it's completed,
 * we create the next instance (carrying the rule forward) so history stays intact.
 */
export async function spawnNextRecurrence(task: Task, now: Date = new Date()): Promise<Task | null> {
  if (!task.recurrenceRule) return null;
  const anchor = task.dueAt ?? task.createdAt;
  const after = anchor > now ? anchor : now;
  const next = nextOccurrence(task.recurrenceRule, anchor, after);
  if (!next) return null;
  // Idempotency: don't create a duplicate if one is already open for that slot.
  const rootId = task.recurrenceParentId ?? task.id;
  const existing = await db.task.findFirst({
    where: { deletedAt: null, status: { in: ["TODO", "DOING"] }, dueAt: next, OR: [{ recurrenceParentId: rootId }, { id: rootId }] },
  });
  if (existing) return existing;
  const created = await db.task.create({
    data: {
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      area: task.area,
      goalId: task.goalId,
      estimateMinutes: task.estimateMinutes,
      recurrenceRule: task.recurrenceRule,
      recurrenceParentId: rootId,
      dueAt: next,
      sortOrder: task.sortOrder,
    },
  });
  // Only the newest instance carries the rule, so completing old ones can't fork the series.
  await db.task.update({ where: { id: task.id }, data: { recurrenceRule: null, recurrenceParentId: rootId === task.id ? null : rootId } });
  return created;
}

export async function deleteTask(id: string): Promise<Task> {
  return db.task.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreTask(id: string): Promise<Task> {
  return db.task.update({ where: { id }, data: { deletedAt: null } });
}

/** Kanban drop: new status + position between neighbors. */
export async function moveTask(id: string, status: TaskStatus, beforeSort: number | null, afterSort: number | null): Promise<Task> {
  let sortOrder: number;
  if (beforeSort !== null && afterSort !== null) sortOrder = (beforeSort + afterSort) / 2;
  else if (beforeSort !== null) sortOrder = beforeSort + 1;
  else if (afterSort !== null) sortOrder = afterSort - 1;
  else sortOrder = 0;
  const { task } = await setTaskStatus(id, status);
  return db.task.update({ where: { id: task.id }, data: { sortOrder } });
}

export const MAX_TOP3 = 3;

export async function toggleTop3(id: string, date: LocalDate = today()): Promise<{ pinned: boolean }> {
  const task = await db.task.findUniqueOrThrow({ where: { id } });
  if (task.top3Date === date) {
    await db.task.update({ where: { id }, data: { top3Date: null } });
    return { pinned: false };
  }
  const count = await db.task.count({ where: { top3Date: date, deletedAt: null, status: { not: "CANCELED" } } });
  if (count >= MAX_TOP3) throw new Error(`You already have ${MAX_TOP3} priorities for today. Unpin one first.`);
  await db.task.update({ where: { id }, data: { top3Date: date } });
  return { pinned: true };
}

export type DayTasks = {
  top3: TaskWithMeta[];
  dueToday: TaskWithMeta[];
  overdue: TaskWithMeta[];
  scheduled: Task[];
  completedToday: number;
};

export async function tasksForDay(date: LocalDate = today()): Promise<DayTasks> {
  const start = startOfLocalDay(date);
  const end = endOfLocalDay(date);
  const open = { in: ["TODO", "DOING"] as TaskStatus[] };
  const [top3, dueToday, overdue, scheduled, completedToday] = await Promise.all([
    db.task.findMany({ where: { top3Date: date, deletedAt: null }, include: withMeta, orderBy: { priority: "asc" } }),
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: open, dueAt: { gte: start, lt: end }, OR: [{ top3Date: null }, { top3Date: { not: date } }] }, include: withMeta, orderBy: [{ priority: "asc" }, { dueAt: "asc" }] }),
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: open, dueAt: { lt: start } }, include: withMeta, orderBy: [{ dueAt: "asc" }] }),
    db.task.findMany({ where: { deletedAt: null, scheduledStart: { gte: start, lt: end } }, orderBy: { scheduledStart: "asc" } }),
    db.task.count({ where: { deletedAt: null, completedAt: { gte: start, lt: end } } }),
  ]);
  return { top3, dueToday, overdue, scheduled, completedToday };
}

/** Pushes overdue open tasks to a date (used by "roll over" and the evening wrap). */
export async function rollOverTasks(ids: string[], to: LocalDate): Promise<number> {
  const target = new Date(startOfLocalDay(to).getTime() + 17 * 3_600_000); // 5 PM Phoenix
  const res = await db.task.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { dueAt: target } });
  return res.count;
}
