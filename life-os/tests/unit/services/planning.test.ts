import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildGoalTree, createGoal, goalTree } from "@/lib/services/goals";
import { appendJournal, createNote, getJournal, journalPromptFor, parseTags, searchNotes, updateNote } from "@/lib/services/notes";
import { createHabit, dailyStreak, habitsWithStatus, logHabit, weeklyStreak } from "@/lib/services/habits";
import { addChecklistItem, checklistsForDate, createChecklist, parseHhmm, templateForDate, toggleChecklistItem, toHhmm } from "@/lib/services/routines";
import { createTask, setTaskStatus } from "@/lib/services/tasks";
import { captureText } from "@/lib/services/capture";
import { addDays, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);

describe("goals", () => {
  it("computes progress from targets, tasks, and children", async () => {
    const year = await createGoal({ title: "Year", level: "YEAR", area: "BUSINESS", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31") });
    await createGoal({ title: "Revenue", level: "QUARTER", area: "BUSINESS", parentId: year.id, periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-12-31"), targetValue: 100, currentValue: 50 });
    const q2 = await createGoal({ title: "Hire", level: "QUARTER", area: "BUSINESS", parentId: year.id, periodStart: new Date("2026-10-01"), periodEnd: new Date("2026-12-31") });
    const a = await createTask({ title: "a", goalId: q2.id });
    await createTask({ title: "b", goalId: q2.id });
    await setTaskStatus(a.id, "DONE");
    const [root] = await goalTree();
    expect(root?.title).toBe("Year");
    const byTitle = Object.fromEntries((root?.children ?? []).map((c) => [c.title, c.progress]));
    expect(byTitle).toEqual({ Revenue: 50, Hire: 50 });
    expect(root?.progress).toBe(50);
  });

  it("rejects an end before start", async () => {
    await expect(createGoal({ title: "bad", level: "WEEK", area: "HEALTH", periodStart: new Date("2026-10-10"), periodEnd: new Date("2026-10-01") })).rejects.toThrow();
  });

  it("buildGoalTree ignores canceled tasks", () => {
    const g = { id: "g", title: "g", description: null, level: "WEEK" as const, area: "HEALTH" as const, status: "ACTIVE" as const, periodStart: new Date(), periodEnd: new Date(), targetValue: null, currentValue: null, unit: null, parentId: null, createdAt: new Date(), updatedAt: new Date() };
    const [n] = buildGoalTree([g], [
      { goalId: "g", status: "DONE", _count: { _all: 1 } },
      { goalId: "g", status: "CANCELED", _count: { _all: 5 } },
    ]);
    expect(n?.progress).toBe(100);
  });
});

describe("notes & journal", () => {
  it("full-text and substring search", async () => {
    await createNote({ title: "Pricing ideas", body: "Bundle solar screens with exterior windows", tags: ["business"] });
    await createNote({ title: "Running plan", body: "Tempo on Wednesdays" });
    expect((await searchNotes("screens")).map((n) => n.title)).toEqual(["Pricing ideas"]);
    expect((await searchNotes("Wedn")).map((n) => n.title)).toEqual(["Running plan"]);
    expect((await searchNotes("business")).length).toBe(1);
  });

  it("partial update keeps the body", async () => {
    const n = await createNote({ title: "a", body: "keep me" });
    const u = await updateNote(n.id, { title: "b" });
    expect(u.body).toBe("keep me");
  });

  it("appends to one journal entry per day with a stable prompt", async () => {
    await appendJournal(today(), "line one");
    await appendJournal(today(), "line two");
    const j = await getJournal(today());
    expect(j?.body).toBe("line one\n\nline two");
    expect(j?.prompt).toBe(journalPromptFor(today()));
    expect(parseTags("#Biz, pricing  biz")).toEqual(["biz", "pricing"]);
  });
});

describe("habits", () => {
  it("streak math", () => {
    const t = "2026-10-16";
    const logs = new Map([["2026-10-15", 1], ["2026-10-14", 1], ["2026-10-12", 1]]);
    expect(dailyStreak(logs, 1, t)).toBe(2); // today not done yet doesn't break it
    logs.set(t, 1);
    expect(dailyStreak(logs, 1, t)).toBe(3);
    const weekly = new Map([["2026-10-13", 2], ["2026-10-07", 1], ["2026-10-08", 1]]);
    expect(weeklyStreak(weekly, 2, t)).toBe(2);
  });

  it("logs increments and clamps at zero", async () => {
    const h = await createHabit({ name: "Water", target: 8, unit: "glasses" });
    expect(await logHabit(h.id, 3)).toBe(3);
    expect(await logHabit(h.id, -5)).toBe(0);
    await logHabit(h.id, 8, addDays(today(), -1));
    const [status] = await habitsWithStatus();
    expect(status).toMatchObject({ name: "Water", todayValue: 0, streak: 1 });
  });
});

describe("routines & checklists", () => {
  it("time helpers", () => {
    expect(parseHhmm("5:45")).toBe(345);
    expect(toHhmm(345)).toBe("05:45");
    expect(() => parseHhmm("25:00")).toThrow();
  });

  it("picks the template for a weekday and toggles checklist items", async () => {
    await db.routineTemplate.create({ data: { name: "Weekday", dayType: "WEEKDAY", days: [1, 2, 3, 4, 5] } });
    await db.routineTemplate.create({ data: { name: "Weekend", dayType: "WEEKEND", days: [6, 7] } });
    expect((await templateForDate("2026-10-16"))?.name).toBe("Weekday");
    expect((await templateForDate("2026-10-17"))?.name).toBe("Weekend");
    const cl = await createChecklist("Morning", "MORNING");
    const item = await addChecklistItem(cl.id, "Stretch");
    await toggleChecklistItem(cl.id, item.id);
    expect((await checklistsForDate())[0]?.checked).toEqual([item.id]);
    await toggleChecklistItem(cl.id, item.id);
    expect((await checklistsForDate())[0]?.checked).toEqual([]);
  });
});

describe("quick capture", () => {
  it("files tasks, notes, journal, reminders, and events", async () => {
    expect((await captureText("call Linda tomorrow 3pm !1 #business")).kind).toBe("task");
    expect((await captureText("note: idea\nmore")).kind).toBe("note");
    expect((await captureText("j: good day")).kind).toBe("journal");
    expect((await captureText("remind me to move truck in 2 hours")).kind).toBe("reminder");
    expect((await captureText("lunch with Tyce fri 12-1pm")).kind).toBe("event");
    expect((await captureText("buy rope", "note")).kind).toBe("note");
    const task = await db.task.findFirstOrThrow({ where: { title: "call Linda" } });
    expect(task).toMatchObject({ priority: 1, area: "BUSINESS" });
    expect(await db.calendarEvent.count({ where: { dirty: true } })).toBe(1);
  });
});
