import "server-only";
import { z } from "zod";
import * as cal from "@/lib/services/calendar";
import type { Attendee } from "@/lib/integrations/google/calendar";
import { endOfLocalDay, formatDateTime, formatTime, startOfLocalDay, today } from "@/lib/time";
import { defineTool } from "../registry";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD (Phoenix)");
const iso = z.string().describe("ISO 8601 date-time with offset, e.g. 2026-10-20T09:00:00-07:00 (Phoenix is always -07:00)");

const view = (e: { id: string; title: string; start: Date; end: Date; allDay: boolean; location: string | null; attendees: unknown; source: string }) => ({
  id: e.id,
  title: e.title,
  start: formatDateTime(e.start),
  end: formatTime(e.end),
  startIso: e.start.toISOString(),
  endIso: e.end.toISOString(),
  allDay: e.allDay,
  location: e.location,
  guests: (Array.isArray(e.attendees) ? (e.attendees as Attendee[]) : []).filter((a) => !a.self).map((a) => a.email),
  source: e.source,
});

async function event(id: string) {
  const e = await cal.getEvent(id);
  if (!e) throw new Error(`No event with id ${id}`);
  return e;
}
const guestsOf = (e: { attendees: unknown }) => (Array.isArray(e.attendees) ? (e.attendees as Attendee[]) : []);

export const calendarTools = [
  defineTool({
    name: "calendar_list_events",
    description: "List calendar events between two Phoenix dates (inclusive).",
    schema: z.object({ from: localDate.optional(), to: localDate.optional() }),
    actionType: "calendar.list",
    kind: "read",
    summarize: () => "List events",
    run: async (i) => {
      const from = i.from ?? today();
      const to = i.to ?? from;
      return { result: (await cal.listEvents(startOfLocalDay(from), endOfLocalDay(to))).map(view) };
    },
  }),
  defineTool({
    name: "calendar_create_event",
    description: "Create a calendar event (syncs to Google). Creating an event with guests requires approval (they get an invite).",
    schema: z.object({ title: z.string().min(1).max(300), start: iso, end: iso, location: z.string().max(500).optional(), description: z.string().max(5000).optional(), guests: z.array(z.string().email()).max(30).optional(), allDay: z.boolean().optional() }),
    actionType: "calendar.create",
    kind: "write",
    approval: (i) => (i.guests?.length ? { key: "calendar.create.withGuests" } : null),
    summarize: (i) => `Create "${i.title}" ${formatDateTime(new Date(i.start))}–${formatTime(new Date(i.end))}${i.guests?.length ? ` with ${i.guests.join(", ")}` : ""}`,
    run: async (i) => {
      const e = await cal.createEvent({ title: i.title, start: i.start, end: i.end, location: i.location, description: i.description, allDay: i.allDay, attendees: i.guests?.map((email) => ({ email })) });
      return { result: view(e), undo: { actionType: "calendar.delete", payload: { id: e.id } } };
    },
  }),
  defineTool({
    name: "calendar_move_event",
    description: "Move/resize an event to a new start (and optional end; keeps duration otherwise). Needs approval if the event has other guests.",
    schema: z.object({ eventId: z.string(), start: iso, end: iso.optional() }),
    actionType: "calendar.move",
    kind: "write",
    approval: async (i) => (cal.hasOtherAttendees(guestsOf(await event(i.eventId))) ? { key: "calendar.update.withGuests" } : null),
    summarize: async (i) => `Move "${(await event(i.eventId)).title}" to ${formatDateTime(new Date(i.start))}`,
    run: async (i) => {
      const e = await event(i.eventId);
      const start = new Date(i.start);
      const end = i.end ? new Date(i.end) : new Date(start.getTime() + (e.end.getTime() - e.start.getTime()));
      const u = await cal.updateEvent(e.id, { start, end });
      return { result: view(u), undo: { actionType: "calendar.revert", payload: { id: e.id, start: e.start.toISOString(), end: e.end.toISOString() } } };
    },
  }),
  defineTool({
    name: "calendar_delete_event",
    description: "Delete an event. Always requires approval by default.",
    schema: z.object({ eventId: z.string() }),
    actionType: "calendar.delete",
    kind: "write",
    approval: () => ({ key: "calendar.delete" }),
    summarize: async (i) => {
      const e = await event(i.eventId);
      return `Delete "${e.title}" (${formatDateTime(e.start)})${cal.hasOtherAttendees(guestsOf(e)) ? " — guests will be notified" : ""}`;
    },
    run: async (i) => {
      await cal.deleteEvent(i.eventId);
      return { result: { deleted: true }, undo: { actionType: "calendar.restore", payload: { id: i.eventId } } };
    },
  }),
  defineTool({
    name: "calendar_find_free_time",
    description: "Find open slots of at least `minutes` between two Phoenix dates within working hours, avoiding events and (optionally) gym/meal/wind-down routine blocks.",
    schema: z.object({ from: localDate, to: localDate, minutes: z.number().int().min(5).max(600), dayStart: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("HH:MM, default 07:00"), dayEnd: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("HH:MM, default 18:00"), skipWeekends: z.boolean().optional() }),
    actionType: "calendar.freeTime",
    kind: "read",
    summarize: (i) => `Find ${i.minutes}-minute slots ${i.from}–${i.to}`,
    run: async (i) => {
      const hm = (v: string | undefined, d: number) => (v ? Number(v.split(":")[0]) * 60 + Number(v.split(":")[1]) : d);
      const slots = await cal.findFreeTime({ from: i.from, to: i.to, durationMin: i.minutes, dayStartMin: hm(i.dayStart, 420), dayEndMin: hm(i.dayEnd, 1080), respectRoutine: true, skipWeekends: i.skipWeekends });
      return { result: slots.slice(0, 20).map((s) => ({ start: formatDateTime(s.start), end: formatTime(s.end), startIso: s.start.toISOString(), endIso: s.end.toISOString() })) };
    },
  }),
];

