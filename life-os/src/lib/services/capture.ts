import "server-only";
import { db } from "@/lib/db";
import { parseCapture, type ParsedCapture } from "@/lib/capture/parse";
import { today } from "@/lib/time";
import { createTask } from "./tasks";
import { appendJournal, createNote } from "./notes";

export type CaptureResult = {
  kind: ParsedCapture["kind"];
  id: string;
  title: string;
  href: string;
  /** Human summary for the toast. */
  message: string;
};

/** Files a parsed capture into the right table. `override` lets the UI change the detected kind. */
export async function commitCapture(parsed: ParsedCapture): Promise<CaptureResult> {
  switch (parsed.kind) {
    case "task": {
      const t = await createTask({ title: parsed.title, priority: parsed.priority, area: parsed.area, dueAt: parsed.at ?? null });
      return { kind: "task", id: t.id, title: t.title, href: `/tasks?task=${t.id}`, message: "Task added" };
    }
    case "note": {
      const n = await createNote({ title: parsed.title, body: parsed.body ?? "", tags: parsed.tags });
      return { kind: "note", id: n.id, title: n.title, href: `/notes/${n.id}`, message: "Note saved" };
    }
    case "journal": {
      const j = await appendJournal(today(), parsed.body ?? parsed.title);
      return { kind: "journal", id: j.id, title: "Journal", href: `/notes?tab=journal`, message: "Added to today's journal" };
    }
    case "reminder": {
      const fireAt = parsed.at ?? new Date(Date.now() + 60 * 60_000);
      const r = await db.reminder.create({ data: { title: parsed.title, fireAt, nextFireAt: fireAt, channels: ["PUSH"] } });
      return { kind: "reminder", id: r.id, title: r.title, href: `/settings#reminders`, message: "Reminder scheduled" };
    }
    case "event": {
      const start = parsed.at ?? new Date();
      const end = parsed.end ?? new Date(start.getTime() + 3_600_000);
      const e = await db.calendarEvent.create({ data: { title: parsed.title, start, end, source: "LOCAL", dirty: true } });
      return { kind: "event", id: e.id, title: e.title, href: `/calendar?event=${e.id}`, message: "Event added" };
    }
  }
}

export async function captureText(text: string, kindOverride?: ParsedCapture["kind"]): Promise<CaptureResult> {
  const parsed = parseCapture(text);
  return commitCapture(kindOverride ? { ...parsed, kind: kindOverride, body: parsed.body ?? (kindOverride === "journal" ? text : undefined) } : parsed);
}
