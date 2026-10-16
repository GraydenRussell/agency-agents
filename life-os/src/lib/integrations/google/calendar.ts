import "server-only";
import { z } from "zod";
import { addDays, atLocalMinutes, localDateOf, startOfLocalDay, today } from "@/lib/time";
import { isMock } from "../mode";
import { GoogleApiError, googleFetch } from "./oauth";

export type Attendee = { email: string; name?: string; responseStatus?: string; self?: boolean };

export type RemoteEvent = {
  googleId: string;
  calendarId: string;
  etag: string;
  status: "confirmed" | "tentative" | "cancelled";
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  attendees: Attendee[];
  updated: Date;
};

export type EventWrite = {
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  allDay?: boolean;
  attendees?: Attendee[];
};

export type RemoteCalendar = { id: string; summary: string; primary: boolean; writable: boolean; color: string | null };

export class SyncTokenExpiredError extends Error {
  constructor() {
    super("Calendar sync token expired; full resync required");
    this.name = "SyncTokenExpiredError";
  }
}
export class EtagMismatchError extends Error {
  constructor() {
    super("Event changed on Google since last sync");
    this.name = "EtagMismatchError";
  }
}

export interface CalendarProvider {
  listCalendars(): Promise<RemoteCalendar[]>;
  listEvents(calendarId: string, opts: { syncToken?: string | null; timeMin?: Date; timeMax?: Date }): Promise<{ events: RemoteEvent[]; nextSyncToken: string | null }>;
  getEvent(calendarId: string, googleId: string): Promise<RemoteEvent | null>;
  insertEvent(calendarId: string, e: EventWrite): Promise<RemoteEvent>;
  patchEvent(calendarId: string, googleId: string, e: Partial<EventWrite>, etag?: string | null): Promise<RemoteEvent>;
  deleteEvent(calendarId: string, googleId: string): Promise<void>;
}

// ─────────────────────────── Live (REST v3) ───────────────────────────

const BASE = "https://www.googleapis.com/calendar/v3";

const timeSchema = z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() });
const eventSchema = z.object({
  id: z.string(),
  etag: z.string().default(""),
  status: z.enum(["confirmed", "tentative", "cancelled"]).default("confirmed"),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: timeSchema.optional(),
  end: timeSchema.optional(),
  updated: z.string().optional(),
  attendees: z.array(z.object({ email: z.string(), displayName: z.string().optional(), responseStatus: z.string().optional(), self: z.boolean().optional() })).optional(),
});
type ApiEvent = z.infer<typeof eventSchema>;

/** All-day dates are calendar dates; we anchor them to Phoenix midnight. */
function fromApiTime(t: z.infer<typeof timeSchema> | undefined): { at: Date; allDay: boolean } {
  if (t?.dateTime) return { at: new Date(t.dateTime), allDay: false };
  if (t?.date) return { at: startOfLocalDay(t.date), allDay: true };
  return { at: new Date(0), allDay: false };
}

export function fromApiEvent(calendarId: string, e: ApiEvent): RemoteEvent {
  const s = fromApiTime(e.start);
  const en = fromApiTime(e.end);
  return {
    googleId: e.id,
    calendarId,
    etag: e.etag,
    status: e.status,
    title: e.summary ?? "(no title)",
    description: e.description ?? null,
    location: e.location ?? null,
    start: s.at,
    end: en.at.getTime() > 0 ? en.at : s.at,
    allDay: s.allDay,
    attendees: (e.attendees ?? []).map((a) => ({ email: a.email, name: a.displayName, responseStatus: a.responseStatus, self: a.self })),
    updated: e.updated ? new Date(e.updated) : new Date(),
  };
}

export function toApiEvent(e: Partial<EventWrite>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (e.title !== undefined) body.summary = e.title;
  if (e.description !== undefined) body.description = e.description ?? "";
  if (e.location !== undefined) body.location = e.location ?? "";
  if (e.start && e.end) {
    if (e.allDay) {
      body.start = { date: localDateOf(e.start) };
      // Google's all-day end date is exclusive.
      const endDate = localDateOf(new Date(e.end.getTime() - 1));
      body.end = { date: addDays(endDate, 1) };
    } else {
      body.start = { dateTime: e.start.toISOString(), timeZone: "America/Phoenix" };
      body.end = { dateTime: e.end.toISOString(), timeZone: "America/Phoenix" };
    }
  }
  if (e.attendees !== undefined) body.attendees = e.attendees.map((a) => ({ email: a.email, displayName: a.name }));
  return body;
}

async function ok(res: Response) {
  if (res.ok) return res;
  const text = await res.text().catch(() => "");
  throw new GoogleApiError(`Google Calendar ${res.status}: ${text.slice(0, 300)}`, res.status);
}

const liveProvider: CalendarProvider = {
  async listCalendars() {
    const res = await ok(await googleFetch(`${BASE}/users/me/calendarList?minAccessRole=reader`));
    const data = z
      .object({ items: z.array(z.object({ id: z.string(), summary: z.string().default(""), primary: z.boolean().optional(), accessRole: z.string(), backgroundColor: z.string().optional() })).default([]) })
      .parse(await res.json());
    return data.items.map((c) => ({ id: c.id, summary: c.summary, primary: Boolean(c.primary), writable: c.accessRole === "owner" || c.accessRole === "writer", color: c.backgroundColor ?? null }));
  },

  async listEvents(calendarId, opts) {
    const events: RemoteEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    do {
      const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
      if (opts.syncToken) params.set("syncToken", opts.syncToken);
      else {
        if (opts.timeMin) params.set("timeMin", opts.timeMin.toISOString());
        if (opts.timeMax) params.set("timeMax", opts.timeMax.toISOString());
      }
      if (pageToken) params.set("pageToken", pageToken);
      const res = await googleFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
      if (res.status === 410) throw new SyncTokenExpiredError();
      await ok(res);
      const data = z.object({ items: z.array(eventSchema).default([]), nextPageToken: z.string().optional(), nextSyncToken: z.string().optional() }).parse(await res.json());
      events.push(...data.items.map((e) => fromApiEvent(calendarId, e)));
      pageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { events, nextSyncToken };
  },

  async getEvent(calendarId, googleId) {
    const res = await googleFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleId)}`);
    if (res.status === 404 || res.status === 410) return null;
    await ok(res);
    return fromApiEvent(calendarId, eventSchema.parse(await res.json()));
  },

  async insertEvent(calendarId, e) {
    const sendUpdates = e.attendees?.length ? "all" : "none";
    const res = await ok(await googleFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`, { method: "POST", json: toApiEvent(e) }));
    return fromApiEvent(calendarId, eventSchema.parse(await res.json()));
  },

  async patchEvent(calendarId, googleId, e, etag) {
    const headers: Record<string, string> = etag ? { "if-match": etag } : {};
    const res = await googleFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleId)}?sendUpdates=all`, { method: "PATCH", json: toApiEvent(e), headers });
    if (res.status === 412) throw new EtagMismatchError();
    await ok(res);
    return fromApiEvent(calendarId, eventSchema.parse(await res.json()));
  },

  async deleteEvent(calendarId, googleId) {
    const res = await googleFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleId)}?sendUpdates=all`, { method: "DELETE" });
    if (res.status === 404 || res.status === 410) return;
    await ok(res);
  },
};

// ─────────────────────────── Mock ───────────────────────────

type MockState = { version: number; events: Map<string, RemoteEvent & { version: number }>; seeded: boolean };
const g = globalThis as unknown as { __mockCalendar?: MockState };

function mockState(): MockState {
  g.__mockCalendar ??= { version: 0, events: new Map(), seeded: false };
  const s = g.__mockCalendar;
  if (!s.seeded) {
    s.seeded = true;
    const t = today();
    const fixtures: Array<[number, number, number, string, string | null, Attendee[]]> = [
      [0, 8 * 60, 8 * 60 + 30, "Crew huddle", "Shop", [{ email: "tyce@example.com", name: "Tyce" }]],
      [0, 11 * 60, 12 * 60, "Estimate: 2-story in Ocotillo", "Ocotillo, Chandler", []],
      [0, 16 * 60, 16 * 60 + 30, "Call w/ Desert Pure (filters)", null, [{ email: "marcus@desertpure.example", name: "Marcus Reyes" }]],
      [1, 9 * 60, 12 * 60, "Commercial: Chandler Fashion Center storefronts", "3111 W Chandler Blvd", []],
      [2, 7 * 60, 8 * 60, "Long run", "Veterans Oasis Park", []],
      [3, 13 * 60, 14 * 60, "Interview: crew lead candidate", "Shop", [{ email: "candidate@example.com" }]],
      [-1, 15 * 60, 16 * 60, "Accountant check-in", "Zoom", []],
    ];
    for (const [d, s0, e0, title, location, attendees] of fixtures) {
      const id = `mock-${d}-${s0}`;
      s.version++;
      s.events.set(id, { googleId: id, calendarId: "primary", etag: `"${s.version}"`, status: "confirmed", title, description: null, location, start: atLocalMinutes(addDays(t, d), s0), end: atLocalMinutes(addDays(t, d), e0), allDay: false, attendees, updated: new Date(), version: s.version });
    }
  }
  return s;
}

/** Tests only. */
export function resetMockCalendar(seed = true) {
  g.__mockCalendar = { version: 0, events: new Map(), seeded: !seed };
}

/** Tests only: simulate a change made in Google directly. */
export function mockRemoteEdit(googleId: string, patch: Partial<RemoteEvent>) {
  const s = mockState();
  const e = s.events.get(googleId);
  if (!e) throw new Error("no such mock event");
  s.version++;
  s.events.set(googleId, { ...e, ...patch, etag: `"${s.version}"`, version: s.version, updated: new Date() });
}

const strip = ({ version: _v, ...e }: RemoteEvent & { version: number }): RemoteEvent => e;

const mockProvider: CalendarProvider = {
  async listCalendars() {
    return [
      { id: "primary", summary: "Grayden (sample)", primary: true, writable: true, color: "#007ace" },
      { id: "holidays", summary: "US Holidays (sample)", primary: false, writable: false, color: "#66ddfa" },
    ];
  },
  async listEvents(calendarId, opts) {
    const s = mockState();
    if (calendarId !== "primary") return { events: [], nextSyncToken: `v${s.version}` };
    const since = opts.syncToken ? Number(opts.syncToken.slice(1)) : -1;
    if (opts.syncToken && Number.isNaN(since)) throw new SyncTokenExpiredError();
    const events = [...s.events.values()]
      .filter((e) => e.version > since)
      .filter((e) => opts.syncToken || ((!opts.timeMin || e.end >= opts.timeMin) && (!opts.timeMax || e.start <= opts.timeMax)))
      .map(strip);
    return { events, nextSyncToken: `v${s.version}` };
  },
  async getEvent(_calendarId, googleId) {
    const e = mockState().events.get(googleId);
    return e ? strip(e) : null;
  },
  async insertEvent(calendarId, w) {
    const s = mockState();
    s.version++;
    const id = `mock-new-${s.version}-${Math.random().toString(36).slice(2, 7)}`;
    const e = { googleId: id, calendarId, etag: `"${s.version}"`, status: "confirmed" as const, title: w.title, description: w.description ?? null, location: w.location ?? null, start: w.start, end: w.end, allDay: Boolean(w.allDay), attendees: w.attendees ?? [], updated: new Date(), version: s.version };
    s.events.set(id, e);
    return strip(e);
  },
  async patchEvent(_calendarId, googleId, w, etag) {
    const s = mockState();
    const e = s.events.get(googleId);
    if (!e) throw new GoogleApiError("Not found", 404);
    if (etag && etag !== e.etag) throw new EtagMismatchError();
    s.version++;
    const next = { ...e, ...Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined)), etag: `"${s.version}"`, version: s.version, updated: new Date() } as RemoteEvent & { version: number };
    s.events.set(googleId, next);
    return strip(next);
  },
  async deleteEvent(_calendarId, googleId) {
    const s = mockState();
    const e = s.events.get(googleId);
    if (!e) return;
    s.version++;
    s.events.set(googleId, { ...e, status: "cancelled", version: s.version, etag: `"${s.version}"` });
  },
};

export function calendarProvider(): CalendarProvider {
  return isMock() ? mockProvider : liveProvider;
}
