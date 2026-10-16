import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTask, deleteTask, listTasks, moveTask, restoreTask, rollOverTasks, setTaskStatus, tasksForDay, toggleTop3, updateTask } from "@/lib/services/tasks";
import { addDays, atLocalMinutes, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);

describe("tasks service", () => {
  it("creates, validates, and lists open tasks", async () => {
    await createTask({ title: "Quote Gilbert job", priority: 1, area: "BUSINESS" });
    await createTask({ title: "Done thing", status: "DONE" });
    await expect(createTask({ title: "   " })).rejects.toThrow();
    const open = await listTasks();
    expect(open.map((t) => t.title)).toEqual(["Quote Gilbert job"]);
    expect((await listTasks({ status: "ALL" })).length).toBe(2);
    expect((await listTasks({ q: "gilbert" })).length).toBe(1);
    expect((await listTasks({ area: "HEALTH" })).length).toBe(0);
  });

  it("sets completedAt on status changes", async () => {
    const t = await createTask({ title: "x" });
    const { task } = await setTaskStatus(t.id, "DONE");
    expect(task.completedAt).toBeInstanceOf(Date);
    const reopened = await updateTask(t.id, { status: "TODO" });
    expect(reopened.completedAt).toBeNull();
  });

  it("spawns the next occurrence when a recurring task is completed (once)", async () => {
    const due = atLocalMinutes(today(), 10 * 60);
    const t = await createTask({ title: "Invoice follow-ups", recurrenceRule: "FREQ=DAILY", dueAt: due });
    const { next } = await setTaskStatus(t.id, "DONE");
    expect(next).not.toBeNull();
    expect(next?.recurrenceRule).toBe("FREQ=DAILY");
    expect(next?.dueAt && next.dueAt > due).toBe(true);
    const old = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(old.recurrenceRule).toBeNull();
    // Completing the old one again must not fork the series.
    await setTaskStatus(t.id, "DONE");
    expect(await db.task.count({ where: { title: "Invoice follow-ups" } })).toBe(2);
  });

  it("enforces at most three Top-3 priorities per day", async () => {
    const ids = await Promise.all(["a", "b", "c", "d"].map(async (title) => (await createTask({ title })).id));
    for (const id of ids.slice(0, 3)) await toggleTop3(id);
    await expect(toggleTop3(ids[3] as string)).rejects.toThrow(/already have 3/);
    expect(await toggleTop3(ids[0] as string)).toEqual({ pinned: false });
    expect(await toggleTop3(ids[3] as string)).toEqual({ pinned: true });
  });

  it("groups a day into top3 / due / overdue / scheduled", async () => {
    const t = today();
    const top = await createTask({ title: "top", top3Date: t, dueAt: atLocalMinutes(t, 600) });
    await createTask({ title: "due", dueAt: atLocalMinutes(t, 900) });
    await createTask({ title: "late", dueAt: atLocalMinutes(addDays(t, -2), 900) });
    await createTask({ title: "blocked", scheduledStart: atLocalMinutes(t, 480), scheduledEnd: atLocalMinutes(t, 540) });
    await createTask({ title: "tomorrow", dueAt: atLocalMinutes(addDays(t, 1), 900) });
    await setTaskStatus((await createTask({ title: "finished" })).id, "DONE");
    const day = await tasksForDay(t);
    expect(day.top3.map((x) => x.id)).toEqual([top.id]);
    expect(day.dueToday.map((x) => x.title)).toEqual(["due"]);
    expect(day.overdue.map((x) => x.title)).toEqual(["late"]);
    expect(day.scheduled.map((x) => x.title)).toEqual(["blocked"]);
    expect(day.completedToday).toBe(1);
  });

  it("moves on the kanban board between neighbors", async () => {
    const t = await createTask({ title: "card" });
    const moved = await moveTask(t.id, "DOING", 1, 2);
    expect(moved.status).toBe("DOING");
    expect(moved.sortOrder).toBe(1.5);
  });

  it("soft-deletes, restores, and rolls over", async () => {
    const t = await createTask({ title: "x", dueAt: atLocalMinutes(addDays(today(), -3), 600) });
    await deleteTask(t.id);
    expect((await listTasks()).length).toBe(0);
    await restoreTask(t.id);
    expect(await rollOverTasks([t.id], today())).toBe(1);
    expect((await tasksForDay()).overdue.length).toBe(0);
  });
});
