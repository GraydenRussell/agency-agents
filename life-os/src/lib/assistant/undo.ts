import "server-only";
import { db } from "@/lib/db";
import type { MemoryKind } from "@/generated/prisma/client";
import * as cal from "@/lib/services/calendar";
import * as mail from "@/lib/services/mail";
import * as reminders from "@/lib/services/reminders";
import type { UndoSpec } from "./registry";

type Handler = (p: Record<string, unknown>) => Promise<unknown>;
const s = (v: unknown) => String(v);

/** Inverse operations referenced by ActivityLog.undo. */
const HANDLERS: Record<string, Handler> = {
  "task.softDelete": (p) => db.task.update({ where: { id: s(p.id) }, data: { deletedAt: new Date() } }),
  "task.restore": (p) => db.task.update({ where: { id: s(p.id) }, data: { deletedAt: null } }),
  "task.revert": (p) => db.task.update({ where: { id: s(p.id) }, data: p.data as object }),
  "note.delete": (p) => db.note.delete({ where: { id: s(p.id) } }),
  "note.restore": (p) => db.note.create({ data: p.data as never }),
  "journal.revert": (p) => db.note.update({ where: { id: s(p.id) }, data: { body: s(p.body) } }),
  "calendar.delete": (p) => cal.deleteEvent(s(p.id)),
  "calendar.restore": (p) => cal.restoreEvent(s(p.id)),
  "calendar.revert": (p) => cal.updateEvent(s(p.id), { start: new Date(s(p.start)), end: new Date(s(p.end)), title: p.title ? s(p.title) : undefined }),
  "email.unarchive": (p) => mail.unarchiveThread(s(p.id)),
  "email.unlabel": (p) => mail.labelThread(s(p.id), s(p.label), true),
  "email.untrash": (p) => mail.untrashThread(s(p.id)),
  "email.discardDraft": (p) => mail.discardDraft(s(p.threadId)),
  "reminder.cancel": (p) => reminders.cancelReminder(s(p.id)),
  "reminder.restore": (p) => reminders.restoreReminder(s(p.id)),
  "memory.delete": (p) => db.memory.delete({ where: { key: s(p.key) } }),
  "memory.revert": (p) => db.memory.update({ where: { key: s(p.key) }, data: { value: s(p.value) } }),
  "memory.restore": (p) =>
    db.memory.upsert({
      where: { key: s(p.key) },
      create: { key: s(p.key), value: s(p.value), kind: p.kind as MemoryKind, source: p.source ? s(p.source) : null },
      update: { value: s(p.value), kind: p.kind as MemoryKind },
    }),
  "project.revert": (p) => db.project.update({ where: { id: s(p.id) }, data: p.data as object }),
};

export async function runUndo(spec: UndoSpec) {
  const h = HANDLERS[spec.actionType];
  if (!h) throw new Error(`No undo handler for ${spec.actionType}`);
  await h(spec.payload);
}

export const UNDO_TYPES = Object.keys(HANDLERS);
