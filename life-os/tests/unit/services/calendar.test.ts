import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { calendarProvider, fromApiEvent, mockRemoteEdit, resetMockCalendar, toApiEvent } from "@/lib/integrations/google/calendar";
import { computeFreeSlots, createEvent, deleteEvent, findFreeTime, hasOtherAttendees, pushDirty, scheduleTask, syncAll, syncCalendar, updateEvent } from "@/lib/services/calendar";
import { createTask } from "@/lib/services/tasks";
import { atLocalMinutes, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
  resetMockCalendar();
});

describe("calendar sync (mock Google)", () => {
  it("full sync then incremental sync picks up remote edits and deletions", async () => {
    const first = await syncAll();
    expect("pulled" in first && first.pulled?.[0]?.full).toBe(true);
    const count = await db.calendarEvent.count({ where: { deletedAt: null } });
    expect(count).toBeGreaterThan(3);

    mockRemoteEdit("mock-0-480", { title: "Crew huddle (moved)" });
    mockRemoteEdit("mock-0-660", { status: "cancelled" });
    const inc = await syncCalendar("primary");
    expect(inc.full).toBe(false);
    expect(inc.upserted).toBe(1);
    expect(inc.deleted).toBe(1);
    expect(await db.calendarEvent.findFirst({ where: { googleId: "mock-0-480" } })).toMatchObject({ title: "Crew huddle (moved)" });
    expect((await db.calendarEvent.findFirst({ where: { googleId: "mock-0-660" } }))?.deletedAt).not.toBeNull();
  });

  it("pushes local creates, edits, and deletes", async () => {
    const e = await createEvent({ title: "Dentist", start: atLocalMinutes(today(), 600), end: atLocalMinutes(today(), 660) });
    expect(e.googleId).toBeTruthy();
    expect(e.dirty).toBe(false);
    const remote = await calendarProvider().getEvent("primary", e.googleId as string);
    expect(remote?.title).toBe("Dentist");

    await updateEvent(e.id, { title: "Dentist (Dr. Lee)" });
    expect((await calendarProvider().getEvent("primary", e.googleId as string))?.title).toBe("Dentist (Dr. Lee)");

    await deleteEvent(e.id);
    expect((await calendarProvider().getEvent("primary", e.googleId as string))?.status).toBe("cancelled");
  });

  it("resolves etag conflicts in favor of Google and logs it", async () => {
    await syncAll();
    const local = await db.calendarEvent.findFirstOrThrow({ where: { googleId: "mock-1-540" } });
    mockRemoteEdit("mock-1-540", { title: "Edited on phone" });
    await db.calendarEvent.update({ where: { id: local.id }, data: { title: "Edited in Life OS", dirty: true } });
    const r = await pushDirty();
    expect(r.conflicts).toBe(1);
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: local.id } })).title).toBe("Edited on phone");
    expect(await db.activityLog.count({ where: { actionType: "calendar.conflict" } })).toBe(1);
  });

  it("time-blocks a task as a linked event", async () => {
    const t = await createTask({ title: "Write SOP", estimateMinutes: 45 });
    const start = atLocalMinutes(today(), 8 * 60);
    const e = await scheduleTask(t.id, start);
    expect(e.taskId).toBe(t.id);
    expect(e.end.getTime() - e.start.getTime()).toBe(45 * 60_000);
    const task = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(task.scheduledStart?.toISOString()).toBe(start.toISOString());
    // Rescheduling moves the same event instead of creating another.
    await scheduleTask(t.id, atLocalMinutes(today(), 9 * 60));
    expect(await db.calendarEvent.count({ where: { taskId: t.id, deletedAt: null } })).toBe(1);
  });
});

describe("free time", () => {
  const d = "2026-10-19"; // Monday
  it("computes gaps inside the working window", () => {
    const slots = computeFreeSlots({
      from: d,
      to: d,
      durationMin: 30,
      dayStartMin: 8 * 60,
      dayEndMin: 12 * 60,
      busy: [
        { start: atLocalMinutes(d, 9 * 60), end: atLocalMinutes(d, 10 * 60) },
        { start: atLocalMinutes(d, 10 * 60 + 15), end: atLocalMinutes(d, 11 * 60) },
      ],
    });
    expect(slots.map((s) => [s.start.toISOString(), s.end.toISOString()])).toEqual([
      [atLocalMinutes(d, 480).toISOString(), atLocalMinutes(d, 540).toISOString()],
      [atLocalMinutes(d, 660).toISOString(), atLocalMinutes(d, 720).toISOString()],
    ]);
  });
  it("skips weekends and respects overlapping busy blocks", () => {
    const slots = computeFreeSlots({
      from: "2026-10-17",
      to: d,
      durationMin: 60,
      dayStartMin: 8 * 60,
      dayEndMin: 10 * 60,
      skipWeekends: true,
      busy: [
        { start: atLocalMinutes(d, 8 * 60), end: atLocalMinutes(d, 9 * 60 + 30) },
        { start: atLocalMinutes(d, 9 * 60), end: atLocalMinutes(d, 9 * 60 + 15) },
      ],
    });
    expect(slots).toEqual([]);
  });
  it("findFreeTime uses synced events", async () => {
    await syncAll();
    const slots = await findFreeTime({ from: today(), to: today(), durationMin: 30, dayStartMin: 0, dayEndMin: 24 * 60 });
    expect(slots.length).toBeGreaterThan(0);
  });
});

describe("Google event mapping", () => {
  it("round-trips timed and all-day events", () => {
    const timed = toApiEvent({ title: "x", start: new Date("2026-10-16T16:00:00Z"), end: new Date("2026-10-16T17:00:00Z") });
    expect(timed.start).toEqual({ dateTime: "2026-10-16T16:00:00.000Z", timeZone: "America/Phoenix" });
    const allDay = toApiEvent({ title: "x", allDay: true, start: atLocalMinutes("2026-10-16", 0), end: atLocalMinutes("2026-10-17", 0) });
    expect(allDay).toMatchObject({ start: { date: "2026-10-16" }, end: { date: "2026-10-17" } });
    const back = fromApiEvent("primary", { id: "a", etag: "e", status: "confirmed", start: { date: "2026-10-16" }, end: { date: "2026-10-17" } });
    expect(back.allDay).toBe(true);
    expect(back.start.toISOString()).toBe("2026-10-16T07:00:00.000Z");
  });
  it("detects other attendees", () => {
    expect(hasOtherAttendees([{ email: "me@x.com", self: true }])).toBe(false);
    expect(hasOtherAttendees([{ email: "tyce@x.com" }])).toBe(true);
    expect(hasOtherAttendees(undefined)).toBe(false);
  });
});
