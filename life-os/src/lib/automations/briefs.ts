import "server-only";
import { db } from "@/lib/db";
import type { BriefType } from "@/generated/prisma/enums";
import { aiConfigured, assertBudget, getClient, models, recordUsage } from "@/lib/ai/client";
import { getBusinessSummary, type BusinessSummary } from "@/lib/integrations/business";
import { getWeather, type Weather } from "@/lib/integrations/weather";
import { notify, smsText, type ChannelName } from "@/lib/notify";
import { listEvents } from "@/lib/services/calendar";
import { goalTree, type GoalNode } from "@/lib/services/goals";
import { habitsWithStatus } from "@/lib/services/habits";
import { getSetting } from "@/lib/services/settings";
import { addDays, endOfLocalDay, formatLocalDate, formatTime, startOfLocalDay, today, weekRange, type LocalDate } from "@/lib/time";
import { formatUsd } from "@/lib/utils";

export type BriefResult = { type: BriefType; date: LocalDate; markdown: string; sms: string; content: Record<string, unknown> };

const bullets = (items: string[], empty = "None") => (items.length ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`);

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error("[brief]", e);
    return null;
  }
}

/** One short, specific suggestion. AI when available; otherwise a rule of thumb from the data. */
async function suggestion(kind: string, facts: string, fallback: string): Promise<string> {
  if (!aiConfigured()) return fallback;
  try {
    await assertBudget();
    const model = models.fast();
    const r = await getClient().messages.create({
      model,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system: "You are Grayden's chief of staff (window-cleaning business owner in Chandler, AZ). Give ONE specific, actionable suggestion in a single sentence (max 30 words). No preamble.",
      messages: [{ role: "user", content: `${kind}\n${facts}` }],
    });
    await recordUsage(model, `brief.${kind}`, r.usage);
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

export async function buildDailyBrief(date: LocalDate = today()): Promise<BriefResult> {
  const start = startOfLocalDay(date);
  const end = endOfLocalDay(date);
  const [weather, events, top3, topOpen, overdue, replies, business] = await Promise.all([
    safe<Weather>(() => getWeather()),
    listEvents(start, end),
    db.task.findMany({ where: { top3Date: date, deletedAt: null } }),
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] }, OR: [{ dueAt: { lt: end } }, { priority: { lte: 2 } }] }, orderBy: [{ priority: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }], take: 3 }),
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] }, dueAt: { lt: start } }, orderBy: { dueAt: "asc" }, take: 5 }),
    db.emailThread.findMany({ where: { inInbox: true, needsReply: true }, orderBy: [{ priority: { sort: "desc", nulls: "last" } }], take: 5 }),
    safe<BusinessSummary>(() => getBusinessSummary()),
  ]);
  const replyCount = await db.emailThread.count({ where: { inInbox: true, needsReply: true } });
  const overdueCount = await db.task.count({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] }, dueAt: { lt: start } } });
  const priorities = top3.length ? top3 : topOpen;
  const jobs = business?.jobs.today ?? [];

  const scheduleLines = [
    ...events.filter((e) => !e.allDay).map((e) => ({ at: e.start, line: `${formatTime(e.start)} ${e.title}${e.location ? ` (${e.location})` : ""}` })),
    ...jobs.map((j) => ({ at: new Date(j.start), line: `${formatTime(new Date(j.start))} Job: ${j.customer}${j.address ? `, ${j.address}` : ""}` })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((x) => x.line);
  const allDay = events.filter((e) => e.allDay).map((e) => `All day: ${e.title}`);

  const fallback =
    weather && weather.today.highF >= 100
      ? `It's ${Math.round(weather.today.highF)}°F today: front-load exterior jobs before 11 AM and keep the afternoon for quotes and admin.`
      : overdueCount > 0
        ? `Clear the oldest overdue item ("${overdue[0]?.title ?? "overdue task"}") first; it's been waiting the longest.`
        : replyCount > 0
          ? `Reply to ${replies[0]?.fromName ?? replies[0]?.fromEmail ?? "the top email"} first; leads cool off fast.`
          : "Protect your 7:30–10:30 deep-work block for the biggest business task.";
  const tip = await suggestion("daily brief", `Weather: ${weather ? `${weather.today.highF}F high, ${weather.advice.join(" ")}` : "n/a"}. Schedule: ${scheduleLines.join("; ") || "open"}. Priorities: ${priorities.map((t) => t.title).join("; ")}. Overdue: ${overdueCount}. Emails needing reply: ${replyCount}.`, fallback);

  const md = [
    `## Weather`,
    weather ? `${Math.round(weather.current.tempF)}°F now, high ${Math.round(weather.today.highF)}° / low ${Math.round(weather.today.lowF)}°, wind up to ${Math.round(weather.today.windMaxMph)} mph.\n${bullets(weather.advice)}` : "Unavailable.",
    `## Schedule`,
    bullets([...allDay, ...scheduleLines], "Nothing scheduled"),
    `## ${top3.length ? "Top 3" : "Suggested priorities"}`,
    bullets(priorities.map((t) => t.title)),
    `## Inbox`,
    `${replyCount} need${replyCount === 1 ? "s" : ""} a reply.\n${bullets(replies.slice(0, 3).map((r) => `${r.fromName ?? r.fromEmail}: ${r.summary ?? r.subject}`), "Inbox zero")}`,
    `## Business`,
    business ? `${formatUsd(business.revenue.today)} today · ${formatUsd(business.revenue.wtd)} this week · ${formatUsd(business.revenue.mtd)} this month\n${jobs.length} jobs today · ${business.leads.new24h} new leads (24h) · ${business.leads.open} open` : "Admin dashboard not connected.",
    `## Overdue`,
    bullets(overdue.map((t) => t.title), "Nothing overdue"),
    `## One suggestion`,
    tip,
  ].join("\n\n");
  const sms = smsText({ title: `Brief ${formatLocalDate(date)}`, body: `${weather ? `${Math.round(weather.today.highF)}°F. ` : ""}${scheduleLines.length} on schedule. Top: ${priorities.map((t) => t.title).slice(0, 2).join("; ") || "none"}. ${replyCount} to reply, ${overdueCount} overdue. ${tip}`, url: "/today" }, 320);
  return { type: "DAILY", date, markdown: md, sms, content: { weather, schedule: scheduleLines, priorities: priorities.map((t) => t.title), replyCount, overdueCount, business, tip } };
}

export async function buildEveningWrap(date: LocalDate = today()): Promise<BriefResult> {
  const start = startOfLocalDay(date);
  const end = endOfLocalDay(date);
  const [done, rolled, top3, tomorrowEvents, habits] = await Promise.all([
    db.task.findMany({ where: { deletedAt: null, completedAt: { gte: start, lt: end } }, orderBy: { completedAt: "asc" } }),
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] }, dueAt: { lt: end } }, orderBy: { dueAt: "asc" }, take: 10 }),
    db.task.findMany({ where: { top3Date: date, deletedAt: null } }),
    listEvents(startOfLocalDay(addDays(date, 1)), endOfLocalDay(addDays(date, 1))),
    habitsWithStatus(date),
  ]);
  const top3Done = top3.filter((t) => t.status === "DONE").length;
  const habitsHit = habits.filter((h) => h.cadence === "DAILY" && h.todayValue >= h.target).length;
  const md = [
    `## Done today (${done.length})`,
    bullets(done.map((t) => t.title), "Nothing checked off"),
    `## Top 3`,
    top3.length ? `${top3Done}/${top3.length} complete` : "No Top 3 set today.",
    `## Rolling over (${rolled.length})`,
    bullets(rolled.map((t) => t.title), "Nothing open. Nice."),
    `## Habits`,
    `${habitsHit}/${habits.filter((h) => h.cadence === "DAILY").length} daily habits hit.`,
    `## Tomorrow`,
    bullets(tomorrowEvents.filter((e) => !e.allDay).map((e) => `${formatTime(e.start)} ${e.title}`), "No events yet"),
    `**Plan tomorrow:** pick your Top 3 on the Today page (or ask the assistant to "plan my day tomorrow"). Open items can be moved to tomorrow in one tap.`,
  ].join("\n\n");
  const sms = smsText({ title: "Evening wrap", body: `${done.length} done, ${rolled.length} rolling over. Pick tomorrow's Top 3.`, url: "/today" });
  return { type: "EVENING", date, markdown: md, sms, content: { done: done.map((t) => t.title), rolled: rolled.map((t) => ({ id: t.id, title: t.title })), top3Done } };
}

function flattenGoals(nodes: GoalNode[]): GoalNode[] {
  return nodes.flatMap((n) => [n, ...flattenGoals(n.children)]);
}

export async function buildWeeklyReview(date: LocalDate = today()): Promise<BriefResult> {
  const w = weekRange(date);
  const start = startOfLocalDay(w.start);
  const end = endOfLocalDay(w.end);
  const [completed, tree, habits, next] = await Promise.all([
    db.task.findMany({ where: { deletedAt: null, completedAt: { gte: start, lt: end } }, orderBy: [{ priority: "asc" }] }),
    goalTree(),
    habitsWithStatus(date),
    db.task.findMany({ where: { deletedAt: null, parentId: null, status: { in: ["TODO", "DOING"] } }, orderBy: [{ priority: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }], take: 8 }),
  ]);
  const goals = flattenGoals(tree).filter((g) => g.level !== "WEEK" || (g.periodEnd >= start && g.periodStart <= end));
  const wins = completed.filter((t) => t.priority <= 2).slice(0, 6);
  const fallback = next[0] ? `Make "${next[0].title}" the first deep-work block Monday.` : "Set three weekly goals before Monday.";
  const focus = await suggestion("weekly review", `Goals: ${goals.map((g) => `${g.title} ${Math.round(g.progress)}%`).join("; ")}. Completed ${completed.length} tasks. Open top: ${next.map((t) => t.title).join("; ")}.`, fallback);
  const md = [
    `## Goals`,
    bullets(goals.map((g) => `${g.level === "YEAR" ? "Year" : g.level === "QUARTER" ? "Quarter" : "Week"}: ${g.title} — ${Math.round(g.progress)}%`), "No goals set"),
    `## Wins (${completed.length} tasks done)`,
    bullets(wins.map((t) => t.title), completed.length ? `${completed.length} tasks completed` : "No tasks completed"),
    `## Habits`,
    bullets(habits.map((h) => `${h.name}: ${h.streak}-${h.cadence === "DAILY" ? "day" : "week"} streak`)),
    `## Next week's focus`,
    focus,
    bullets(next.slice(0, 5).map((t) => t.title)),
  ].join("\n\n");
  const sms = smsText({ title: "Weekly review", body: `${completed.length} tasks done this week. Focus: ${focus}`, url: "/goals" });
  return { type: "WEEKLY", date, markdown: md, sms, content: { completed: completed.length, goals: goals.map((g) => ({ title: g.title, progress: g.progress })), focus } };
}

/** Saves the brief (shown on Today) and delivers it on the configured channels. */
export async function publishBrief(b: BriefResult): Promise<string> {
  const channels = (await getSetting("notifications.briefChannels")) as ChannelName[];
  await db.brief.upsert({
    where: { type_date: { type: b.type, date: b.date } },
    create: { type: b.type, date: b.date, markdown: b.markdown, content: JSON.parse(JSON.stringify(b.content)), deliveredVia: [] },
    update: { markdown: b.markdown, content: JSON.parse(JSON.stringify(b.content)) },
  });
  const title = b.type === "DAILY" ? `Daily brief · ${formatLocalDate(b.date, { weekday: true })}` : b.type === "EVENING" ? "Evening wrap-up" : "Weekly review";
  const results = await notify({ title, body: b.markdown.replace(/^## /gm, "").replace(/\*\*/g, ""), sms: b.sms, url: b.type === "WEEKLY" ? "/goals" : "/today", channels, urgent: false, tag: `brief-${b.type}` });
  const delivered = results.filter((r) => r.ok).map((r) => r.channel);
  await db.brief.update({ where: { type_date: { type: b.type, date: b.date } }, data: { deliveredVia: delivered } });
  return `${title} saved${delivered.length ? `, sent via ${delivered.join(", ")}` : ""}`;
}
