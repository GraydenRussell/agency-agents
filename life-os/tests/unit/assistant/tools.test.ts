import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { approve, executeTool, reject, undoActivity, type ExecResult } from "@/lib/assistant/executor";
import { toAnthropicTool } from "@/lib/assistant/registry";
import { TOOLS } from "@/lib/assistant/tools";
import { resetMockCalendar } from "@/lib/integrations/google/calendar";
import { mockSentMessages, resetMockGmail } from "@/lib/integrations/google/gmail";
import { syncAndTriage } from "@/lib/services/mail";
import { setSetting } from "@/lib/services/settings";
import { createTask } from "@/lib/services/tasks";
import { addDays, today } from "@/lib/time";
import { resetDb } from "../../setup/db";

const ctx = { actor: "ASSISTANT" as const };
const run = (name: string, input: unknown) => executeTool(name, input, ctx);
function ok(r: ExecResult) {
  if (r.status !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r;
}
function pending(r: ExecResult) {
  if (r.status !== "pending_approval") throw new Error(`expected pending, got ${JSON.stringify(r)}`);
  return r;
}
const tomorrowAt = (h: number) => `${addDays(today(), 1)}T${String(h).padStart(2, "0")}:00:00-07:00`;

beforeEach(async () => {
  await resetDb();
  resetMockGmail();
  resetMockCalendar();
});

describe("tool definitions", () => {
  it("every tool converts to a valid Anthropic tool schema with unique names", () => {
    const names = new Set<string>();
    for (const t of TOOLS) {
      const a = toAnthropicTool(t);
      expect(a.input_schema.type).toBe("object");
      expect((a.description ?? "").length).toBeGreaterThan(10);
      expect(names.has(a.name)).toBe(false);
      names.add(a.name);
    }
    expect(names.size).toBeGreaterThanOrEqual(28);
  });

  it("rejects invalid input and unknown tools", async () => {
    expect(await run("task_create", { title: "" })).toMatchObject({ status: "error" });
    expect(await run("nope", {})).toMatchObject({ status: "error", error: "Unknown tool: nope" });
  });
});

describe("tasks & planning tools", () => {
  it("create → log → undo", async () => {
    const r = ok(await run("task_create", { title: "Order squeegees", priority: 2, area: "BUSINESS", due: tomorrowAt(10) }));
    const log = await db.activityLog.findUniqueOrThrow({ where: { id: r.activityId } });
    expect(log).toMatchObject({ actor: "ASSISTANT", actionType: "task.create", ok: true });
    await undoActivity(r.activityId);
    expect(await db.task.count({ where: { deletedAt: null } })).toBe(0);
    await expect(undoActivity(r.activityId)).rejects.toThrow("Already undone");
  });

  it("update/complete with revert, list, prioritize, delete needs approval", async () => {
    const t = await createTask({ title: "Quote HOA", priority: 3 });
    const u = ok(await run("task_update", { taskId: t.id, priority: 1, title: "Quote Mesa HOA" }));
    await undoActivity(u.activityId);
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).title).toBe("Quote HOA");
    ok(await run("task_complete", { taskId: t.id }));
    expect((ok(await run("task_list", { status: "DONE" })).result as unknown[]).length).toBe(1);
    ok(await run("task_prioritize", { top3TaskIds: [t.id] }));
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).top3Date).toBe(today());
    const p = pending(await run("task_delete", { taskId: t.id }));
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).deletedAt).toBeNull();
    ok(await approve(p.approvalId));
    expect((await db.task.findUniqueOrThrow({ where: { id: t.id } })).deletedAt).not.toBeNull();
  });

  it("plan_day returns context, then applies top3 + time blocks", async () => {
    const t = await createTask({ title: "Write SOP", estimateMinutes: 60 });
    const ctxRes = ok(await run("plan_day", {}));
    expect((ctxRes.result as { openTasks: unknown[] }).openTasks.length).toBe(1);
    ok(await run("plan_day", { top3: [t.id], blocks: [{ taskId: t.id, start: tomorrowAt(8) }] }));
    const task = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(task.top3Date).toBe(today());
    expect(task.scheduledStart).not.toBeNull();
    expect(await db.calendarEvent.count({ where: { taskId: t.id } })).toBe(1);
    expect(ok(await run("plan_week", {})).result).toHaveProperty("freeSlots");
  });
});

describe("email tools", () => {
  beforeEach(async () => {
    await syncAndTriage();
  });
  const jen = async () => (await db.emailThread.findFirstOrThrow({ where: { subject: { contains: "Ocotillo" } } })).id;

  it("search, read, summarize, draft", async () => {
    const found = ok(await run("email_search", { view: "needs_reply" })).result as Array<{ subject: string }>;
    expect(found.some((f) => f.subject.includes("Ocotillo"))).toBe(true);
    const id = await jen();
    expect(ok(await run("email_read", { threadId: id })).result).toHaveProperty("messages");
    expect(ok(await run("email_summarize", { threadId: id })).result).toHaveProperty("summary");
    const d = ok(await run("email_draft_reply", { threadId: id, body: "Hi Jen, $350 inside+out. Thanks, Grayden" }));
    expect((d.result as { body: string }).body).toContain("$350");
  });

  it("sending requires approval; approve sends exactly once; reject never sends", async () => {
    const id = await jen();
    const p = pending(await run("email_send_reply", { threadId: id, body: "Hi Jen! Tuesday 9am works. Thanks, Grayden" }));
    expect(mockSentMessages().length).toBe(0);
    const approval = await db.pendingApproval.findUniqueOrThrow({ where: { id: p.approvalId } });
    expect(approval.summary).toContain("Tuesday 9am works");
    ok(await approve(p.approvalId));
    expect(mockSentMessages().length).toBe(1);
    expect(await approve(p.approvalId)).toMatchObject({ status: "error" });
    expect(mockSentMessages().length).toBe(1);

    const p2 = pending(await run("email_send_reply", { threadId: id, body: "second" }));
    expect(await reject(p2.approvalId, "not now")).toBe(true);
    expect(mockSentMessages().length).toBe(1);
    expect((await db.pendingApproval.findUniqueOrThrow({ where: { id: p2.approvalId } })).status).toBe("REJECTED");
  });

  it("auto-send only for allow-listed categories when enabled", async () => {
    await setSetting("approvals.autoApprove", { "email.send": true });
    const id = await jen(); // LEAD
    pending(await run("email_send_reply", { threadId: id, body: "x" })); // LEAD not allow-listed yet
    await setSetting("approvals.autoSendCategories", ["LEAD"]);
    ok(await run("email_send_reply", { threadId: id, body: "Thanks Jen!" }));
    expect(mockSentMessages().length).toBe(1);
  });

  it("archive/label are immediate and undoable; trash needs approval", async () => {
    const id = await jen();
    const a = ok(await run("email_archive", { threadId: id }));
    expect((await db.emailThread.findUniqueOrThrow({ where: { id } })).inInbox).toBe(false);
    await undoActivity(a.activityId);
    expect((await db.emailThread.findUniqueOrThrow({ where: { id } })).inInbox).toBe(true);
    ok(await run("email_label", { threadId: id, label: "Leads" }));
    pending(await run("email_trash", { threadId: id }));
  });
});

describe("calendar tools", () => {
  it("creates solo events immediately, gates guests and deletes, undoes moves", async () => {
    const solo = ok(await run("calendar_create_event", { title: "Gym", start: tomorrowAt(6), end: tomorrowAt(7) }));
    const eventId = (solo.result as { id: string }).id;
    pending(await run("calendar_create_event", { title: "Lunch", start: tomorrowAt(12), end: tomorrowAt(13), guests: ["tyce@example.com"] }));
    const mv = ok(await run("calendar_move_event", { eventId, start: tomorrowAt(7) }));
    await undoActivity(mv.activityId);
    const e = await db.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(e.start.toISOString()).toBe(new Date(tomorrowAt(6)).toISOString());
    const del = pending(await run("calendar_delete_event", { eventId }));
    ok(await approve(del.approvalId));
    expect((await db.calendarEvent.findUniqueOrThrow({ where: { id: eventId } })).deletedAt).not.toBeNull();
    expect((ok(await run("calendar_list_events", { from: addDays(today(), 1) })).result as unknown[]).length).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(ok(await run("calendar_find_free_time", { from: addDays(today(), 1), to: addDays(today(), 2), minutes: 60 })).result)).toBe(true);
  });
});

describe("reminders, notes, projects, business, memory", () => {
  it("reminder schedule/list/cancel(approval)", async () => {
    const r = ok(await run("reminder_schedule", { title: "Call Linda", at: tomorrowAt(9), channels: ["SMS"] }));
    expect((ok(await run("reminder_list", {})).result as unknown[]).length).toBe(1);
    const id = (r.result as { id: string }).id;
    const p = pending(await run("reminder_cancel", { reminderId: id }));
    ok(await approve(p.approvalId));
    expect((await db.reminder.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELED");
  });

  it("notes and journal with undo", async () => {
    ok(await run("note_create", { title: "Bundle pricing", body: "Screens + windows $40 off", tags: ["Pricing"] }));
    expect((ok(await run("note_search", { query: "screens" })).result as unknown[]).length).toBe(1);
    ok(await run("journal_append", { text: "first" }));
    const second = ok(await run("journal_append", { text: "second" }));
    await undoActivity(second.activityId);
    expect((await db.note.findFirstOrThrow({ where: { isJournal: true } })).body).toBe("first");
  });

  it("projects, business (mock), memory", async () => {
    await db.project.create({ data: { source: "MANUAL", name: "Life OS", status: "ACTIVE" } });
    expect(ok(await run("project_status", { project: "life" })).result).toMatchObject({ name: "Life OS" });
    ok(await run("project_add_next_step", { project: "Life OS", nextStep: "Ship phase 5" }));
    expect((await db.project.findFirstOrThrow()).nextStep).toBe("Ship phase 5");
    expect(ok(await run("business_numbers", {})).result).toHaveProperty("revenue");
    const m = ok(await run("memory_write", { key: "preference.meetings", value: "No meetings before 10am", kind: "PREFERENCE" }));
    await undoActivity(m.activityId);
    expect(await db.memory.count()).toBe(0);
  });

  it("forgetting a memory needs approval and can be undone", async () => {
    ok(await run("memory_write", { key: "person.tyce", value: "Business partner", kind: "PERSON" }));
    const p = pending(await run("memory_forget", { key: "person.tyce" }));
    expect(await db.memory.count()).toBe(1);
    const r = ok(await approve(p.approvalId));
    expect(await db.memory.count()).toBe(0);
    await undoActivity(r.activityId);
    expect(await db.memory.findUniqueOrThrow({ where: { key: "person.tyce" } })).toMatchObject({ value: "Business partner", kind: "PERSON" });
    expect(await run("memory_forget", { key: "nope" })).toMatchObject({ status: "error" });
  });

  it("undo runs at most once, even on concurrent taps", async () => {
    const t = ok(await run("task_create", { title: "Double tap" }));
    const results = await Promise.allSettled([undoActivity(t.activityId), undoActivity(t.activityId)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.activityLog.count({ where: { actionType: "activity.undo" } })).toBe(1);
  });

  it("enforces the per-minute tool-call limit", async () => {
    await setSetting("ai.maxToolCallsPerMinute", 2);
    ok(await run("task_list", {}));
    ok(await run("task_list", {}));
    expect(await run("task_list", {})).toMatchObject({ status: "error", error: expect.stringContaining("rate limit") });
  });
});
