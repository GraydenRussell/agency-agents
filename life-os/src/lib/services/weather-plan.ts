import "server-only";
import { db } from "@/lib/db";
import { dayRisks, isBadDay, suggestDay, type Risk } from "@/lib/business/weather-risk";
import { getNwsAlerts, getOutlook, type DayForecast, type NwsAlert } from "@/lib/integrations/outlook";
import { channelStatus, notify } from "@/lib/notify";
import { getSetting, setSetting } from "@/lib/services/settings";
import { createTask } from "@/lib/services/tasks";
import { addDays, atLocalMinutes, endOfLocalDay, formatLocalDate, isoWeekday, localDateOf, startOfLocalDay, today as todayLocal } from "@/lib/time";

export type PlanJob = { id: string; title: string; customer: string | null; phone: string | null; start: Date | null; total: number };
export type PlanDay = { date: string; weather: DayForecast | null; risks: Risk[]; jobs: PlanJob[]; suggestion: string | null };

/** Next 8 days: forecast, risks, booked jobs, and (for bad days with jobs) the best day to move them. */
export async function weatherPlan(today: string = todayLocal()): Promise<{ days: PlanDay[]; alerts: NwsAlert[]; error: string | null }> {
  let outlook: DayForecast[] = [], alerts: NwsAlert[] = [], error: string | null = null;
  try {
    [outlook, alerts] = await Promise.all([getOutlook(8), getNwsAlerts().catch(() => [] as NwsAlert[])]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Weather unavailable";
  }
  const end = addDays(today, 7);
  const jobs = await db.job.findMany({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledStart: { gte: startOfLocalDay(today), lt: endOfLocalDay(end) } }, include: { customer: { select: { name: true, phone: true } } }, orderBy: { scheduledStart: "asc" } });
  const base = [...Array(8)].map((_, i) => {
    const date = addDays(today, i);
    const weather = outlook.find((o) => o.date === date) ?? null;
    return { date, weather, risks: dayRisks(weather ?? undefined, alerts, date), jobs: jobs.filter((j) => j.scheduledStart && localDateOf(j.scheduledStart) === date).map((j) => ({ id: j.id, title: j.title, customer: j.customer?.name ?? null, phone: j.customer?.phone ?? null, start: j.scheduledStart, total: j.total })) };
  });
  const counts = base.map((d) => ({ date: d.date, risks: d.risks, jobCount: d.jobs.length }));
  return { days: base.map((d) => ({ ...d, suggestion: d.jobs.length && isBadDay(d.risks) ? suggestDay(d.date, counts, isoWeekday) : null })), alerts, error };
}

/**
 * Hourly: alert once per NWS warning that hits a day with jobs (urgent if it's today). Daily at 4 PM
 * (the slot passed in): heads-up for the next 3 days' risky job days.
 */
export async function weatherWatch(now: Date = new Date(), opts: { digest?: boolean } = {}): Promise<string> {
  const { days, error } = await weatherPlan(todayLocal(now));
  if (error) return `skipped: ${error}`;
  const st = channelStatus();
  const channels = st.PUSH.ready ? (["PUSH"] as const) : st.SMS.ready ? (["SMS"] as const) : (["EMAIL"] as const);
  const seen = new Set(await getSetting("weather.notifiedAlerts"));
  let alerted = 0;
  const alerts = await getNwsAlerts().catch(() => []);
  for (const a of alerts) {
    if (seen.has(a.id)) continue;
    const hit = days.find((d) => d.jobs.length && d.risks.some((r) => r.text.includes(`NWS ${a.event}`)));
    if (!hit) continue;
    const isToday = hit.date === todayLocal(now);
    await notify({ title: `⚠️ ${a.event}${isToday ? " today" : ` ${formatLocalDate(hit.date, { weekday: true })}`}`, body: `${hit.jobs.length} job${hit.jobs.length > 1 ? "s" : ""} booked${hit.suggestion ? `. Best day to move: ${formatLocalDate(hit.suggestion, { weekday: true })}` : ""}. ${a.headline}`, url: "/business/weather", channels: [...channels], urgent: isToday, tag: `wx-${a.id}` }, now);
    seen.add(a.id);
    alerted++;
  }
  if (alerted) await setSetting("weather.notifiedAlerts", [...seen].slice(-100));
  if (!opts.digest) return `${alerted} new warnings`;
  const risky = days.slice(1, 4).filter((d) => d.jobs.length && d.risks.length);
  if (!risky.length) return `${alerted} new warnings; no risky job days ahead`;
  await notify({ title: `Weather heads-up: ${risky.length} job day${risky.length > 1 ? "s" : ""}`, body: risky.map((d) => `${formatLocalDate(d.date, { weekday: true })}: ${d.risks.map((r) => r.text).join("; ")} (${d.jobs.length} jobs)${d.suggestion ? ` → try ${formatLocalDate(d.suggestion, { weekday: true })}` : ""}`).join("\n"), url: "/business/weather", channels: [...channels], tag: "wx-digest" }, now);
  return `${alerted} new warnings; digest for ${risky.length} days`;
}

/** Creates a task to call the customer about moving their job (Life OS never edits Housecall Pro). */
export async function rescheduleTask(jobId: string, toDate: string | null) {
  const j = await db.job.findUniqueOrThrow({ where: { id: jobId }, include: { customer: true } });
  const who = j.customer?.name ?? j.title;
  const from = j.scheduledStart ? formatLocalDate(localDateOf(j.scheduledStart), { weekday: true }) : "their day";
  const title = `Call ${who} about moving their ${from} cleaning${toDate ? ` to ${formatLocalDate(toDate, { weekday: true })}` : ""} (weather)`;
  return createTask({ title, notes: [j.customer?.phone && `Phone: ${j.customer.phone}`, "Then update the job in Housecall Pro."].filter(Boolean).join("\n"), priority: 1, area: "BUSINESS", dueAt: atLocalMinutes(todayLocal(), 17 * 60) });
}
