import { PageHeader } from "@/components/shell/page-header";
import { CalendarView, type CalEvent, type RoutineBlockView, type View } from "@/components/calendar/calendar-view";
import { db } from "@/lib/db";
import { isGoogleConnected, listEvents, syncIfStale } from "@/lib/services/calendar";
import { addDays, endOfLocalDay, isoWeekday, monthRange, startOfLocalDay, today, weekRange } from "@/lib/time";

export const metadata = { title: "Calendar" };

function range(view: View, date: string): { days: string[]; prev: string; next: string } {
  if (view === "day") return { days: [date], prev: addDays(date, -1), next: addDays(date, 1) };
  if (view === "week") {
    const w = weekRange(date);
    return { days: Array.from({ length: 7 }, (_, i) => addDays(w.start, i)), prev: addDays(date, -7), next: addDays(date, 7) };
  }
  const m = monthRange(date);
  const start = weekRange(m.start).start;
  const end = weekRange(m.end).end;
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const [y, mo] = date.split("-").map(Number) as [number, number];
  const prev = mo === 1 ? `${y - 1}-12-01` : `${y}-${String(mo - 1).padStart(2, "0")}-01`;
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  return { days, prev, next };
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const view: View = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today();
  await syncIfStale();
  const r = range(view, date);
  const first = r.days[0] ?? date;
  const last = r.days[r.days.length - 1] ?? date;
  const [events, templates, tasks, connected, latest] = await Promise.all([
    listEvents(startOfLocalDay(first), endOfLocalDay(last)),
    db.routineTemplate.findMany({ where: { active: true }, include: { blocks: { orderBy: { startMin: "asc" } } } }),
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] }, scheduledStart: null }, orderBy: [{ priority: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }], take: 25 }),
    isGoogleConnected(),
    db.calendarSyncState.findFirst({ orderBy: { lastSyncAt: "desc" } }),
  ]);
  const routines: Record<string, RoutineBlockView[]> = {};
  for (const d of r.days) {
    const t = templates.find((x) => x.dayType === "CUSTOM" && x.days.includes(isoWeekday(d))) ?? templates.find((x) => x.days.includes(isoWeekday(d)));
    routines[d] = (t?.blocks ?? []).map((b) => ({ id: b.id, title: b.title, kind: b.kind, startMin: b.startMin, endMin: b.endMin }));
  }
  const cal: CalEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    location: e.location,
    description: e.description,
    attendees: Array.isArray(e.attendees) ? (e.attendees as CalEvent["attendees"]) : [],
    source: e.source,
    taskId: e.taskId,
    dirty: e.dirty,
  }));
  return (
    <>
      <PageHeader title="Calendar" />
      <CalendarView view={view} date={date} days={r.days} events={cal} routines={routines} tasks={tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, estimateMinutes: t.estimateMinutes }))} nav={{ prev: r.prev, next: r.next }} connected={connected} lastSyncAt={latest?.lastSyncAt?.toISOString() ?? null} />
    </>
  );
}
