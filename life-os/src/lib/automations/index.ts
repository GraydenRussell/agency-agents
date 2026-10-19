import "server-only";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/client";
import { expireOldApprovals } from "@/lib/assistant/executor";
import { pruneRateLimits } from "@/lib/assistant/rate-limit";
import { notify, channelStatus, type ChannelName } from "@/lib/notify";
import { syncAll as syncCalendars } from "@/lib/services/calendar";
import { generateDraft, syncAndTriage } from "@/lib/services/mail";
import { syncHousecallPro } from "@/lib/services/customers";
import { housecallConfigured } from "@/lib/integrations/housecall";
import { leadWatch } from "@/lib/services/leads";
import { syncProjects } from "@/lib/services/projects";
import { advanceReminder } from "@/lib/services/reminders";
import { getSetting } from "@/lib/services/settings";
import { formatTime, today, weekRange } from "@/lib/time";
import { buildDailyBrief, buildEveningWrap, buildWeeklyReview, publishBrief } from "./briefs";
import { runJob, type JobOutcome } from "./jobs";

export async function dispatchReminders(now: Date = new Date()): Promise<string> {
  const due = await db.reminder.findMany({ where: { status: "SCHEDULED", nextFireAt: { lte: now } }, orderBy: { nextFireAt: "asc" }, take: 50 });
  let sent = 0;
  for (const r of due) {
    // Claim the occurrence first so overlapping runs can't double-send.
    const claimed = await db.reminder.updateMany({ where: { id: r.id, status: "SCHEDULED", nextFireAt: r.nextFireAt }, data: { nextFireAt: new Date(8.64e15) } });
    if (claimed.count === 0) continue;
    const results = await notify({ title: `⏰ ${r.title}`, body: r.body ?? `Reminder for ${formatTime(r.fireAt)}`, channels: r.channels as ChannelName[], url: "/today", urgent: true, tag: `reminder-${r.id}` }, now);
    const ok = results.some((x) => x.ok);
    if (ok) {
      sent++;
      await advanceReminder(r.id, now);
    } else {
      await db.reminder.update({ where: { id: r.id }, data: { status: "FAILED", nextFireAt: r.nextFireAt, lastError: results.map((x) => `${x.channel}: ${x.error ?? x.skipped}`).join("; ") } });
    }
  }
  return `${sent}/${due.length} reminders sent`;
}

/** Every 30 min: sync + triage, draft replies for important threads, alert only for high-priority mail. */
export async function inboxCheck(): Promise<string> {
  const r = await syncAndTriage();
  if ("skipped" in r.sync) return r.sync.skipped ?? "skipped";
  const threshold = await getSetting("notifications.highPriorityThreshold");
  const urgent = await db.emailThread.findMany({
    where: { inInbox: true, notifiedAt: null, triagedAt: { not: null }, priority: { gte: threshold }, category: { notIn: ["SPAM", "NEWSLETTER"] }, OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }] },
    orderBy: { priority: "desc" },
    take: 5,
  });
  if (urgent.length) {
    const status = channelStatus();
    const subs = await db.pushSubscription.count();
    const channels: ChannelName[] = status.PUSH.ready && (subs > 0 || process.env.INTEGRATION_MODE !== "live") ? ["PUSH"] : status.SMS.ready ? ["SMS"] : ["EMAIL"];
    const lines = urgent.map((t) => `${t.fromName ?? t.fromEmail}: ${t.summary ?? t.subject}`);
    await notify({ title: urgent.length === 1 ? "Important email" : `${urgent.length} important emails`, body: lines.join("\n"), url: urgent.length === 1 ? `/inbox?thread=${urgent[0]?.id}` : "/inbox", channels, tag: "inbox" });
    await db.emailThread.updateMany({ where: { id: { in: urgent.map((t) => t.id) } }, data: { notifiedAt: new Date() } });
  }
  let drafted = 0;
  if (aiConfigured()) {
    const needing = await db.emailThread.findMany({ where: { inInbox: true, needsReply: true, priority: { gte: 60 }, drafts: { none: { status: "DRAFT" } } }, orderBy: { priority: "desc" }, take: 5 });
    for (const t of needing) {
      try {
        await generateDraft(t.id);
        drafted++;
      } catch (e) {
        console.error("[inbox.draft]", e);
        break; // most likely the spend cap; try again next run
      }
    }
  }
  return `synced ${r.sync.updated}, triaged ${r.triaged.length}, alerted ${urgent.length}, drafted ${drafted}`;
}

export async function maintenance(): Promise<string> {
  const expired = await expireOldApprovals();
  await pruneRateLimits();
  const old = await db.jobRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } });
  return `expired ${expired} approvals, pruned ${old.count} job runs`;
}

type JobDef = { label: string; schedule: string; slot: (now: Date) => string; run: (now: Date) => Promise<string> };
const minuteSlot = (now: Date, every: number) => {
  const d = new Date(Math.floor(now.getTime() / (every * 60_000)) * every * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Job catalog. Schedules are Phoenix time; see prisma/sql/cron.sql for the UTC crons. */
export const JOBS: Record<string, JobDef> = {
  "daily-brief": { label: "Daily brief", schedule: "6:00 AM daily", slot: (n) => today(n), run: async (n) => publishBrief(await buildDailyBrief(today(n))) },
  "evening-wrap": { label: "Evening wrap-up", schedule: "9:00 PM daily", slot: (n) => today(n), run: async (n) => publishBrief(await buildEveningWrap(today(n))) },
  "weekly-review": { label: "Weekly review", schedule: "Sunday 6:00 PM", slot: (n) => weekRange(today(n)).start, run: async (n) => publishBrief(await buildWeeklyReview(today(n))) },
  inbox: { label: "Inbox check", schedule: "every 30 min", slot: (n) => minuteSlot(n, 30), run: () => inboxCheck() },
  reminders: { label: "Reminders", schedule: "every minute", slot: (n) => minuteSlot(n, 1), run: (n) => dispatchReminders(n) },
  calendar: { label: "Calendar sync", schedule: "every 10 min", slot: (n) => minuteSlot(n, 10), run: async () => JSON.stringify(await syncCalendars()).slice(0, 300) },
  projects: { label: "Projects sync (GitHub + Vercel)", schedule: "hourly", slot: (n) => minuteSlot(n, 60), run: async () => JSON.stringify(await syncProjects()) },
  housecall: { label: "Housecall Pro sync (customers + jobs)", schedule: "every 30 min", slot: (n) => minuteSlot(n, 30), run: async () => (housecallConfigured() ? JSON.stringify(await syncHousecallPro()) : "skipped: HOUSECALL_PRO_API_KEY not set") },
  leads: { label: "Lead inbox: email leads + unanswered nudges", schedule: "every 5 min", slot: (n) => minuteSlot(n, 5), run: (n) => leadWatch(n) },
  maintenance: { label: "Maintenance", schedule: "daily 3:00 AM", slot: (n) => today(n), run: () => maintenance() },
};

export async function runNamedJob(name: string, opts: { now?: Date; force?: boolean } = {}): Promise<JobOutcome> {
  const job = JOBS[name];
  if (!job) return { status: "failed", error: `Unknown job ${name}` };
  const now = opts.now ?? new Date();
  // "Run now" from Settings uses a unique slot so it always runs.
  const slot = opts.force ? `manual-${now.toISOString()}` : job.slot(now);
  return runJob(name, slot, () => job.run(now));
}

