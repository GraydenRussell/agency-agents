import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { isValidRrule, nextOccurrence } from "@/lib/recurrence";

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(1000).nullish(),
  fireAt: z.coerce.date(),
  rrule: z
    .string()
    .nullish()
    .refine((v) => !v || isValidRrule(v), "Invalid recurrence rule"),
  channels: z.array(z.enum(["SMS", "PUSH", "EMAIL"])).min(1).default(["PUSH"]),
  linkedType: z.string().nullish(),
  linkedId: z.string().nullish(),
});
export type ReminderInput = z.input<typeof reminderInputSchema>;

export async function createReminder(input: ReminderInput) {
  const d = reminderInputSchema.parse(input);
  if (!d.rrule && d.fireAt.getTime() < Date.now() - 60_000) throw new Error("Reminder time is in the past");
  // For a recurring reminder whose start is in the past, begin at the next occurrence.
  const next = d.rrule && d.fireAt < new Date() ? (nextOccurrence(d.rrule, d.fireAt, new Date()) ?? d.fireAt) : d.fireAt;
  return db.reminder.create({ data: { ...d, nextFireAt: next } });
}

export async function listReminders(opts: { includeDone?: boolean } = {}) {
  return db.reminder.findMany({ where: opts.includeDone ? {} : { status: "SCHEDULED" }, orderBy: { nextFireAt: "asc" }, take: 200 });
}

export async function cancelReminder(id: string) {
  return db.reminder.update({ where: { id }, data: { status: "CANCELED" } });
}

export async function restoreReminder(id: string) {
  return db.reminder.update({ where: { id }, data: { status: "SCHEDULED" } });
}

/** After a fire: schedule the next occurrence or mark sent. */
export async function advanceReminder(id: string, firedAt: Date) {
  const r = await db.reminder.findUniqueOrThrow({ where: { id } });
  const next = r.rrule ? nextOccurrence(r.rrule, r.fireAt, firedAt) : null;
  return db.reminder.update({ where: { id }, data: next ? { nextFireAt: next, lastSentAt: firedAt, lastError: null } : { status: "SENT", lastSentAt: firedAt, nextFireAt: null, lastError: null } });
}
