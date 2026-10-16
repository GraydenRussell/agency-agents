import "server-only";
import { db } from "@/lib/db";
import { getWeather, type Weather } from "@/lib/integrations/weather";
import { businessConfigured, getBusinessSummary, type BusinessSummary } from "@/lib/integrations/business";
import { atLocalMinutes, endOfLocalDay, localDateOf, startOfLocalDay, today, type LocalDate } from "@/lib/time";
import { habitsWithStatus, type HabitStatus } from "./habits";
import { syncIfStale } from "./calendar";
import { checklistsForDate, templateForDate } from "./routines";
import { tasksForDay, type DayTasks } from "./tasks";

export type TimelineItem = {
  id: string;
  kind: "event" | "routine" | "task" | "job";
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  location?: string | null;
  href?: string;
  meta?: string;
};

export type InboxSummary = { unread: number; needsReply: number; highPriority: Array<{ id: string; subject: string; from: string; summary: string | null }>; connected: boolean };

export type TodayData = {
  date: LocalDate;
  timeline: TimelineItem[];
  tasks: DayTasks;
  habits: HabitStatus[];
  checklists: Awaited<ReturnType<typeof checklistsForDate>>;
  inbox: InboxSummary;
  weather: Weather | { error: string };
  brief: { markdown: string; createdAt: Date } | null;
  evening: { markdown: string; createdAt: Date } | null;
  business: BusinessSummary | null;
};

export async function buildTimeline(date: LocalDate, scheduledTasks: DayTasks["scheduled"], business: BusinessSummary | null = null): Promise<TimelineItem[]> {
  const start = startOfLocalDay(date);
  const end = endOfLocalDay(date);
  const [events, template] = await Promise.all([
    db.calendarEvent.findMany({ where: { deletedAt: null, start: { lt: end }, end: { gt: start } }, orderBy: { start: "asc" } }),
    templateForDate(date),
  ]);
  const items: TimelineItem[] = [
    ...events.map((e) => ({ id: e.id, kind: "event" as const, title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, href: `/calendar?event=${e.id}` })),
    ...(template?.blocks ?? []).map((b) => ({ id: b.id, kind: "routine" as const, title: b.title, start: atLocalMinutes(date, b.startMin), end: atLocalMinutes(date, b.endMin), meta: b.kind })),
    ...scheduledTasks
      .filter((t) => t.scheduledStart && !events.some((e) => e.taskId === t.id))
      .map((t) => ({ id: t.id, kind: "task" as const, title: t.title, start: t.scheduledStart as Date, end: t.scheduledEnd ?? new Date((t.scheduledStart as Date).getTime() + 30 * 60_000), href: `/tasks?task=${t.id}` })),
    // Housecall Pro jobs via the admin dashboard (only those on this date).
    ...(business?.jobs.today ?? [])
      .filter((j) => localDateOf(new Date(j.start)) === date)
      .map((j) => ({ id: j.id, kind: "job" as const, title: `Job: ${j.customer}`, start: new Date(j.start), end: j.end ? new Date(j.end) : new Date(new Date(j.start).getTime() + 90 * 60_000), location: j.address ?? null, href: "/business" })),
  ];
  return items.sort((a, b) => Number(b.allDay ?? false) - Number(a.allDay ?? false) || a.start.getTime() - b.start.getTime());
}

export async function inboxSummary(): Promise<InboxSummary> {
  const [unread, needsReply, high, account] = await Promise.all([
    db.emailThread.count({ where: { inInbox: true, unread: true } }),
    db.emailThread.count({ where: { inInbox: true, needsReply: true } }),
    db.emailThread.findMany({ where: { inInbox: true, priority: { gte: 70 }, OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }] }, orderBy: [{ priority: "desc" }, { lastMessageAt: "desc" }], take: 3 }),
    db.integrationAccount.findFirst({ where: { provider: "GOOGLE", status: "CONNECTED" } }),
  ]);
  return {
    unread,
    needsReply,
    highPriority: high.map((t) => ({ id: t.id, subject: t.subject, from: t.fromName ?? t.fromEmail, summary: t.summary })),
    connected: Boolean(account) || process.env.INTEGRATION_MODE !== "live",
  };
}

export async function getToday(date: LocalDate = today()): Promise<TodayData> {
  await syncIfStale(10 * 60_000);
  const [tasks, business] = await Promise.all([tasksForDay(date), businessConfigured() ? getBusinessSummary().catch(() => null) : Promise.resolve(null)]);
  const [timeline, habits, checklists, inbox, weather, brief, evening] = await Promise.all([
    buildTimeline(date, tasks.scheduled, business),
    habitsWithStatus(date),
    checklistsForDate(date),
    inboxSummary(),
    getWeather().catch((e: unknown) => ({ error: e instanceof Error ? e.message : "Weather unavailable" })),
    db.brief.findUnique({ where: { type_date: { type: "DAILY", date } }, select: { markdown: true, createdAt: true } }),
    db.brief.findUnique({ where: { type_date: { type: "EVENING", date } }, select: { markdown: true, createdAt: true } }),
  ]);
  return { date, timeline, tasks, habits, checklists, inbox, weather, brief, evening, business };
}
