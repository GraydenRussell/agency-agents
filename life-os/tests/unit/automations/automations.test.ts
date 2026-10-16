import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dispatchReminders, inboxCheck, runNamedJob } from "@/lib/automations";
import { buildDailyBrief, buildEveningWrap, buildWeeklyReview, publishBrief } from "@/lib/automations/briefs";
import { runJob } from "@/lib/automations/jobs";
import { resetMockCalendar } from "@/lib/integrations/google/calendar";
import { mockReceive, resetMockGmail } from "@/lib/integrations/google/gmail";
import { mockOutbox } from "@/lib/notify";
import { createReminder } from "@/lib/services/reminders";
import { setSetting } from "@/lib/services/settings";
import { createTask, setTaskStatus } from "@/lib/services/tasks";
import { atLocalMinutes, today } from "@/lib/time";
import { resetDb } from "../../setup/db";
import { GET as cronGET, POST as cronPOST } from "@/app/api/cron/[job]/route";

beforeEach(async () => {
  await resetDb();
  resetMockGmail();
  resetMockCalendar();
  mockOutbox().length = 0;
  await setSetting("notifications.quietHours", { start: "23:59", end: "00:00" }); // effectively off for tests
});

describe("job runner", () => {
  it("runs once per slot, retries failed slots", async () => {
    let n = 0;
    expect((await runJob("x", "s1", async () => `run ${++n}`)).status).toBe("ran");
    expect(await runJob("x", "s1", async () => `run ${++n}`)).toMatchObject({ status: "skipped" });
    expect(n).toBe(1);
    expect((await runJob("y", "s1", async () => { throw new Error("boom"); })).status).toBe("failed");
    expect((await runJob("y", "s1", async () => "recovered")).status).toBe("ran");
  });
});

describe("reminders", () => {
  it("sends due one-off reminders once and recurring ones again later", async () => {
    const now = new Date();
    await createReminder({ title: "Move truck", fireAt: new Date(now.getTime() + 1000), channels: ["SMS"] });
    await createReminder({ title: "Water plants", fireAt: new Date(now.getTime() + 1000), rrule: "FREQ=DAILY", channels: ["PUSH"] });
    const later = new Date(now.getTime() + 5000);
    expect(await dispatchReminders(later)).toBe("2/2 reminders sent");
    expect(await dispatchReminders(later)).toBe("0/0 reminders sent");
    const recurring = await db.reminder.findFirstOrThrow({ where: { title: "Water plants" } });
    expect(recurring.status).toBe("SCHEDULED");
    expect(recurring.nextFireAt && recurring.nextFireAt > later).toBe(true);
    expect((await db.reminder.findFirstOrThrow({ where: { title: "Move truck" } })).status).toBe("SENT");
    expect(mockOutbox().map((o) => o.channel).sort()).toEqual(["PUSH", "SMS"]);
  });

  it("quiet hours hold back push/SMS for non-urgent notices but reminders are urgent", async () => {
    await setSetting("notifications.quietHours", { start: "00:00", end: "23:59" });
    await createReminder({ title: "Ping", fireAt: new Date(Date.now() + 500), channels: ["PUSH"] });
    expect(await dispatchReminders(new Date(Date.now() + 2000))).toBe("1/1 reminders sent");
  });
});

describe("inbox check", () => {
  it("alerts once per high-priority thread and re-alerts only on new mail", async () => {
    await setSetting("notifications.highPriorityThreshold", 80);
    const first = await inboxCheck();
    expect(first).toMatch(/alerted [1-9]/);
    const alerts = mockOutbox().length;
    expect(await inboxCheck()).toMatch(/alerted 0/);
    expect(mockOutbox().length).toBe(alerts);
    mockReceive("Need a quote ASAP", { name: "Pat", email: "pat@example.com" }, "Can you give me a quote for windows today? Urgent.");
    expect(await inboxCheck()).toMatch(/alerted 1/);
  });
});

describe("briefs", () => {
  it("daily brief covers weather, schedule, priorities, inbox, business, overdue, suggestion", async () => {
    await createTask({ title: "Send Q3 numbers", priority: 1, dueAt: atLocalMinutes(today(), -600) });
    const b = await buildDailyBrief();
    for (const h of ["## Weather", "## Schedule", "## Suggested priorities", "## Inbox", "## Business", "## Overdue", "## One suggestion"]) expect(b.markdown).toContain(h);
    expect(b.markdown).toContain("Send Q3 numbers");
    expect(b.sms.length).toBeLessThanOrEqual(320);
    const msg = await publishBrief(b);
    expect(msg).toContain("sent via EMAIL");
    expect(await db.brief.count()).toBe(1);
  });

  it("evening wrap and weekly review summarize the day/week", async () => {
    const t = await createTask({ title: "Quote Gilbert job" });
    await setTaskStatus(t.id, "DONE");
    await createTask({ title: "Still open", dueAt: atLocalMinutes(today(), 600) });
    const e = await buildEveningWrap();
    expect(e.markdown).toContain("Quote Gilbert job");
    expect(e.markdown).toContain("Still open");
    const w = await buildWeeklyReview();
    expect(w.markdown).toContain("## Next week's focus");
    expect(w.markdown).toContain("1 tasks done");
  });

  it("the daily-brief job is idempotent per day", async () => {
    expect((await runNamedJob("daily-brief")).status).toBe("ran");
    expect((await runNamedJob("daily-brief")).status).toBe("skipped");
    expect((await runNamedJob("daily-brief", { force: true })).status).toBe("ran");
  });
});

describe("cron endpoint", () => {
  const params = (job: string) => ({ params: Promise.resolve({ job }) });
  it("rejects missing/wrong secrets and runs with either header style", async () => {
    expect((await cronPOST(new Request("http://x/api/cron/maintenance", { method: "POST" }), params("maintenance"))).status).toBe(401);
    expect((await cronPOST(new Request("http://x/api/cron/maintenance", { method: "POST", headers: { "x-cron-secret": "wrong-secret-0000000" } }), params("maintenance"))).status).toBe(401);
    const ok = await cronPOST(new Request("http://x/api/cron/maintenance", { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" } }), params("maintenance"));
    expect(ok.status).toBe(200);
    const vercel = await cronGET(new Request("http://x/api/cron/reminders", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }), params("reminders"));
    expect(vercel.status).toBe(200);
    expect((await cronPOST(new Request("http://x/api/cron/nope", { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" } }), params("nope"))).status).toBe(404);
  });
});
