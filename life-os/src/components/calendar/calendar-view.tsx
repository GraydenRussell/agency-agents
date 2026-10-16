"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, Plus, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/components/ui/use-action";
import { atLocalMinutes, formatLocalDate, formatTime, localDateOf, localMinutes, minutesToLabel, today } from "@/lib/time";
import { cn } from "@/lib/utils";
import { scheduleTaskAction, syncNowAction, updateEventAction } from "@/app/(app)/calendar/actions";
import { EventDialog, type EventDraft } from "./event-dialog";
import { HOUR_PX, layoutDay, offsetToMinutes } from "./layout";

export type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  attendees: Array<{ email: string; name?: string; self?: boolean }>;
  source: string;
  taskId: string | null;
  dirty: boolean;
};
export type RoutineBlockView = { id: string; title: string; kind: string; startMin: number; endMin: number };
export type UnscheduledTask = { id: string; title: string; priority: number; estimateMinutes: number | null };
export type View = "day" | "week" | "month";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView(props: {
  view: View;
  date: string;
  days: string[];
  events: CalEvent[];
  routines: Record<string, RoutineBlockView[]>;
  tasks: UnscheduledTask[];
  nav: { prev: string; next: string };
  connected: boolean;
  lastSyncAt: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { pending, run } = useAction();
  const [dialog, setDialog] = useState<EventDraft | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Open an event from ?event=<id> (e.g. links from Today or the palette).
  const eventParam = params.get("event");
  const [openedParam, setOpenedParam] = useState<string | null>(null);
  if (eventParam && eventParam !== openedParam) {
    setOpenedParam(eventParam);
    const e = props.events.find((x) => x.id === eventParam);
    if (e) setDialog(toDraft(e));
  }

  const go = (q: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(q)) next.set(k, v);
    next.delete("event");
    router.push(`/calendar?${next.toString()}`);
  };

  const onDragStart = (e: DragStartEvent) => setDragLabel(String(e.active.data.current?.title ?? ""));
  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null);
    const overDate = e.over?.data.current?.date as string | undefined;
    const data = e.active.data.current as { type: "event" | "task"; id: string; durationMin: number } | undefined;
    if (!overDate || !data || !e.over) return;
    const activator = e.activatorEvent as PointerEvent;
    const pointerY = activator.clientY + e.delta.y;
    // Events keep the point you grabbed them by; tasks start where the pointer drops.
    const initialTop = e.active.rect.current.initial?.top;
    const grabOffset = data.type === "event" && initialTop !== undefined ? activator.clientY - initialTop : 0;
    const startMin = offsetToMinutes(pointerY - e.over.rect.top - grabOffset);
    const start = atLocalMinutes(overDate, startMin);
    if (data.type === "task") {
      run(() => scheduleTaskAction(data.id, start.toISOString(), data.durationMin), { success: `Time-blocked for ${formatTime(start)}` });
    } else {
      run(() => updateEventAction(data.id, { start, end: new Date(start.getTime() + data.durationMin * 60_000) }), { success: `Moved to ${formatLocalDate(overDate)} ${formatTime(start)}` });
    }
  };

  const title =
    props.view === "month"
      ? new Date(`${props.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      : props.view === "week"
        ? `${formatLocalDate(props.days[0] ?? props.date)} – ${formatLocalDate(props.days[props.days.length - 1] ?? props.date)}`
        : formatLocalDate(props.date, { weekday: true });

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => go({ date: props.nav.prev })}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => go({ date: today() })}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => go({ date: props.nav.next })}>
            <ChevronRight />
          </Button>
        </div>
        <h2 className="font-heading text-2xl tracking-wide">{title}</h2>
        <div className="flex-1" />
        <Tabs value={props.view} onValueChange={(v) => go({ view: v })}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => syncNowAction(), { success: (m) => m })} title={props.lastSyncAt ? `Last synced ${new Date(props.lastSyncAt).toLocaleTimeString()}` : "Never synced"}>
          <RefreshCw className={cn(pending && "animate-spin")} /> Sync
        </Button>
        <Button size="sm" onClick={() => setDialog(newDraft(props.date, 9 * 60))}>
          <Plus /> Event
        </Button>
      </div>

      {!props.connected && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          Google Calendar isn&apos;t connected. Events you create here are saved and will sync once you{" "}
          <Link href="/settings#integrations" className="underline">
            connect Google
          </Link>
          .
        </div>
      )}

      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {props.view === "month" ? (
            <MonthGrid date={props.date} days={props.days} events={props.events} onDay={(d) => go({ view: "day", date: d })} onEvent={(e) => setDialog(toDraft(e))} />
          ) : (
            <TimeGrid days={props.days} events={props.events} routines={props.routines} onEvent={(e) => setDialog(toDraft(e))} onSlot={(d, m) => setDialog(newDraft(d, m))} />
          )}
        </div>
        {props.view !== "month" && <TaskTray tasks={props.tasks} />}
      </div>

      <DragOverlay dropAnimation={null}>{dragLabel ? <div className="rounded-md border border-primary bg-card px-3 py-1.5 text-sm shadow-xl">{dragLabel}</div> : null}</DragOverlay>
      {dialog && <EventDialog draft={dialog} onClose={() => setDialog(null)} />}
    </DndContext>
  );
}

function toDraft(e: CalEvent): EventDraft {
  return { id: e.id, title: e.title, start: new Date(e.start), end: new Date(e.end), allDay: e.allDay, location: e.location ?? "", description: e.description ?? "", attendees: e.attendees.filter((a) => !a.self).map((a) => a.email).join(", "), source: e.source, taskId: e.taskId };
}
function newDraft(date: string, startMin: number): EventDraft {
  const start = atLocalMinutes(date, startMin);
  return { title: "", start, end: new Date(start.getTime() + 3_600_000), allDay: false, location: "", description: "", attendees: "", source: "LOCAL", taskId: null };
}

// ─────────────────────────── Time grid ───────────────────────────

function TimeGrid({ days, events, routines, onEvent, onSlot }: { days: string[]; events: CalEvent[]; routines: Record<string, RoutineBlockView[]>; onEvent: (e: CalEvent) => void; onSlot: (date: string, min: number) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: HOUR_PX * 5.5 });
  }, []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const allDay = (d: string) => events.filter((e) => e.allDay && localDateOf(new Date(e.start)) <= d && localDateOf(new Date(new Date(e.end).getTime() - 1)) >= d);
  const hasAllDay = days.some((d) => allDay(d).length > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/40">
      <div className="grid border-b border-border" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => {
          const isToday = d === today();
          return (
            <div key={d} className="border-l border-border px-2 py-2 text-center">
              <p className="text-[11px] text-muted-foreground uppercase">{DAY_LABELS[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]}</p>
              <p className={cn("mx-auto grid size-7 place-items-center rounded-full font-display text-lg", isToday && "bg-primary text-white")}>{Number(d.slice(8))}</p>
            </div>
          );
        })}
        {hasAllDay && (
          <>
            <div className="py-1 pr-1 text-right text-[10px] text-muted-foreground">all day</div>
            {days.map((d) => (
              <div key={d} className="space-y-0.5 border-l border-border p-0.5">
                {allDay(d).map((e) => (
                  <button key={e.id} type="button" onClick={() => onEvent(e)} className="block w-full truncate rounded bg-brand-azure/30 px-1.5 text-left text-[11px]">
                    {e.title}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
      <div ref={scroller} className="relative max-h-[70dvh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`, height: HOUR_PX * 24 }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : minutesToLabel(h * 60)}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d} date={d} events={events.filter((e) => !e.allDay && localDateOf(new Date(e.start)) === d)} routine={routines[d] ?? []} now={now} onEvent={onEvent} onSlot={onSlot} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({ date, events, routine, now, onEvent, onSlot }: { date: string; events: CalEvent[]; routine: RoutineBlockView[]; now: Date; onEvent: (e: CalEvent) => void; onSlot: (date: string, min: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { date } });
  const laid = useMemo(
    () =>
      layoutDay(
        events.map((e) => {
          const s = new Date(e.start);
          const en = new Date(e.end);
          const startMin = localMinutes(s);
          const endMin = localDateOf(en) > date ? 24 * 60 : localMinutes(en);
          return { item: e, startMin, endMin };
        }),
      ),
    [events, date],
  );
  const isToday = date === today();
  return (
    <div
      ref={setNodeRef}
      data-testid={`day-column-${date}`}
      className={cn("relative border-l border-border", isOver && "bg-primary/5")}
      onDoubleClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSlot(date, offsetToMinutes(e.clientY - rect.top));
      }}
    >
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: h * HOUR_PX }} />
      ))}
      {routine.map((b) => (
        <div key={b.id} className="absolute inset-x-0 border-l-2 border-muted-foreground/30 bg-muted/30 px-1 text-[10px] text-muted-foreground" style={{ top: (b.startMin / 60) * HOUR_PX, height: ((b.endMin - b.startMin) / 60) * HOUR_PX }}>
          {b.title}
        </div>
      ))}
      {laid.map((p) => (
        <EventBlock key={p.item.id} e={p.item} top={(p.startMin / 60) * HOUR_PX} height={Math.max(18, ((p.endMin - p.startMin) / 60) * HOUR_PX - 2)} left={`${(p.col / p.cols) * 100}%`} width={`calc(${100 / p.cols}% - 4px)`} onClick={() => onEvent(p.item)} />
      ))}
      {isToday && (
        <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: (localMinutes(now) / 60) * HOUR_PX }}>
          <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-red-500" />
        </div>
      )}
    </div>
  );
}

function EventBlock({ e, top, height, left, width, onClick }: { e: CalEvent; top: number; height: number; left: string; width: string; onClick: () => void }) {
  const durationMin = Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60_000);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `event:${e.id}`, data: { type: "event", id: e.id, durationMin, title: e.title } });
  const others = e.attendees.filter((a) => !a.self).length;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "absolute z-[5] overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-opacity",
        // Solid card base + tint so routine labels underneath don't bleed through.
        "bg-card",
        e.source === "TASK" ? "border-amber-400 bg-[linear-gradient(rgba(251,191,36,0.25),rgba(251,191,36,0.25))]" : "border-brand-azure bg-[linear-gradient(rgba(0,122,206,0.35),rgba(0,122,206,0.35))]",
        isDragging && "opacity-30",
      )}
      style={{ top, height, left, width }}
      title={`${e.title} · ${formatTime(new Date(e.start))}–${formatTime(new Date(e.end))}`}
    >
      <span className="block truncate font-medium">{e.title}</span>
      {height > 30 && (
        <span className="flex items-center gap-1 truncate text-muted-foreground">
          {formatTime(new Date(e.start))}
          {others > 0 && <Users className="size-3" />}
          {e.dirty && <span title="Not yet synced">•</span>}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────── Month ───────────────────────────

function MonthGrid({ date, days, events, onDay, onEvent }: { date: string; days: string[]; events: CalEvent[]; onDay: (d: string) => void; onEvent: (e: CalEvent) => void }) {
  const month = date.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-card/40 text-center text-[11px] text-muted-foreground uppercase">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = events.filter((e) => localDateOf(new Date(e.start)) === d);
          return (
            <div key={d} className={cn("min-h-24 border-r border-b border-border p-1", d.slice(0, 7) !== month && "bg-muted/20 text-muted-foreground")}>
              <button type="button" onClick={() => onDay(d)} className={cn("mb-0.5 grid size-6 place-items-center rounded-full text-xs", d === today() && "bg-primary text-white")}>
                {Number(d.slice(8))}
              </button>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <button key={e.id} type="button" onClick={() => onEvent(e)} className="block w-full truncate rounded bg-brand-azure/25 px-1 text-left text-[10px]">
                    {!e.allDay && <span className="text-muted-foreground">{formatTime(new Date(e.start)).replace(":00", "")} </span>}
                    {e.title}
                  </button>
                ))}
                {list.length > 3 && (
                  <button type="button" onClick={() => onDay(d)} className="text-[10px] text-muted-foreground">
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── Task tray ───────────────────────────

function TaskTray({ tasks }: { tasks: UnscheduledTask[] }) {
  return (
    <aside className="hidden w-56 shrink-0 xl:block">
      <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Drag to time-block</p>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No unscheduled tasks.</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <TrayTask key={t.id} task={t} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function TrayTask({ task }: { task: UnscheduledTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}`, data: { type: "task", id: task.id, durationMin: task.estimateMinutes ?? 30, title: task.title } });
  return (
    <li ref={setNodeRef} {...attributes} {...listeners} data-testid="tray-task" className={cn("flex cursor-grab items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm active:cursor-grabbing", isDragging && "opacity-40")}>
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      <Badge variant="outline" className="px-1 text-[10px]">
        {task.estimateMinutes ?? 30}m
      </Badge>
    </li>
  );
}
