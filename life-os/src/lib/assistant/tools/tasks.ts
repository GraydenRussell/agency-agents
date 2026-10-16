import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import * as cal from "@/lib/services/calendar";
import * as tasks from "@/lib/services/tasks";
import { endOfLocalDay, formatDateTime, startOfLocalDay, today, weekRange } from "@/lib/time";
import { defineTool } from "../registry";

const area = z.enum(["BUSINESS", "PERSONAL", "HEALTH", "MONEY", "LEARNING"]);
const iso = z.string().describe("ISO 8601 with offset (Phoenix is -07:00)");

const view = (t: { id: string; title: string; status: string; priority: number; area: string; dueAt: Date | null; top3Date: string | null; scheduledStart: Date | null; estimateMinutes: number | null; recurrenceRule: string | null }) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  area: t.area,
  due: t.dueAt ? formatDateTime(t.dueAt) : null,
  dueIso: t.dueAt?.toISOString() ?? null,
  top3Today: t.top3Date === today(),
  scheduled: t.scheduledStart ? formatDateTime(t.scheduledStart) : null,
  estimateMinutes: t.estimateMinutes,
  recurring: Boolean(t.recurrenceRule),
});

async function task(id: string) {
  const t = await db.task.findFirst({ where: { id, deletedAt: null } });
  if (!t) throw new Error(`No task with id ${id}`);
  return t;
}

async function planContext(from: string, to: string) {
  const [open, events, slots] = await Promise.all([
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] }, OR: [{ dueAt: { lte: endOfLocalDay(to) } }, { dueAt: null }, { top3Date: { gte: from, lte: to } }] }, orderBy: [{ priority: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }], take: 60 }),
    cal.listEvents(startOfLocalDay(from), endOfLocalDay(to)),
    cal.findFreeTime({ from, to, durationMin: 30, respectRoutine: true }),
  ]);
  return {
    range: { from, to },
    openTasks: open.map(view),
    events: events.map((e) => ({ id: e.id, title: e.title, start: formatDateTime(e.start), end: formatDateTime(e.end), allDay: e.allDay })),
    freeSlots: slots.slice(0, 30).map((s) => ({ start: formatDateTime(s.start), startIso: s.start.toISOString(), minutes: Math.round((s.end.getTime() - s.start.getTime()) / 60_000) })),
  };
}

const blocks = z.array(z.object({ taskId: z.string(), start: iso, minutes: z.number().int().min(5).max(480).optional() })).max(20);

async function applyPlan(input: { top3?: string[]; blocks?: z.infer<typeof blocks> }, date: string) {
  const done: string[] = [];
  if (input.top3?.length) {
    await db.task.updateMany({ where: { top3Date: date }, data: { top3Date: null } });
    for (const id of input.top3.slice(0, tasks.MAX_TOP3)) await db.task.update({ where: { id }, data: { top3Date: date } });
    done.push(`Top 3 set (${input.top3.length})`);
  }
  for (const b of input.blocks ?? []) {
    await cal.scheduleTask(b.taskId, new Date(b.start), b.minutes);
  }
  if (input.blocks?.length) done.push(`${input.blocks.length} time blocks`);
  return done;
}

export const taskTools = [
  defineTool({
    name: "task_list",
    description: "List tasks. Filters: due (today|overdue|week|none), area, status (OPEN default, DONE, ALL), text query.",
    schema: z.object({ due: z.enum(["today", "overdue", "week", "none"]).optional(), area: area.optional(), status: z.enum(["OPEN", "DONE", "ALL"]).optional(), query: z.string().optional() }),
    actionType: "task.list",
    kind: "read",
    summarize: () => "List tasks",
    run: async (i) => ({ result: (await tasks.listTasks({ due: i.due, area: i.area, status: i.status, q: i.query })).slice(0, 50).map(view) }),
  }),
  defineTool({
    name: "task_create",
    description: "Create a task. Priority 1=urgent … 4=low. Optional due time, recurrence (RRULE like FREQ=WEEKLY;BYDAY=MO), estimate.",
    schema: z.object({ title: z.string().min(1).max(300), notes: z.string().max(5000).optional(), priority: z.number().int().min(1).max(4).optional(), area: area.optional(), due: iso.optional(), estimateMinutes: z.number().int().min(5).max(600).optional(), recurrenceRule: z.string().optional(), parentTaskId: z.string().optional() }),
    actionType: "task.create",
    kind: "write",
    summarize: (i) => `Create task "${i.title}"${i.due ? ` due ${formatDateTime(new Date(i.due))}` : ""}`,
    run: async (i) => {
      const t = await tasks.createTask({ title: i.title, notes: i.notes, priority: i.priority, area: i.area, dueAt: i.due ? new Date(i.due) : null, estimateMinutes: i.estimateMinutes, recurrenceRule: i.recurrenceRule, parentId: i.parentTaskId });
      return { result: view(t), undo: { actionType: "task.softDelete", payload: { id: t.id } } };
    },
  }),
  defineTool({
    name: "task_update",
    description: "Update a task's title, notes, priority, area, due date, estimate, or status (TODO/DOING/DONE/CANCELED).",
    schema: z.object({ taskId: z.string(), title: z.string().min(1).max(300).optional(), notes: z.string().max(5000).optional(), priority: z.number().int().min(1).max(4).optional(), area: area.optional(), due: iso.nullable().optional(), estimateMinutes: z.number().int().min(5).max(600).optional(), status: z.enum(["TODO", "DOING", "DONE", "CANCELED"]).optional() }),
    actionType: "task.update",
    kind: "write",
    summarize: async (i) => `Update task "${(await task(i.taskId)).title}"`,
    run: async (i) => {
      const before = await task(i.taskId);
      const t = await tasks.updateTask(i.taskId, { title: i.title, notes: i.notes, priority: i.priority, area: i.area, dueAt: i.due === undefined ? undefined : i.due ? new Date(i.due) : null, estimateMinutes: i.estimateMinutes, status: i.status });
      const revert = { title: before.title, notes: before.notes, priority: before.priority, area: before.area, dueAt: before.dueAt, estimateMinutes: before.estimateMinutes, status: before.status, completedAt: before.completedAt };
      return { result: view(t), undo: { actionType: "task.revert", payload: { id: t.id, data: revert } } };
    },
  }),
  defineTool({
    name: "task_complete",
    description: "Mark a task done (recurring tasks schedule their next occurrence).",
    schema: z.object({ taskId: z.string() }),
    actionType: "task.complete",
    kind: "write",
    summarize: async (i) => `Complete "${(await task(i.taskId)).title}"`,
    run: async (i) => {
      const before = await task(i.taskId);
      const { next } = await tasks.setTaskStatus(i.taskId, "DONE");
      return { result: { done: true, nextOccurrence: next?.dueAt ? formatDateTime(next.dueAt) : null }, undo: { actionType: "task.revert", payload: { id: i.taskId, data: { status: before.status, completedAt: null } } } };
    },
  }),
  defineTool({
    name: "task_delete",
    description: "Delete a task. Requires approval by default.",
    schema: z.object({ taskId: z.string() }),
    actionType: "task.delete",
    kind: "write",
    approval: () => ({ key: "task.delete" }),
    summarize: async (i) => `Delete task "${(await task(i.taskId)).title}"`,
    run: async (i) => {
      await tasks.deleteTask(i.taskId);
      return { result: { deleted: true }, undo: { actionType: "task.restore", payload: { id: i.taskId } } };
    },
  }),
  defineTool({
    name: "task_prioritize",
    description: "Set priorities in bulk and/or pick today's Top 3 (max 3; replaces the current Top 3 when given).",
    schema: z.object({ top3TaskIds: z.array(z.string()).max(3).optional(), priorities: z.array(z.object({ taskId: z.string(), priority: z.number().int().min(1).max(4) })).max(50).optional() }),
    actionType: "task.prioritize",
    kind: "write",
    summarize: (i) => `Reprioritize ${i.priorities?.length ?? 0} tasks${i.top3TaskIds ? `, set Top 3` : ""}`,
    run: async (i) => {
      for (const p of i.priorities ?? []) await db.task.update({ where: { id: p.taskId }, data: { priority: p.priority } });
      if (i.top3TaskIds) await applyPlan({ top3: i.top3TaskIds }, today());
      return { result: { ok: true } };
    },
  }),
  defineTool({
    name: "plan_day",
    description: "Plan a day. Call first WITHOUT top3/blocks to get open tasks, events, and free slots; then call again WITH your chosen top3 task ids and time blocks to apply (blocks create calendar events linked to tasks).",
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), top3: z.array(z.string()).max(3).optional(), blocks: blocks.optional() }),
    actionType: "plan.day",
    kind: "write",
    summarize: (i) => (i.top3 || i.blocks ? `Apply day plan for ${i.date ?? today()}` : `Gather planning context for ${i.date ?? today()}`),
    run: async (i) => {
      const date = i.date ?? today();
      if (!i.top3 && !i.blocks) return { result: await planContext(date, date), summary: `Reviewed plan for ${date}` };
      return { result: { applied: await applyPlan(i, date) } };
    },
  }),
  defineTool({
    name: "plan_week",
    description: "Plan the week (Mon–Sun containing `date`). Call without blocks for context; call with blocks to time-block tasks across the week.",
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), blocks: blocks.optional() }),
    actionType: "plan.week",
    kind: "write",
    summarize: (i) => (i.blocks ? `Time-block ${i.blocks.length} tasks this week` : "Gather weekly planning context"),
    run: async (i) => {
      const w = weekRange(i.date ?? today());
      if (!i.blocks) return { result: await planContext(w.start < today() ? today() : w.start, w.end), summary: "Reviewed the week" };
      return { result: { applied: await applyPlan({ blocks: i.blocks }, w.start) } };
    },
  }),
];
