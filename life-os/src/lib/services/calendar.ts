import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { CalendarEvent } from "@/generated/prisma/client";
import { isMock } from "@/lib/integrations/mode";
import { calendarProvider, EtagMismatchError, SyncTokenExpiredError, type Attendee, type RemoteEvent } from "@/lib/integrations/google/calendar";
import { GoogleAuthError, googleAccount } from "@/lib/integrations/google/oauth";
import { addDays, atLocalMinutes, endOfLocalDay, isoWeekday, startOfLocalDay, type LocalDate } from "@/lib/time";

export const attendeeSchema = z.object({ email: z.string().email(), name: z.string().optional() });

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10_000).nullish(),
    location: z.string().max(500).nullish(),
    start: z.coerce.date(),
    end: z.coerce.date(),
    allDay: z.boolean().optional(),
    attendees: z.array(attendeeSchema).max(50).optional(),
    calendarId: z.string().optional(),
    taskId: z.string().nullish(),
  })
  .refine((e) => e.end > e.start, { message: "End must be after start", path: ["end"] });
export type EventInput = z.input<typeof eventInputSchema>;

export async function isGoogleConnected(): Promise<boolean> {
  if (isMock()) return true;
  const a = await googleAccount();
  return a?.status === "CONNECTED";
}

function attendeesOf(e: CalendarEvent): Attendee[] {
  return Array.isArray(e.attendees) ? (e.attendees as Attendee[]) : [];
}

/** True when the event involves anyone besides me (used by the assistant's approval policy). */
export function hasOtherAttendees(attendees: Attendee[] | null | undefined): boolean {
  return (attendees ?? []).some((a) => !a.self);
}

// ───────────────────────────── Sync ─────────────────────────────

export async function refreshCalendarList() {
  const cals = await calendarProvider().listCalendars();
  for (const c of cals) {
    await db.calendarSyncState.upsert({
      where: { calendarId: c.id },
      create: { calendarId: c.id, summary: c.summary, writable: c.writable, color: c.color, enabled: c.primary },
      update: { summary: c.summary, writable: c.writable, color: c.color },
    });
  }
  return cals;
}

async function applyRemote(r: RemoteEvent): Promise<"upserted" | "deleted" | "skipped"> {
  const local = await db.calendarEvent.findUnique({ where: { calendarId_googleId: { calendarId: r.calendarId, googleId: r.googleId } } });
  if (local?.dirty) return "skipped"; // local edit wins until pushed (push resolves etag conflicts)
  if (r.status === "cancelled") {
    if (local && !local.deletedAt) {
      await db.calendarEvent.update({ where: { id: local.id }, data: { deletedAt: new Date() } });
      return "deleted";
    }
    return "skipped";
  }
  const data = {
    etag: r.etag,
    title: r.title,
    description: r.description,
    location: r.location,
    start: r.start,
    end: r.end,
    allDay: r.allDay,
    attendees: r.attendees,
    deletedAt: null,
  };
  if (local) await db.calendarEvent.update({ where: { id: local.id }, data });
  else await db.calendarEvent.create({ data: { ...data, googleId: r.googleId, calendarId: r.calendarId, source: "GOOGLE" } });
  return "upserted";
}

export async function syncCalendar(calendarId: string, now: Date = new Date()) {
  const state = await db.calendarSyncState.upsert({ where: { calendarId }, create: { calendarId, enabled: true }, update: {} });
  const provider = calendarProvider();
  let result: Awaited<ReturnType<typeof provider.listEvents>>;
  let full = !state.syncToken;
  try {
    result = state.syncToken
      ? await provider.listEvents(calendarId, { syncToken: state.syncToken })
      : await provider.listEvents(calendarId, { timeMin: new Date(now.getTime() - 60 * 86_400_000), timeMax: new Date(now.getTime() + 365 * 86_400_000) });
  } catch (e) {
    if (!(e instanceof SyncTokenExpiredError)) throw e;
    full = true;
    result = await provider.listEvents(calendarId, { timeMin: new Date(now.getTime() - 60 * 86_400_000), timeMax: new Date(now.getTime() + 365 * 86_400_000) });
  }
  const counts = { upserted: 0, deleted: 0, skipped: 0 };
  for (const r of result.events) counts[await applyRemote(r)]++;
  await db.calendarSyncState.update({ where: { calendarId }, data: { syncToken: result.nextSyncToken, lastSyncAt: new Date() } });
  return { calendarId, full, ...counts };
}

/** Pushes local creates/edits/deletes to Google. On an etag conflict, Google's version wins (logged). */
export async function pushDirty() {
  const provider = calendarProvider();
  const dirty = await db.calendarEvent.findMany({ where: { dirty: true } });
  const out = { created: 0, updated: 0, deleted: 0, conflicts: 0, failed: 0 };
  for (const e of dirty) {
    try {
      if (e.deletedAt) {
        if (e.googleId) await provider.deleteEvent(e.calendarId, e.googleId);
        await db.calendarEvent.update({ where: { id: e.id }, data: { dirty: false } });
        out.deleted++;
        continue;
      }
      const write = { title: e.title, description: e.description, location: e.location, start: e.start, end: e.end, allDay: e.allDay, attendees: attendeesOf(e) };
      if (!e.googleId) {
        const r = await provider.insertEvent(e.calendarId, write);
        await db.calendarEvent.update({ where: { id: e.id }, data: { googleId: r.googleId, etag: r.etag, dirty: false } });
        out.created++;
      } else {
        const r = await provider.patchEvent(e.calendarId, e.googleId, write, e.etag);
        await db.calendarEvent.update({ where: { id: e.id }, data: { etag: r.etag, dirty: false } });
        out.updated++;
      }
    } catch (err) {
      if (err instanceof EtagMismatchError && e.googleId) {
        const remote = await provider.getEvent(e.calendarId, e.googleId);
        await db.calendarEvent.update({ where: { id: e.id }, data: { dirty: false } });
        if (remote) await applyRemote(remote);
        await db.activityLog.create({ data: { actor: "AUTOMATION", actionType: "calendar.conflict", summary: `"${e.title}" was changed in Google Calendar too; kept Google's version.`, input: { localId: e.id } } });
        out.conflicts++;
      } else if (err instanceof GoogleAuthError) {
        throw err;
      } else {
        console.error("[calendar.push]", err);
        out.failed++;
      }
    }
  }
  return out;
}

export async function syncAll() {
  if (!(await isGoogleConnected())) return { skipped: "Google not connected" as const };
  if ((await db.calendarSyncState.count()) === 0) await refreshCalendarList();
  const pushed = await pushDirty();
  const states = await db.calendarSyncState.findMany({ where: { enabled: true } });
  const pulled = [];
  for (const s of states) pulled.push(await syncCalendar(s.calendarId));
  return { pushed, pulled };
}

/** Sync if the last sync is older than `maxAgeMs` (used on page load so views stay fresh without cron). */
export async function syncIfStale(maxAgeMs = 5 * 60_000) {
  const latest = await db.calendarSyncState.findFirst({ where: { enabled: true }, orderBy: { lastSyncAt: "desc" } });
  if (latest?.lastSyncAt && Date.now() - latest.lastSyncAt.getTime() < maxAgeMs) return null;
  try {
    return await syncAll();
  } catch (e) {
    console.error("[calendar.syncIfStale]", e);
    return null;
  }
}

// ───────────────────────────── CRUD ─────────────────────────────

/** Best-effort immediate push; if Google is unreachable the event stays dirty and syncs later. */
async function tryPush() {
  if (!(await isGoogleConnected())) return;
  try {
    await pushDirty();
  } catch (e) {
    console.error("[calendar.tryPush]", e);
  }
}

export async function listEvents(from: Date, to: Date) {
  return db.calendarEvent.findMany({ where: { deletedAt: null, start: { lt: to }, end: { gt: from } }, orderBy: { start: "asc" } });
}

export async function getEvent(id: string) {
  return db.calendarEvent.findFirst({ where: { id, deletedAt: null } });
}

export async function createEvent(input: EventInput) {
  const d = eventInputSchema.parse(input);
  const e = await db.calendarEvent.create({
    data: { title: d.title, description: d.description, location: d.location, start: d.start, end: d.end, allDay: d.allDay ?? false, attendees: d.attendees ?? [], calendarId: d.calendarId ?? "primary", taskId: d.taskId ?? null, source: d.taskId ? "TASK" : "LOCAL", dirty: true },
  });
  await tryPush();
  return (await db.calendarEvent.findUnique({ where: { id: e.id } })) ?? e;
}

export async function updateEvent(id: string, patch: Partial<EventInput>) {
  const current = await db.calendarEvent.findUniqueOrThrow({ where: { id } });
  const merged = eventInputSchema.parse({ ...current, ...patch, attendees: patch.attendees ?? attendeesOf(current) });
  const e = await db.calendarEvent.update({
    where: { id },
    data: { title: merged.title, description: merged.description, location: merged.location, start: merged.start, end: merged.end, allDay: merged.allDay ?? false, attendees: merged.attendees ?? [], dirty: true },
  });
  if (e.taskId) await db.task.update({ where: { id: e.taskId }, data: { scheduledStart: e.start, scheduledEnd: e.end } }).catch(() => undefined);
  await tryPush();
  return e;
}

export async function deleteEvent(id: string) {
  const e = await db.calendarEvent.update({ where: { id }, data: { deletedAt: new Date(), dirty: true } });
  if (e.taskId) await db.task.update({ where: { id: e.taskId }, data: { scheduledStart: null, scheduledEnd: null } }).catch(() => undefined);
  await tryPush();
  return e;
}

export async function restoreEvent(id: string) {
  const e = await db.calendarEvent.update({ where: { id }, data: { deletedAt: null, googleId: null, etag: null, dirty: true } });
  await tryPush();
  return e;
}

/** Time-block a task: creates a linked event and records the schedule on the task. */
export async function scheduleTask(taskId: string, start: Date, durationMin?: number) {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  const minutes = durationMin ?? task.estimateMinutes ?? 30;
  const end = new Date(start.getTime() + minutes * 60_000);
  const existing = await db.calendarEvent.findFirst({ where: { taskId, deletedAt: null } });
  await db.task.update({ where: { id: taskId }, data: { scheduledStart: start, scheduledEnd: end } });
  if (existing) return updateEvent(existing.id, { start, end });
  return createEvent({ title: task.title, start, end, taskId });
}

// ─────────────────────────── Free time ───────────────────────────

export type Interval = { start: Date; end: Date };

/**
 * Pure: free slots of at least `durationMin` inside daily working windows, excluding busy intervals.
 * Exported for tests and for the assistant's find_free_time tool.
 */
export function computeFreeSlots(opts: { from: LocalDate; to: LocalDate; busy: Interval[]; durationMin: number; dayStartMin: number; dayEndMin: number; skipWeekends?: boolean; now?: Date }): Interval[] {
  const slots: Interval[] = [];
  const busy = [...opts.busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (let d = opts.from; d <= opts.to; d = addDays(d, 1)) {
    if (opts.skipWeekends && isoWeekday(d) >= 6) continue;
    let cursor = atLocalMinutes(d, opts.dayStartMin);
    const dayEnd = atLocalMinutes(d, opts.dayEndMin);
    if (opts.now && cursor < opts.now) {
      // Round up to the next 15 minutes.
      const q = 15 * 60_000;
      cursor = new Date(Math.ceil(opts.now.getTime() / q) * q);
    }
    for (const b of busy) {
      if (b.end <= cursor || b.start >= dayEnd) continue;
      if (b.start > cursor && b.start.getTime() - cursor.getTime() >= opts.durationMin * 60_000) slots.push({ start: cursor, end: b.start < dayEnd ? b.start : dayEnd });
      if (b.end > cursor) cursor = b.end;
    }
    if (dayEnd.getTime() - cursor.getTime() >= opts.durationMin * 60_000) slots.push({ start: cursor, end: dayEnd });
  }
  return slots;
}

export async function findFreeTime(opts: { from: LocalDate; to: LocalDate; durationMin: number; dayStartMin?: number; dayEndMin?: number; respectRoutine?: boolean; skipWeekends?: boolean }) {
  const events = await listEvents(startOfLocalDay(opts.from), endOfLocalDay(opts.to));
  const busy: Interval[] = events.filter((e) => !e.allDay).map((e) => ({ start: e.start, end: e.end }));
  if (opts.respectRoutine) {
    const templates = await db.routineTemplate.findMany({ where: { active: true }, include: { blocks: true } });
    for (let d = opts.from; d <= opts.to; d = addDays(d, 1)) {
      const t = templates.find((x) => x.days.includes(isoWeekday(d)));
      // Only "hard" blocks count as busy; work/admin blocks are where tasks should go.
      for (const b of t?.blocks ?? []) if (["GYM", "WAKE", "MEAL", "WIND_DOWN", "SLEEP"].includes(b.kind)) busy.push({ start: atLocalMinutes(d, b.startMin), end: atLocalMinutes(d, b.endMin) });
    }
  }
  return computeFreeSlots({ from: opts.from, to: opts.to, busy, durationMin: opts.durationMin, dayStartMin: opts.dayStartMin ?? 7 * 60, dayEndMin: opts.dayEndMin ?? 18 * 60, skipWeekends: opts.skipWeekends, now: new Date() });
}

