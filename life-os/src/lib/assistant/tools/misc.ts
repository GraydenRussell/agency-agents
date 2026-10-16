import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { BusinessNotConfiguredError, getBusinessSummary } from "@/lib/integrations/business";
import * as notes from "@/lib/services/notes";
import * as projects from "@/lib/services/projects";
import * as reminders from "@/lib/services/reminders";
import { formatDateTime, today } from "@/lib/time";
import { defineTool } from "../registry";

const iso = z.string().describe("ISO 8601 with offset (Phoenix is -07:00)");

export const reminderTools = [
  defineTool({
    name: "reminder_schedule",
    description: "Schedule a reminder at a time, optionally recurring (RRULE, e.g. FREQ=DAILY or FREQ=WEEKLY;BYDAY=MO,WE). Channels: PUSH (default), SMS, EMAIL.",
    schema: z.object({ title: z.string().min(1).max(200), body: z.string().max(1000).optional(), at: iso, rrule: z.string().optional(), channels: z.array(z.enum(["PUSH", "SMS", "EMAIL"])).min(1).optional() }),
    actionType: "reminder.create",
    kind: "write",
    summarize: (i) => `Remind "${i.title}" at ${formatDateTime(new Date(i.at))}${i.rrule ? ` (repeats)` : ""} via ${(i.channels ?? ["PUSH"]).join("/")}`,
    run: async (i) => {
      const r = await reminders.createReminder({ title: i.title, body: i.body, fireAt: i.at, rrule: i.rrule, channels: i.channels ?? ["PUSH"] });
      return { result: { id: r.id, next: r.nextFireAt ? formatDateTime(r.nextFireAt) : null }, undo: { actionType: "reminder.cancel", payload: { id: r.id } } };
    },
  }),
  defineTool({
    name: "reminder_list",
    description: "List scheduled reminders.",
    schema: z.object({}),
    actionType: "reminder.list",
    kind: "read",
    summarize: () => "List reminders",
    run: async () => ({ result: (await reminders.listReminders()).map((r) => ({ id: r.id, title: r.title, next: r.nextFireAt ? formatDateTime(r.nextFireAt) : null, recurring: Boolean(r.rrule), channels: r.channels })) }),
  }),
  defineTool({
    name: "reminder_cancel",
    description: "Cancel a scheduled reminder. Requires approval by default.",
    schema: z.object({ reminderId: z.string() }),
    actionType: "reminder.cancel",
    kind: "write",
    approval: () => ({ key: "reminder.cancel" }),
    summarize: async (i) => `Cancel reminder "${(await db.reminder.findUnique({ where: { id: i.reminderId } }))?.title ?? i.reminderId}"`,
    run: async (i) => {
      await reminders.cancelReminder(i.reminderId);
      return { result: { canceled: true }, undo: { actionType: "reminder.restore", payload: { id: i.reminderId } } };
    },
  }),
];

export const noteTools = [
  defineTool({
    name: "note_create",
    description: "Create a note (Markdown body, optional tags).",
    schema: z.object({ title: z.string().min(1).max(200), body: z.string().max(50_000).optional(), tags: z.array(z.string()).max(20).optional() }),
    actionType: "note.create",
    kind: "write",
    summarize: (i) => `Create note "${i.title}"`,
    run: async (i) => {
      const n = await notes.createNote({ title: i.title, body: i.body ?? "", tags: (i.tags ?? []).map((t) => t.toLowerCase()) });
      return { result: { id: n.id }, undo: { actionType: "note.delete", payload: { id: n.id } } };
    },
  }),
  defineTool({
    name: "note_search",
    description: "Full-text search notes and journal entries.",
    schema: z.object({ query: z.string().min(1), journal: z.boolean().optional() }),
    actionType: "note.search",
    kind: "read",
    summarize: (i) => `Search notes for "${i.query}"`,
    run: async (i) => ({ result: (await notes.searchNotes(i.query, { journal: i.journal, limit: 10 })).map((n) => ({ id: n.id, title: n.title, date: n.journalDate, tags: n.tags, body: n.body.slice(0, 1500) })) }),
  }),
  defineTool({
    name: "journal_append",
    description: "Append text to today's (or a given date's) journal entry.",
    schema: z.object({ text: z.string().min(1).max(10_000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    actionType: "journal.append",
    kind: "write",
    summarize: (i) => `Add to journal (${i.date ?? today()})`,
    run: async (i) => {
      const date = i.date ?? today();
      const before = await notes.getJournal(date);
      const j = await notes.appendJournal(date, i.text);
      return { result: { id: j.id }, undo: before ? { actionType: "journal.revert", payload: { id: j.id, body: before.body } } : { actionType: "note.delete", payload: { id: j.id } } };
    },
  }),
];

export const projectTools = [
  defineTool({
    name: "project_status",
    description: "Report on Grayden's software projects (GitHub/Vercel). Give a name for one project, or omit to list all with status, last commit, deploy state, open issues, and next step.",
    schema: z.object({ project: z.string().optional() }),
    actionType: "project.status",
    kind: "read",
    summarize: (i) => (i.project ? `Status of ${i.project}` : "List projects"),
    run: async (i) => {
      const shape = (p: Awaited<ReturnType<typeof projects.listProjects>>[number]) => ({ id: p.id, name: p.name, status: p.status, description: p.description, stack: p.stack, lastCommit: p.lastCommitAt ? `${formatDateTime(p.lastCommitAt)}: ${p.lastCommitMsg ?? ""}` : null, openIssues: p.openIssues, deploy: p.deployUrl ? `${p.deployState ?? "unknown"} · ${p.deployUrl}` : null, nextStep: p.nextStep, notes: p.notes?.slice(0, 500) ?? null });
      if (i.project) {
        const p = await projects.findProject(i.project);
        if (!p) throw new Error(`No project matching "${i.project}"`);
        return { result: shape(p) };
      }
      return { result: (await projects.listProjects()).map(shape) };
    },
  }),
  defineTool({
    name: "project_add_next_step",
    description: "Set a project's next step (and optionally its status: ACTIVE, PAUSED, DONE, IDEA).",
    schema: z.object({ project: z.string(), nextStep: z.string().min(1).max(500), status: z.enum(["ACTIVE", "PAUSED", "DONE", "IDEA"]).optional() }),
    actionType: "project.update",
    kind: "write",
    summarize: (i) => `Set next step for ${i.project}: ${i.nextStep}`,
    run: async (i) => {
      const p = await projects.findProject(i.project);
      if (!p) throw new Error(`No project matching "${i.project}"`);
      await projects.updateProject(p.id, { nextStep: i.nextStep, status: i.status });
      return { result: { project: p.name, nextStep: i.nextStep }, undo: { actionType: "project.revert", payload: { id: p.id, data: { nextStep: p.nextStep, status: p.status } } } };
    },
  }),
];

export const businessTools = [
  defineTool({
    name: "business_numbers",
    description: "Rapid Window Cleaning numbers from the admin dashboard (Housecall Pro data): revenue today/week/month, today's jobs, leads.",
    schema: z.object({}),
    actionType: "business.read",
    kind: "read",
    summarize: () => "Pull business numbers",
    run: async () => {
      try {
        return { result: await getBusinessSummary() };
      } catch (e) {
        if (e instanceof BusinessNotConfiguredError) return { result: { error: e.message } };
        throw e;
      }
    },
  }),
];

export const memoryTools = [
  defineTool({
    name: "memory_write",
    description: "Remember a durable fact, preference, writing-style note, or person detail about Grayden for future conversations. Use a stable dotted key (e.g. preference.meetings, person.tyce). Overwrites the same key.",
    schema: z.object({ key: z.string().min(2).max(80).regex(/^[a-z0-9_.-]+$/), value: z.string().min(1).max(2000), kind: z.enum(["FACT", "PREFERENCE", "STYLE", "PERSON"]) }),
    actionType: "memory.write",
    kind: "write",
    summarize: (i) => `Remember ${i.key}: ${i.value}`,
    run: async (i) => {
      const before = await db.memory.findUnique({ where: { key: i.key } });
      await db.memory.upsert({ where: { key: i.key }, create: { key: i.key, value: i.value, kind: i.kind, source: "assistant" }, update: { value: i.value, kind: i.kind, source: "assistant" } });
      return { result: { saved: i.key }, undo: before ? { actionType: "memory.revert", payload: { key: i.key, value: before.value } } : { actionType: "memory.delete", payload: { key: i.key } } };
    },
  }),
  defineTool({
    name: "memory_forget",
    description: "Delete a remembered item by key (when Grayden says it's wrong or outdated).",
    schema: z.object({ key: z.string() }),
    actionType: "memory.forget",
    kind: "write",
    // Deleting anything needs approval by default.
    approval: () => ({ key: "memory.delete" }),
    summarize: async (i) => {
      const m = await db.memory.findUnique({ where: { key: i.key } });
      if (!m) throw new Error(`Nothing remembered under ${i.key}`);
      return `Forget ${i.key}: ${m.value}`;
    },
    run: async (i) => {
      const before = await db.memory.findUnique({ where: { key: i.key } });
      if (!before) throw new Error(`Nothing remembered under ${i.key}`);
      await db.memory.delete({ where: { key: i.key } });
      return { result: { forgot: i.key }, undo: { actionType: "memory.restore", payload: { key: before.key, value: before.value, kind: before.kind, source: before.source } } };
    },
  }),
];
