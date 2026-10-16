"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import * as cal from "@/lib/services/calendar";

const refresh = () => revalidatePath("/", "layout");

export async function syncNowAction() {
  return runAction(async () => {
    const r = await cal.syncAll();
    refresh();
    if ("skipped" in r) return "Google Calendar isn't connected yet.";
    const pulled = r.pulled.reduce((n, p) => n + p.upserted + p.deleted, 0);
    const pushed = r.pushed.created + r.pushed.updated + r.pushed.deleted;
    return `Synced: ${pulled} change${pulled === 1 ? "" : "s"} from Google, ${pushed} sent${r.pushed.conflicts ? `, ${r.pushed.conflicts} conflict(s) resolved` : ""}.`;
  });
}

export async function createEventAction(input: cal.EventInput) {
  return runAction(async () => {
    const e = await cal.createEvent(input);
    refresh();
    return e.id;
  });
}

export async function updateEventAction(id: string, patch: Partial<cal.EventInput>) {
  return runAction(async () => {
    await cal.updateEvent(id, patch);
    refresh();
    return undefined;
  });
}

export async function deleteEventAction(id: string) {
  return runAction(async () => {
    await cal.deleteEvent(id);
    refresh();
    return undefined;
  });
}

export async function restoreEventAction(id: string) {
  return runAction(async () => {
    await cal.restoreEvent(id);
    refresh();
    return undefined;
  });
}

export async function scheduleTaskAction(taskId: string, startIso: string, durationMin?: number) {
  return runAction(async () => {
    await cal.scheduleTask(taskId, new Date(startIso), durationMin);
    refresh();
    return undefined;
  });
}

export async function setCalendarEnabledAction(calendarId: string, enabled: boolean) {
  return runAction(async () => {
    const { db } = await import("@/lib/db");
    await db.calendarSyncState.update({ where: { calendarId }, data: { enabled } });
    if (enabled) await cal.syncCalendar(calendarId);
    refresh();
    return undefined;
  });
}
